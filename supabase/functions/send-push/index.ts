import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendWebPush, type SendOptions, type VapidKeys } from './webpush.ts'

/**
 * Push notifications for Blacktop (Web Push, works with the installed PWA).
 *
 *   { action: 'config' }  -> { publicKey }  VAPID key the browser subscribes with
 *   { action: 'test' }    -> sends a test notification to the caller's own devices
 *                            ({ delayed: true } sends it 10 s later)
 *
 * Every notification's text is written here, never taken from the caller, so a
 * client can't push arbitrary text to other riders. New notification types are
 * added as further actions once they're chosen.
 *
 * Needs three secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */

/** Supabase's edge runtime: keeps background work alive after the response. */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

/** What the service worker (public/push-sw.js) receives and shows. */
export interface PushMessage {
  title: string
  body: string
  /** Same tag replaces the previous notification instead of stacking. */
  tag?: string
  /** Opened when the notification is tapped. */
  url?: string
  /** Stays on screen until dismissed, with a strong vibration. */
  urgent?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token)
    if (authErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const userId = claims.claims.sub as string

    const vapid = vapidKeys()
    if (!vapid) return json({ error: 'push_not_configured' }, 503)

    const body = await req.json().catch(() => ({}))
    const action = typeof body?.action === 'string' ? body.action : ''

    if (action === 'config') {
      return json({ publicKey: vapid.publicKey })
    }

    if (action === 'test') {
      const { data: allowed, error: rateLimitErr } = await supabase.rpc('check_rate_limit', {
        _bucket: 'send-push-test',
        _max_requests: 5,
        _window_seconds: 600,
      })
      if (rateLimitErr || allowed === false) return json({ error: 'Too many requests' }, 429)

      const admin = adminClient()
      const send = () =>
        sendToUsers(admin, vapid, [userId], null, {
          title: 'Blacktop',
          body: "Notifications are on. You'll get alerts here even when Blacktop is closed.",
          tag: 'test',
          url: '/settings',
        }, { ttl: 300, urgency: 'high' })

      if (body?.delayed === true) {
        // "Test with the app closed": answer now, send in 10 s so the rider
        // has time to close Blacktop or lock the phone.
        const { count } = await admin
          .from('push_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
        const later = new Promise((r) => setTimeout(r, 10_000)).then(send).catch((e) => console.warn('[send-push] delayed test', e))
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(later)
        else await later
        return json({ queued: true, devices: count ?? 0 })
      }
      return json(await send())
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('[send-push]', err)
    return json({ error: 'Internal error' }, 500)
  }
})

function vapidKeys(): VapidKeys | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim()
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim()
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim() || 'https://convoy-comms.lovable.app'
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//

/**
 * Sends one message to every device of the given riders that opted into
 * `category` (null = any device with notifications on). Dead subscriptions are
 * removed as they're found.
 */
async function sendToUsers(
  admin: SupabaseClient,
  vapid: VapidKeys,
  userIds: string[],
  category: string | null,
  message: PushMessage,
  opts: SendOptions,
): Promise<{ sent: number; failed: number; devices: number }> {
  if (!userIds.length) return { sent: 0, failed: 0, devices: 0 }
  let query = admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', userIds)
  if (category) query = query.contains('categories', [category])
  const { data: subs, error } = await query
  if (error) throw error

  let sent = 0
  let failed = 0
  const gone: string[] = []
  const delivered: string[] = []
  await Promise.all(
    (subs ?? []).map(async (s) => {
      if (!PUSH_HOST.test(s.endpoint)) return
      try {
        const r = await sendWebPush(s, message, vapid, opts)
        if (r.ok) {
          sent++
          delivered.push(s.id)
        } else {
          failed++
          if (r.gone) gone.push(s.id)
          else console.warn('[send-push] push service answered', r.status)
        }
      } catch (e) {
        failed++
        console.warn('[send-push] send failed', e)
      }
    }),
  )
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone)
  if (delivered.length) await admin.from('push_subscriptions').update({ last_sent_at: new Date().toISOString() }).in('id', delivered)
  return { sent, failed, devices: subs?.length ?? 0 }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
