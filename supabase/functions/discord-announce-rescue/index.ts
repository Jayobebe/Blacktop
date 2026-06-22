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

    const body = await req.json().catch(() => ({}))
    const { convoyId, riderName, lat, lng } = body as {
      convoyId?: string
      riderName?: string
      lat?: number
      lng?: number
    }

    if (!convoyId || typeof riderName !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') {
      return json({ error: 'Invalid input' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify the requester is actually a member of this convoy
    const { data: membership } = await admin
      .from('convoy_members')
      .select('user_id')
      .eq('convoy_id', convoyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership) return json({ error: 'Not a convoy member' }, 403)

    const { data: convoy } = await admin
      .from('convoys')
      .select('leader_id, code')
      .eq('id', convoyId)
      .maybeSingle()

    if (!convoy?.leader_id) return json({ error: 'Convoy not found' }, 404)

    const { data: integration } = await admin
      .from('discord_integrations')
      .select('webhook_url, role_to_ping, auto_announce')
      .eq('user_id', convoy.leader_id)
      .maybeSingle()

    if (!integration?.webhook_url) {
      return json({ skipped: true, reason: 'no_leader_integration' }, 200)
    }

    if (integration.auto_announce === false) {
      return json({ skipped: true, reason: 'auto_announce_off' }, 200)
    }

    const rolePrefix = integration.role_to_ping
      ? `<@&${integration.role_to_ping}> `
      : ''
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
    const safeName = riderName.slice(0, 64)

    const payload = {
      content: `${rolePrefix}🚨 ${safeName} needs rescue, ${mapsUrl}`,
      allowed_mentions: integration.role_to_ping
        ? { roles: [integration.role_to_ping] }
        : { parse: [] },
    }

    const res = await fetch(integration.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[DISCORD] Webhook failed', res.status, text.slice(0, 200))
      return json({ error: 'Announcement failed' }, 502)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('[DISCORD] Unexpected error', e)
    return json({ error: 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
