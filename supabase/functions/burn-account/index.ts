import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token)
    if (authErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const userId = claims.claims.sub as string

    const { data: allowed, error: rateLimitErr } = await supabase.rpc('check_rate_limit', {
      _bucket: 'burn-account',
      _max_requests: 5,
      _window_seconds: 300,
    })
    if (rateLimitErr || allowed === false) return json({ error: 'Too many requests' }, 429)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Always deletes the caller's own account only — userId comes from the
    // verified JWT, never from request input.
    //
    // Database rows go with the user (every table's user column cascades from
    // auth.users: profiles, convoys, cards, crews, push, hazard reports and
    // votes…). Two things don't cascade, so they go first:
    //   - files in storage (card photos live under `<userId>/`);
    //   - rate-limit counters (keyed by user id, no foreign key).
    await burnStorageFolder(admin, 'card-photos', userId)
    const { error: rlErr } = await admin.from('edge_rate_limits').delete().eq('user_id', userId)
    if (rlErr) console.warn('[BURN] Rate-limit rows not removed', rlErr)

    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
    if (deleteErr) {
      console.error('[BURN] Account deletion failed', deleteErr)
      return json({ error: 'Deletion failed' }, 500)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('[BURN] Unexpected error', e)
    return json({ error: 'Internal error' }, 500)
  }
})

/** Removes every file under `<folder>/` in a bucket (paged; best effort, logged). */
async function burnStorageFolder(admin: ReturnType<typeof createClient>, bucket: string, folder: string) {
  try {
    for (let guard = 0; guard < 50; guard++) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 })
      if (error) throw error
      if (!data?.length) return
      const paths = data.map((f) => `${folder}/${f.name}`)
      const { error: rmErr } = await admin.storage.from(bucket).remove(paths)
      if (rmErr) throw rmErr
      if (data.length < 100) return
    }
  } catch (e) {
    console.warn(`[BURN] ${bucket} files not fully removed`, e)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
