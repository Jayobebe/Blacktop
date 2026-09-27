import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import type { VapidKeys } from './webpush.ts'
import { deliver, markOnce, type Ctx } from './deliver.ts'
import { processEvent, rescue, rescueCancel, runScheduled } from './events.ts'

/**
 * Push notifications for Blacktop (Web Push, works with the installed PWA).
 *
 * Rider actions (need the rider's session):
 *   { action: 'config' }        -> { publicKey }  VAPID key the browser subscribes with
 *   { action: 'test', delayed? } -> test notification to the caller's own devices
 *   { action: 'rescue', convoyId?, crewCode?, lat, lng, auto? }
 *   { action: 'rescue_cancel', convoyId?, crewCode? }
 *
 * Background (no session; safe to call any number of times):
 *   { action: 'drain' }  sends events queued by database triggers (push_outbox)
 *   { action: 'tick' }   scheduled checks: weather, reminders, crew results
 *                        (pg_cron every 10 min; throttled to one run per 4 min)
 *
 * All notification text is written server-side (events.ts), never taken from
 * a caller. Needs the VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT secrets.
 * Deployed with verify_jwt = false so the database can call drain/tick; rider
 * actions check the session themselves.
 */

/** Supabase's edge runtime: keeps background work alive after the response. */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = typeof body?.action === 'string' ? body.action : ''

    const vapid = vapidKeys()
    if (!vapid) return json({ error: 'push_not_configured' }, 503)
    const ctx: Ctx = { admin: adminClient(), vapid }

    // ── Background ─────────────────────────────────────────────────────────
    if (action === 'drain') {
      return json({ drained: await drain(ctx) })
    }
    if (action === 'tick') {
      if (!(await markOnce(ctx, 'tick', 240))) return json({ skipped: 'recent' })
      const drained = await drain(ctx)
      return json({ drained, ...(await runScheduled(ctx)) })
    }

    // ── Rider actions ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token)
    if (authErr || !claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401)
    const userId = claims.claims.sub as string
    const allowed = async (bucket: string, max: number, windowSec: number) => {
      const { data, error } = await supabase.rpc('check_rate_limit', {
        _bucket: bucket,
        _max_requests: max,
        _window_seconds: windowSec,
      })
      return !error && data !== false
    }

    if (action === 'config') {
      return json({ publicKey: vapid.publicKey })
    }

    if (action === 'test') {
      if (!(await allowed('send-push-test', 5, 600))) return json({ error: 'Too many requests' }, 429)
      const send = () =>
        deliver(ctx, { userIds: [userId] }, null, {
          title: 'Blacktop',
          body: "Notifications are on. You'll get alerts here even when Blacktop is closed.",
          tag: 'test',
          url: '/settings',
        }, { ttl: 300, urgency: 'high' })

      if (body?.delayed === true) {
        // "Test with the app closed": answer now, send in 10 s so the rider
        // has time to close Blacktop or lock the phone.
        const { count } = await ctx.admin
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

    if (action === 'rescue' || action === 'rescue_cancel') {
      if (!(await allowed('send-push-rescue', 6, 600))) return json({ error: 'Too many requests' }, 429)
      const convoyId = typeof body.convoyId === 'string' ? body.convoyId : null
      const crewCode = typeof body.crewCode === 'string' ? body.crewCode : null
      if (action === 'rescue_cancel') return json(await rescueCancel(ctx, { userId, convoyId, crewCode }))
      const lat = Number(body.lat)
      const lng = Number(body.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return json({ error: 'Invalid location' }, 400)
      }
      return json(await rescue(ctx, { userId, convoyId, crewCode, lat, lng, auto: body.auto === true }))
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('[send-push]', err)
    return json({ error: 'Internal error' }, 500)
  }
})

/** Sends everything the database has queued (each event is claimed once). */
async function drain(ctx: Ctx) {
  let processed = 0
  for (let round = 0; round < 5; round++) {
    const { data, error } = await ctx.admin.rpc('claim_push_outbox', { _limit: 100 })
    if (error) throw error
    const rows = (data ?? []) as { id: number; kind: string; payload: Record<string, unknown> }[]
    for (const r of rows) {
      try {
        await processEvent(ctx, r.kind, r.payload ?? {})
      } catch (e) {
        console.error('[send-push] event failed', r.kind, r.id, e)
      }
      processed++
    }
    if (rows.length < 100) break
  }
  return processed
}

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
