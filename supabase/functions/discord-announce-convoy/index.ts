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

    const { data: integration } = await admin
      .from('discord_integrations')
      .select('webhook_url, role_to_ping, auto_announce')
      .eq('user_id', userId)
      .maybeSingle()

    if (!integration?.webhook_url) {
      return json({ skipped: true, reason: 'no_integration' }, 200)
    }

    const rolePrefix = integration.role_to_ping
      ? `<@&${integration.role_to_ping}> `
      : ''

    const name = (leaderName || 'A rider').slice(0, 64)
    const safeName = (convoyName || `${name}'s Convoy`).slice(0, 80)
    const link = joinUrl || `https://convoy-comms.lovable.app/join?code=${encodeURIComponent(convoyCode)}`

    const payload = {
      content: `${rolePrefix}🏁 **${name}** started a convoy!`,
      embeds: [
        {
          title: safeName,
          description: `Convoy code: **${convoyCode}**\n[Tap to join](${link})`,
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
      return json({ error: 'webhook_failed', status: res.status, detail: text }, 502)
    }

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
