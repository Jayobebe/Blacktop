import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

/**
 * Recovery codes: how an anonymous account is found again on another phone.
 *
 * The phone makes a code (20 characters, about 98 bits) and never sends it as
 * such: it sends the two things worked out from it (`src/lib/recovery.ts`,
 * keep in step), a made-up address `r-<sha256 of the code>@recovery…` and a
 * password that is the code. This function puts those on the caller's own
 * account with the admin API. The other phone then signs in with them like
 * any password sign-in; no function is involved, and nothing here ever maps a
 * code to an account. What the server keeps is a hash of the code in the
 * address and the auth service's own hash of the password: never the code,
 * and nothing about who the rider is.
 *
 *   { action: 'status' }                    → { ok: true }   (is this function deployed?)
 *   { action: 'create', email, password }   → { ok: true }
 *
 * Setting a password signs an account out everywhere (the phone signs in
 * again with the code straight after, and keeps the code until that worked),
 * so a mistake here could lock a rider out of the very account they wanted
 * to protect. Before the caller's account is touched, the whole thing is
 * rehearsed on a throwaway anonymous account made for the purpose: given an
 * address and a password the same way, signed in with them, deleted. If any
 * step of the rehearsal fails (email sign-in switched off for the project,
 * anonymous sign-in limited, anything), nothing is changed and the phone is
 * told it's unavailable.
 */
const EMAIL = /^r-[0-9a-f]{40}@recovery\.blacktoplive\.com$/
const PASSWORD = /^bT1![2-9A-HJKMNP-TV-Z]{20}$/
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function emailFor(password: string): Promise<string> {
  const code = password.slice(4)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`blacktop-recovery:${code}`))
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `r-${hex.slice(0, 40)}@recovery.blacktoplive.com`
}

function randomPassword(): string {
  let code = ''
  while (code.length < 20) {
    const [n] = crypto.getRandomValues(new Uint8Array(1))
    if (n < 240) code += ALPHABET[n % 30]
  }
  return `bT1!${code}`
}

const visitor = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

/** The whole change, on an account made to be thrown away. True only if it could then be signed in to. */
async function rehearse(admin: ReturnType<typeof createClient>): Promise<boolean> {
  let testId: string | null = null
  try {
    const { data, error } = await visitor().auth.signInAnonymously()
    if (error || !data.user) return false
    testId = data.user.id
    const password = randomPassword()
    const email = await emailFor(password)
    const { error: setErr } = await admin.auth.admin.updateUserById(testId, { email, password, email_confirm: true })
    if (setErr) return false
    const { data: back, error: inErr } = await visitor().auth.signInWithPassword({ email, password })
    return !inErr && back.user?.id === testId
  } catch (e) {
    console.error('[RECOVERY] Rehearsal failed', e)
    return false
  } finally {
    if (testId) {
      const { error } = await admin.auth.admin.deleteUser(testId)
      if (error) console.warn('[RECOVERY] Rehearsal account not removed', error)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''))
    if (authErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    // Only ever the caller's own account: the id comes from the verified token, never from the request.
    const userId = claims.claims.sub as string

    const body = await req.json().catch(() => ({}))
    if (body?.action === 'status') return json({ ok: true })
    if (body?.action !== 'create') return json({ error: 'Unknown action' }, 400)

    const email = String(body.email ?? '')
    const password = String(body.password ?? '')
    if (!EMAIL.test(email) || !PASSWORD.test(password) || (await emailFor(password)) !== email) return json({ error: 'Bad request' }, 400)

    const { data: allowed, error: rateLimitErr } = await supabase.rpc('check_rate_limit', { _bucket: 'account-recovery', _max_requests: 5, _window_seconds: 3600 })
    if (rateLimitErr || allowed === false) return json({ error: 'Too many requests' }, 429)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (!(await rehearse(admin))) return json({ error: 'Unavailable' }, 503)

    const { error } = await admin.auth.admin.updateUserById(userId, { email, password, email_confirm: true })
    if (error) {
      console.error('[RECOVERY] Could not set the code', error)
      return json({ error: 'Failed' }, 500)
    }
    return json({ ok: true })
  } catch (e) {
    console.error('[RECOVERY] Unexpected error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
