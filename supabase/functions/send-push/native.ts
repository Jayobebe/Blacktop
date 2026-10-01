// Push for the native store app. Its devices are stored like web ones in
// push_subscriptions, with the endpoint "fcm:<token>" (Android, Firebase Cloud
// Messaging HTTP v1) or "apns:<token>" (iOS, Apple Push Notification service),
// so every targeting rule (crews, nearby riders, weather areas) is shared.
//
// Off until the secrets are set; until then native devices are skipped:
// - FCM_SERVICE_ACCOUNT: the Firebase service account JSON (project_id,
//   client_email, private_key).
// - APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (the .p8 key's PEM text),
//   APNS_BUNDLE_ID (default com.blacktoplive.app), APNS_SANDBOX=1 for
//   development builds from Xcode.
import type { PushMessage } from './deliver.ts'
import type { SendOptions } from './webpush.ts'

export interface NativeResult {
  ok: boolean
  /** The token is dead: remove the device. */
  gone?: boolean
  status: number
}

const FCM_TOKEN = /^fcm:[A-Za-z0-9_:-]{20,1000}$/
const APNS_TOKEN = /^apns:[0-9a-fA-F]{64,200}$/

export const isNativeEndpoint = (endpoint: string) => FCM_TOKEN.test(endpoint) || APNS_TOKEN.test(endpoint)

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

function fcmAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')?.trim()
  if (!raw) return null
  try {
    const a = JSON.parse(raw) as ServiceAccount
    return a.project_id && a.client_email && a.private_key ? a : null
  } catch {
    console.warn('[send-push] FCM_SERVICE_ACCOUNT is not valid JSON')
    return null
  }
}

function apnsConfig() {
  const keyId = Deno.env.get('APNS_KEY_ID')?.trim()
  const teamId = Deno.env.get('APNS_TEAM_ID')?.trim()
  const key = Deno.env.get('APNS_PRIVATE_KEY')?.trim()
  if (!keyId || !teamId || !key) return null
  return {
    keyId,
    teamId,
    key,
    bundleId: Deno.env.get('APNS_BUNDLE_ID')?.trim() || 'com.blacktoplive.app',
    host: Deno.env.get('APNS_SANDBOX') === '1' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com',
  }
}

/** Whether this kind of native device can be sent to right now. */
export function nativeReady(endpoint: string): boolean {
  if (FCM_TOKEN.test(endpoint)) return fcmAccount() !== null
  if (APNS_TOKEN.test(endpoint)) return apnsConfig() !== null
  return false
}

// ── signing ────────────────────────────────────────────────────────────────

const enc = new TextEncoder()
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlJson = (v: unknown) => b64url(enc.encode(JSON.stringify(v)))

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
}

async function signJwt(header: object, claims: object, pem: string, alg: 'RS256' | 'ES256'): Promise<string> {
  const algorithm = alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : { name: 'ECDSA', namedCurve: 'P-256' }
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pem), algorithm, false, ['sign'])
  const input = `${b64urlJson(header)}.${b64urlJson(claims)}`
  const sig = await crypto.subtle.sign(
    alg === 'RS256' ? 'RSASSA-PKCS1-v1_5' : { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(input),
  )
  // WebCrypto's ECDSA signature is already r||s, which is what ES256 wants.
  return `${input}.${b64url(new Uint8Array(sig))}`
}

// Tokens are reused for most of their hour.
let googleToken: { value: string; until: number } | null = null
let appleJwt: { value: string; until: number } | null = null

async function googleAccessToken(a: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (googleToken && googleToken.until > now) return googleToken.value
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: a.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    a.private_key,
    'RS256',
  )
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`google oauth ${res.status}`)
  const { access_token, expires_in } = await res.json()
  googleToken = { value: access_token, until: now + Math.min(Number(expires_in) || 3600, 3600) - 300 }
  return access_token
}

async function appleToken(c: NonNullable<ReturnType<typeof apnsConfig>>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (appleJwt && appleJwt.until > now) return appleJwt.value
  const value = await signJwt({ alg: 'ES256', kid: c.keyId }, { iss: c.teamId, iat: now }, c.key, 'ES256')
  appleJwt = { value, until: now + 50 * 60 }
  return value
}

// ── sending ────────────────────────────────────────────────────────────────

export async function sendNative(endpoint: string, m: PushMessage, opts: SendOptions = {}): Promise<NativeResult> {
  const ttl = opts.ttl ?? 3600
  const data: Record<string, string> = {}
  if (m.url) data.url = m.url
  if (m.tag) data.tag = m.tag

  if (FCM_TOKEN.test(endpoint)) {
    const a = fcmAccount()
    if (!a) return { ok: false, status: 0 }
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await googleAccessToken(a)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: endpoint.slice(4),
          notification: { title: m.title, body: m.body },
          data,
          android: {
            priority: m.urgent || opts.urgency === 'high' ? 'HIGH' : 'NORMAL',
            ttl: `${ttl}s`,
            ...(opts.topic ? { collapse_key: opts.topic.slice(0, 64) } : {}),
            notification: {
              // Channels are made by the app (lib/nativePush): rescue calls are loud.
              channel_id: m.urgent ? 'rescue' : 'general',
              sound: 'default',
              ...(m.tag ? { tag: m.tag } : {}),
            },
          },
        },
      }),
    })
    if (res.ok) return { ok: true, status: res.status }
    const text = await res.text().catch(() => '')
    const gone = res.status === 404 || (res.status === 400 && /registration token|UNREGISTERED|INVALID_ARGUMENT/i.test(text))
    return { ok: false, gone, status: res.status }
  }

  if (APNS_TOKEN.test(endpoint)) {
    const c = apnsConfig()
    if (!c) return { ok: false, status: 0 }
    const headers: Record<string, string> = {
      authorization: `bearer ${await appleToken(c)}`,
      'apns-topic': c.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': m.urgent || opts.urgency === 'high' ? '10' : '5',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
    }
    const collapse = opts.topic ?? m.tag
    if (collapse) headers['apns-collapse-id'] = collapse.slice(0, 64)
    const res = await fetch(`${c.host}/3/device/${endpoint.slice(5)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        aps: {
          alert: { title: m.title, body: m.body },
          sound: 'default',
          ...(m.tag ? { 'thread-id': m.tag } : {}),
          // Breaks through Focus where the app has the Time Sensitive capability.
          'interruption-level': m.urgent ? 'time-sensitive' : 'active',
        },
        ...data,
      }),
    })
    if (res.ok) return { ok: true, status: res.status }
    const text = await res.text().catch(() => '')
    const gone = res.status === 410 || (res.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(text))
    return { ok: false, gone, status: res.status }
  }

  return { ok: false, status: 0 }
}
