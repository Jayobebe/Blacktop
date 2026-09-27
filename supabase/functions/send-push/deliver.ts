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
  /** Every device registered to this crew. */
  crew?: string
  /** Every device whose rounded weather location is this area. */
  area?: { lat: number; lng: number }
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
  let q = ctx.admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth')
  if (category) q = q.contains('categories', [category])
  if (target.userIds) q = q.in('user_id', target.userIds)
  if (target.crew) q = q.eq('crew_code', target.crew)
  if (target.area) q = q.eq('weather_lat', target.area.lat).eq('weather_lng', target.area.lng)
  const { data, error } = await q.limit(2000)
  if (error) throw error
  const exclude = new Set(target.exclude ?? [])
  const subs = (data ?? []).filter((s) => !exclude.has(s.user_id) && PUSH_HOST.test(s.endpoint))

  let sent = 0
  let failed = 0
  const gone: string[] = []
  const delivered: string[] = []
  // Small batches keep a big crew from opening hundreds of connections at once.
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(
      subs.slice(i, i + 25).map(async (s) => {
        try {
          const r = await sendWebPush(s, message, ctx.vapid, opts)
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

/** True the first time `key` is seen (or again once `cooldownSec` has passed). */
export async function markOnce(ctx: Ctx, key: string, cooldownSec?: number): Promise<boolean> {
  const { data, error } = await ctx.admin.rpc('push_mark_once', { _key: key, _cooldown_seconds: cooldownSec ?? null })
  if (error) throw error
  return data === true
}
