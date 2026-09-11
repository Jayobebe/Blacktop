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
      _bucket: 'discord-announce-solo-rescue',
      _max_requests: 10,
      _window_seconds: 300,
    })
    if (rateLimitErr || allowed === false) return json({ error: 'Too many requests' }, 429)

    const body = await req.json().catch(() => ({}))
    const { riderName, lat, lng } = body as {
      riderName?: string
      lat?: number
      lng?: number
    }

    if (typeof riderName !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') {
      return json({ error: 'Invalid input' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Solo rider pings their own Discord integration
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
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
    const safeName = sanitizeText(riderName, 64)

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

function sanitizeText(s: string, maxLen: number): string {
  return (s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/`{3,}/g, '``')
    .trim()
    .slice(0, maxLen);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
