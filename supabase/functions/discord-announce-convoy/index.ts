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
      _bucket: 'discord-announce-convoy',
      _max_requests: 10,
      _window_seconds: 300,
    })
    if (rateLimitErr || allowed === false) return json({ error: 'Too many requests' }, 429)

    const body = await req.json().catch(() => ({}))
    const { convoyCode, convoyName, joinUrl, leaderName } = body as {
      convoyCode?: string
      convoyName?: string
      joinUrl?: string
      leaderName?: string
    }

    if (!convoyCode || typeof convoyCode !== 'string' || convoyCode.length > 16) {
      return json({ error: 'Invalid convoyCode' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify the caller actually leads a convoy with this code
    const { data: convoy } = await admin
      .from('convoys')
      .select('leader_id')
      .eq('code', convoyCode)
      .eq('is_active', true)
      .maybeSingle()

    if (convoy?.leader_id !== userId) {
      return json({ error: 'Not the leader of this convoy' }, 403)
    }

    const { data: integration } = await admin
      .from('discord_integrations')
      .select('webhook_url, role_to_ping, auto_announce')
      .eq('user_id', userId)
      .maybeSingle()

    if (!integration?.webhook_url) {
      return json({ skipped: true, reason: 'no_integration' }, 200)
    }

    if (!/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(integration.webhook_url)) {
      return json({ error: 'Invalid webhook URL' }, 400)
    }

    if (integration.auto_announce === false) {
      return json({ skipped: true, reason: 'auto_announce_off' }, 200)
    }

    const rolePrefix = integration.role_to_ping
      ? `<@&${integration.role_to_ping}> `
      : ''

    const name = (leaderName || 'A rider').slice(0, 64)
    const safeName = (convoyName || `${name}'s Convoy`).slice(0, 80)

    const payload = {
      content: `${rolePrefix}🏁 **${name}** started a convoy!`,
      embeds: [
        {
          title: safeName,
          description: `Convoy code: **${convoyCode}**`,
          color: 0xff6a00,
          footer: { text: 'BlackTop' },
          timestamp: new Date().toISOString(),
        },
      ],
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
