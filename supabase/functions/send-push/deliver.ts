import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sendWebPush, type SendOptions, type VapidKeys } from './webpush.ts'

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

/** Notification kinds a device can switch on or off (see the app's settings). */
export type Category =
  | 'rescue'
  /** Rescue calls from riders near this device (opt-in; uses its rounded location). */
  | 'rescue_nearby'
  | 'weather'
  | 'blacktank'
  | 'timeattack'
  | 'card_pickups'
  | 'leaderboard'
  | 'crew_convoys'
  | 'challenges'
  | 'maintenance'

export interface Ctx {
  admin: SupabaseClient
  vapid: VapidKeys
}

export interface Target {
  userIds?: string[]
  /** Every device registered to this crew (a rider can be in several). */
  crew?: string
  /**
   * A crew notification: each device's title starts with that rider's own name
   * for this crew ("Sunday Riders · …", "Crew ABC123 · …" until they name it).
   * Defaults to `crew`.
   */
  crewLabel?: string
  /** Every device whose rounded weather location is this area. */
  area?: { lat: number; lng: number }
  /** Every device whose rounded location falls in this box. */
  box?: { south: number; north: number; west: number; east: number }
  exclude?: string[]
}

export interface DeliverResult {
  sent: number
  failed: number
  devices: number
}

const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//

/**
 * Sends one message to every matching device that has `category` switched on
 * (null = any device with notifications on, used by the test). Dead devices
 * are removed as they're found.
 */
export async function deliver(
  ctx: Ctx,
  target: Target,
  category: Category | null,
  message: PushMessage,
  opts: SendOptions = {},
): Promise<DeliverResult> {
  if (target.userIds && target.userIds.length === 0) return { sent: 0, failed: 0, devices: 0 }
  const crew = crewCode(target.crew)
  const label = crewCode(target.crewLabel ?? target.crew)
  if (target.crew && !crew) return { sent: 0, failed: 0, devices: 0 }
  // `several`: the columns for riders in several crews (crew_codes, crew_names).
  // A database from before them answers 42703 and gets the single-crew query.
  const query = (several: boolean) => {
    let q = ctx.admin.from('push_subscriptions').select(`id, user_id, endpoint, p256dh, auth${several && label ? ', crew_names' : ''}`)
    if (category) q = q.contains('categories', [category])
    if (target.userIds) q = q.in('user_id', target.userIds)
    if (crew) q = several ? q.or(`crew_code.eq.${crew},crew_codes.cs.{${crew}}`) : q.eq('crew_code', crew)
    if (target.area) q = q.eq('weather_lat', target.area.lat).eq('weather_lng', target.area.lng)
    if (target.box) {
      q = q
        .gte('weather_lat', target.box.south).lte('weather_lat', target.box.north)
        .gte('weather_lng', target.box.west).lte('weather_lng', target.box.east)
    }
    return q.limit(2000)
  }
  let { data, error } = await query(true)
  if (error && error.code === '42703') ({ data, error } = await query(false))
  if (error) throw error
  const exclude = new Set(target.exclude ?? [])
  const subs = ((data ?? []) as Sub[]).filter((s) => !exclude.has(s.user_id) && PUSH_HOST.test(s.endpoint))
  const messageFor = (s: Sub): PushMessage => {
    if (!label) return message
    const own = s.crew_names && typeof s.crew_names[label] === 'string' ? s.crew_names[label].trim().slice(0, 30) : ''
    return { ...message, title: `${own || `Crew ${label}`} · ${message.title}` }
  }

  let sent = 0
  let failed = 0
  const gone: string[] = []
  const delivered: string[] = []
  // Small batches keep a big crew from opening hundreds of connections at once.
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(
      subs.slice(i, i + 25).map(async (s) => {
        try {
          const r = await sendWebPush(s, messageFor(s), ctx.vapid, opts)
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
  }
  if (gone.length) await ctx.admin.from('push_subscriptions').delete().in('id', gone)
  if (delivered.length) {
    await ctx.admin.from('push_subscriptions').update({ last_sent_at: new Date().toISOString() }).in('id', delivered)
  }
  return { sent, failed, devices: subs.length }
}

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; crew_names?: Record<string, string> | null }

/** A crew code as stored (letters and digits, upper case), or null. Also keeps it safe inside a PostgREST filter. */
function crewCode(code: string | undefined | null): string | null {
  const c = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
  return c.length >= 4 ? c : null
}

/** True the first time `key` is seen (or again once `cooldownSec` has passed). */
export async function markOnce(ctx: Ctx, key: string, cooldownSec?: number): Promise<boolean> {
  const { data, error } = await ctx.admin.rpc('push_mark_once', { _key: key, _cooldown_seconds: cooldownSec ?? null })
  if (error) throw error
  return data === true
}
