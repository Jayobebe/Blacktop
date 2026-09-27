/**
 * Minimal Web Push sender on WebCrypto (no npm dependency):
 *  - RFC 8291 message encryption ("aes128gcm" content coding)
 *  - RFC 8292 VAPID authorisation (ES256 JWT)
 *
 * Keys are base64url: the VAPID public key is the 65-byte uncompressed P-256
 * point, the private key the 32-byte scalar `d` (what `web-push
 * generate-vapid-keys` prints).
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string; // mailto: or https: contact
}

export interface SendOptions {
  ttl?: number; // seconds the push service may hold the message
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  topic?: string; // replaces an undelivered message with the same topic
}

/** Byte arrays backed by a plain ArrayBuffer (what WebCrypto and fetch accept). */
type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();

export function b64urlEncode(bytes: Bytes): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str: string): Bytes {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF (RFC 5869) with a single output block, which is all Web Push needs. */
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

/** Encrypts `payload` for one subscription (RFC 8291, single record). */
export async function encryptPayload(
  sub: PushSubscriptionKeys,
  payload: Bytes,
  // Injectable for tests; random in production.
  fixed?: { salt: Bytes; serverKeys: CryptoKeyPair },
): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad subscription keys');

  const serverKeys =
    fixed?.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256),
  );

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // One record: plaintext || 0x02 (last-record padding delimiter).
  const record = concat(payload, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  // Header: salt(16) || record size(4, big-endian) || key id length(1) || key id (as_public)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

let signingKey: { pem: string; key: CryptoKey } | null = null;

async function vapidSigningKey(v: VapidKeys): Promise<CryptoKey> {
  if (signingKey?.pem === v.privateKey) return signingKey.key;
  const pub = b64urlDecode(v.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: v.privateKey,
    ext: false,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  signingKey = { pem: v.privateKey, key };
  return key;
}

/** `Authorization: vapid t=<jwt>, k=<public key>` for the endpoint's origin. */
export async function vapidAuthorization(endpoint: string, v: VapidKeys, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: v.subject })));
  const unsigned = `${header}.${claims}`;
  const key = await vapidSigningKey(v);
  // WebCrypto ECDSA returns r||s (IEEE P1363), which is exactly JWS ES256.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${v.publicKey}`;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** The subscription is dead (unsubscribed / expired): delete it. */
  gone: boolean;
}

export async function sendWebPush(sub: PushSubscriptionKeys, message: unknown, v: VapidKeys, opts: SendOptions = {}): Promise<SendResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  const headers: Record<string, string> = {
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttl ?? 3600),
    Urgency: opts.urgency ?? 'normal',
    Authorization: await vapidAuthorization(sub.endpoint, v),
  };
  // Topic must be ≤ 32 url-safe characters.
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body });
  await res.body?.cancel().catch(() => {});
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
