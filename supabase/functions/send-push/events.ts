import { deliver, markOnce, type Ctx, type PushMessage } from './deliver.ts'
import {
  challengesForWeek,
  daysInMonthUTC,
  formatOf,
  formatScore,
  monthKeyUTC,
  monthlyGoalFor,
  weekKeyUTC,
  type Challenge,
} from './crew.ts'
import { findAlert, weatherMessage, type HourlyForecast } from './weather.ts'
import { fetchWithTimeout, upstreamHeaders, viaGeo } from '../_shared/upstream.ts'
import { wordsAt } from '../_shared/w3w.ts'

/** The forecast model our own geo server syncs (infra/geo/.env WEATHER_MODEL). */
const OWN_WEATHER_MODEL = 'ecmwf_ifs025'

/**
 * Every notification Blacktop sends, written here (never taken from a client).
 *
 *  - rescue / rescueCancel: called by the rider in trouble
 *  - processEvent: database events queued in push_outbox by triggers
 *  - runScheduled: the 30-minute tick (weather, reminders, crew results)
 */

type Row = Record<string, unknown>

const str = (v: unknown, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback)
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const amount = (v: unknown, currency: unknown) =>
  `${num(v).toLocaleString('en-GB', { maximumFractionDigits: 4 })} ${str(currency)}`
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

async function one(ctx: Ctx, table: string, id: string, columns = '*'): Promise<Row | null> {
  const { data, error } = await ctx.admin.from(table).select(columns).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Row | null) ?? null
}

async function displayName(ctx: Ctx, userId: string): Promise<string> {
  const p = await one(ctx, 'profiles', userId, 'display_name')
  return clip(str(p?.display_name, 'A rider'), 30)
}

async function crewDeviceUsers(ctx: Ctx, crew: string): Promise<string[]> {
  // Devices in this crew among several (crew_codes), or registered to it alone
  // (crew_code; all a database from before several crews has).
  let { data, error } = await ctx.admin
    .from('push_subscriptions').select('user_id').or(`crew_code.eq.${crew},crew_codes.cs.{${crew}}`).limit(2000)
  if (error && error.code === '42703') ({ data, error } = await ctx.admin.from('push_subscriptions').select('user_id').eq('crew_code', crew).limit(2000))
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.user_id as string))]
}

export function normaliseCrew(code: unknown): string | null {
  const c = str(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
  return c.length >= 4 ? c : null
}

// ── Rescue ──────────────────────────────────────────────────────────────────

export interface RescueInput {
  userId: string
  convoyId?: string | null
  crewCode?: string | null
  /** Every crew the rider is in (newer apps); crewCode alone from older ones. */
  crewCodes?: string[] | null
  lat: number
  lng: number
  auto?: boolean
  /** Also reach riders who opted in to help nearby, within this many km. */
  nearbyKm?: number | null
}

/**
 * Devices near a point. Their locations are rounded to 0.1° (~11 km), so the
 * box gets that much slack: "within N km" is approximate by design.
 */
function nearbyBox(lat: number, lng: number, km: number) {
  const dLat = km / 110.54 + 0.1
  const dLng = km / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180))) + 0.1
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng }
}

function addResults(a: { sent: number; failed: number; devices: number }, b: { sent: number; failed: number; devices: number }) {
  return { sent: a.sent + b.sent, failed: a.failed + b.failed, devices: a.devices + b.devices }
}

/** Everyone who should hear about this rider's rescue: their convoy and their crew. */
async function rescueRecipients(ctx: Ctx, userId: string, convoyId?: string | null, crewCode?: string | null, crewCodes?: string[] | null) {
  const users = new Set<string>()
  if (convoyId) {
    const { data: member } = await ctx.admin
      .from('convoy_members').select('user_id').eq('convoy_id', convoyId).eq('user_id', userId).maybeSingle()
    if (member) {
      const { data } = await ctx.admin.from('convoy_members').select('user_id').eq('convoy_id', convoyId).limit(200)
      for (const r of data ?? []) users.add(r.user_id as string)
    }
  }
  const crews = new Set([crewCode, ...(crewCodes ?? [])].map(normaliseCrew).filter((c): c is string => !!c))
  for (const crew of [...crews].slice(0, 4)) for (const u of await crewDeviceUsers(ctx, crew)) users.add(u)
  users.delete(userId)
  return [...users]
}

export async function rescue(ctx: Ctx, input: RescueInput) {
  // The what3words square is looked up alongside (null without a what3words key).
  const [name, recipients, w3w] = await Promise.all([
    displayName(ctx, input.userId),
    rescueRecipients(ctx, input.userId, input.convoyId, input.crewCode, input.crewCodes),
    wordsAt(input.lat, input.lng).catch(() => null),
  ])
  const where = w3w ? ` ///${w3w.words}` : ''
  const url = `/rescue?lat=${input.lat.toFixed(5)}&lng=${input.lng.toFixed(5)}&name=${encodeURIComponent(name)}&at=${Date.now()}`
  const opts = { ttl: 1800, urgency: 'high' as const, topic: `rescue-${input.userId.slice(0, 20)}` }
  const known = await deliver(ctx, { userIds: recipients }, 'rescue', {
    title: `🚨 ${name} needs rescue`,
    body: (input.auto ? 'Automatic crash alert: they may have come off. Tap to see where they are.' : 'Tap to see where they are.') + where,
    tag: `rescue-${input.userId}`,
    url,
    urgent: true,
  }, opts)
  if (!input.nearbyKm) return known
  // Riders nearby who opted in to help (not the convoy / crew, who already have it).
  const nearby = await deliver(ctx, { box: nearbyBox(input.lat, input.lng, input.nearbyKm), exclude: [input.userId, ...recipients] }, 'rescue_nearby', {
    title: `🚨 A rider near you needs help`,
    body: `${name} called for rescue within about ${input.nearbyKm} km of you. Tap to see where they are.${where}`,
    tag: `rescue-${input.userId}`,
    url,
    urgent: true,
  }, opts)
  return addResults(known, nearby)
}

export async function rescueCancel(ctx: Ctx, input: Omit<RescueInput, 'lat' | 'lng' | 'auto'> & { lat?: number | null; lng?: number | null }) {
  const name = await displayName(ctx, input.userId)
  const recipients = await rescueRecipients(ctx, input.userId, input.convoyId, input.crewCode, input.crewCodes)
  const message = {
    title: `✅ ${name} is OK`,
    body: 'They cancelled their rescue call.',
    tag: `rescue-${input.userId}`,
    url: '/',
  }
  const opts = { ttl: 1800, urgency: 'high' as const, topic: `rescue-${input.userId.slice(0, 20)}` }
  const known = await deliver(ctx, { userIds: recipients }, 'rescue', message, opts)
  if (!input.nearbyKm || input.lat == null || input.lng == null) return known
  const nearby = await deliver(ctx, { box: nearbyBox(input.lat, input.lng, input.nearbyKm), exclude: [input.userId, ...recipients] }, 'rescue_nearby', message, opts)
  return addResults(known, nearby)
}

// ── Database events (push_outbox) ───────────────────────────────────────────

export async function processEvent(ctx: Ctx, kind: string, p: Row): Promise<void> {
  switch (kind) {
    case 'card_attempt':
      return cardAttempt(ctx, str(p.id))
    case 'card_collected':
      return cardCollected(ctx, str(p.id))
    case 'tank_request':
      return tankRequest(ctx, str(p.id))
    case 'tank_status':
      return tankStatus(ctx, str(p.id), str(p.status), str(p.actor))
    case 'tank_pledge':
      return tankPledge(ctx, str(p.id))
    case 'tank_settlement':
      return tankSettlement(ctx, str(p.id))
    case 'crew_overtake':
      return crewOvertake(ctx, p)
    case 'crew_week':
      return crewWeek(ctx, str(p.user), str(p.crew), str(p.week))
    case 'crew_convoy':
      return crewConvoy(ctx, str(p.id))
    default:
      console.warn('[send-push] unknown event', kind)
  }
}

async function cardAttempt(ctx: Ctx, id: string) {
  const a = await one(ctx, 'card_challenge_attempts', id)
  if (!a || (a.result !== 'won' && a.result !== 'lost')) return
  const drop = await one(ctx, 'card_drops', str(a.drop_id), 'owner_id, vehicle_name, challenge_time_sec')
  if (!drop || drop.owner_id === a.challenger_id) return
  if (!(await markOnce(ctx, `card_attempt:${id}`))) return
  const who = clip(str(a.challenger_name, 'A rider'), 30)
  const vehicle = clip(str(drop.vehicle_name, 'your card'), 40)
  const theirs = mmss(num(a.time_sec))
  const yours = drop.challenge_time_sec != null ? mmss(num(drop.challenge_time_sec)) : null
  const message: PushMessage =
    a.result === 'won'
      ? {
          title: '⏱️ Your time attack was beaten',
          body: `${who} beat your ${vehicle} time: ${theirs}${yours ? ` vs your ${yours}` : ''}. Race it back?`,
          tag: `card-attempt-${id}`,
          url: '/world',
        }
      : {
          title: '🛡️ Your time attack held',
          body: `${who} raced your ${vehicle} card and lost: ${theirs}${yours ? ` vs your ${yours}` : ''}.`,
          tag: `card-attempt-${id}`,
          url: '/world',
        }
  await deliver(ctx, { userIds: [str(drop.owner_id)] }, 'timeattack', message)
}

async function cardCollected(ctx: Ctx, id: string) {
  const c = await one(ctx, 'card_drop_collections', id)
  if (!c) return
  const drop = await one(ctx, 'card_drops', str(c.drop_id), 'owner_id, vehicle_name')
  if (!drop || drop.owner_id === c.collector_id) return
  if (!(await markOnce(ctx, `card_collected:${id}`))) return
  await deliver(ctx, { userIds: [str(drop.owner_id)] }, 'card_pickups', {
    title: `🃏 ${clip(str(c.collector_name, 'A rider'), 30)} picked up your card`,
    body: `Your ${clip(str(drop.vehicle_name, 'vehicle'), 40)} card is in their vault now.`,
    tag: `card-collected-${str(c.drop_id)}`,
    url: '/world',
  })
}

async function tankMembers(ctx: Ctx, crew: string): Promise<string[]> {
  const { data, error } = await ctx.admin.from('blacktank_members').select('user_id').ilike('crew_code', crew).limit(500)
  if (error) throw error
  return (data ?? []).map((r) => r.user_id as string)
}

const TANK_URL = '/world?tank=1'

async function tankRequest(ctx: Ctx, id: string) {
  const r = await one(ctx, 'blacktank_requests', id)
  if (!r || !(await markOnce(ctx, `tank_request:${id}`))) return
  const members = await tankMembers(ctx, str(r.crew_code))
  await deliver(ctx, { userIds: members, exclude: [str(r.requester_id)], crewLabel: str(r.crew_code) }, 'blacktank', {
    title: `⛽ ${clip(str(r.requester_name, 'A rider'), 30)} asked the Blacktank`,
    body: `${amount(r.amount, r.currency)} for ${clip(str(r.reason, 'the crew'), 80)}. Tap to vote.`,
    tag: `tank-${id}`,
    url: TANK_URL,
  })
}

async function tankStatus(ctx: Ctx, id: string, status: string, actor: string) {
  const r = await one(ctx, 'blacktank_requests', id)
  if (!r || !(await markOnce(ctx, `tank_status:${id}:${status}`))) return
  const requester = str(r.requester_id)
  const what = `${amount(r.amount, r.currency)} for ${clip(str(r.reason, 'the crew'), 80)}`
  const toRequester = (title: string, body: string) =>
    deliver(ctx, { userIds: [requester], crewLabel: str(r.crew_code) }, 'blacktank', { title, body, tag: `tank-${id}`, url: TANK_URL })

  if (status === 'approved') {
    await toRequester('✅ Your Blacktank request was approved', `The crew approved ${what}. Shares are on their way.`)
    const members = await tankMembers(ctx, str(r.crew_code))
    const others = members.filter((m) => m !== requester)
    const share = num(r.amount) / Math.max(1, others.length)
    await deliver(ctx, { userIds: others, crewLabel: str(r.crew_code) }, 'blacktank', {
      title: `💸 Pay your share to ${clip(str(r.requester_name, 'the rider'), 30)}`,
      body: `${amount(share, r.currency)} towards ${clip(str(r.reason, 'the request'), 80)}. Tap to settle up.`,
      tag: `tank-${id}`,
      url: TANK_URL,
    })
  } else if (status === 'rejected' && actor !== requester) {
    await toRequester('❌ Your Blacktank request was declined', `${what[0].toUpperCase()}${what.slice(1)}.`)
  } else if (status === 'expired') {
    await toRequester('⌛ Your Blacktank request expired', `Not everyone voted in time on ${what}.`)
  } else if (status === 'settled') {
    await toRequester('🎉 Your Blacktank request is fully paid', `Everyone has paid their share of ${what}.`)
  }
}

async function tankPledge(ctx: Ctx, id: string) {
  const p = await one(ctx, 'blacktank_pledges', id)
  if (!p || !(await markOnce(ctx, `tank_pledge:${id}`))) return
  const members = await tankMembers(ctx, str(p.crew_code))
  await deliver(ctx, { userIds: members, exclude: [str(p.user_id)], crewLabel: str(p.crew_code) }, 'blacktank', {
    title: `⛽ ${clip(str(p.display_name, 'A rider'), 30)} chipped in ${amount(p.amount, p.currency)}`,
    body: 'The crew Blacktank just grew.',
    tag: `tank-pledge-${str(p.crew_code)}`,
    url: TANK_URL,
  })
}

async function tankSettlement(ctx: Ctx, id: string) {
  const s = await one(ctx, 'blacktank_settlements', id)
  if (!s || !(await markOnce(ctx, `tank_settlement:${id}`))) return
  const r = await one(ctx, 'blacktank_requests', str(s.request_id))
  if (!r) return
  await deliver(ctx, { userIds: [str(r.requester_id)], crewLabel: str(r.crew_code) }, 'blacktank', {
    title: `💸 ${clip(str(s.payer_name, 'A rider'), 30)} paid their share`,
    body: `${amount(s.amount, s.currency)} towards ${clip(str(r.reason, 'your request'), 80)}.`,
    tag: `tank-settle-${str(s.request_id)}`,
    url: TANK_URL,
  })
}

const METRIC_LABELS: Record<string, string> = {
  distance: 'distance',
  top_speed: 'top speed',
  max_lean: 'lean',
  ride_count: 'rides',
  hit_heavy: 'Hit Heavy',
  petrol_head: 'Petrol Head',
}

async function crewOvertake(ctx: Ctx, p: Row) {
  const by = str(p.by)
  const victim = str(p.victim)
  if (!by || !victim) return
  // Once per rider pair every 3 hours, so a back-and-forth doesn't spam.
  if (!(await markOnce(ctx, `overtake:${by}:${victim}`, 3 * 3600))) return
  const metrics = (Array.isArray(p.metrics) ? p.metrics : []).map((m) => METRIC_LABELS[String(m)]).filter(Boolean)
  await deliver(ctx, { userIds: [victim], crewLabel: str(p.crew) }, 'leaderboard', {
    title: `📉 ${clip(str(p.by_name, 'A crew mate'), 30)} passed you on the crew board`,
    body: `They're now ahead of you on ${listJoin(metrics) || 'the board'}.`,
    tag: `overtake-${by}-${str(p.crew)}`,
    url: '/crew/leaderboard',
  })
}

/** list_crew_month's definition: weeks active this month, summed for the crew. */
async function monthTotals(ctx: Ctx, crew: string, month: string) {
  const start = `${month}-01T00:00:00Z`
  const [y, m] = month.split('-').map(Number)
  const end = new Date(Date.UTC(y, m, 1)).toISOString()
  const { data: weeks, error: e1 } = await ctx.admin
    .from('crew_weekly_scores').select('week_key').gte('updated_at', start).lt('updated_at', end).limit(5000)
  if (e1) throw e1
  const keys = [...new Set((weeks ?? []).map((w) => w.week_key as string))]
  if (!keys.length) return { distance: 0, ride_count: 0 }
  const { data, error } = await ctx.admin
    .from('crew_weekly_scores').select('distance, ride_count').ilike('crew_code', crew).in('week_key', keys).limit(5000)
  if (error) throw error
  return {
    distance: (data ?? []).reduce((s, r) => s + num(r.distance), 0),
    ride_count: (data ?? []).reduce((s, r) => s + num(r.ride_count), 0),
  }
}

async function crewWeek(ctx: Ctx, userId: string, crew: string, week: string) {
  if (!userId || !crew || !week) return
  const { data: row } = await ctx.admin
    .from('crew_weekly_scores').select('*').eq('user_id', userId).eq('week_key', week).eq('crew_code', crew).maybeSingle()

  // This rider hit one of this week's targets.
  if (row) {
    for (const c of challengesForWeek(week)) {
      const value = num((row as Row)[c.metric])
      if (value < c.target || !(await markOnce(ctx, `wk_target:${userId}:${week}:${c.id}`))) continue
      await deliver(ctx, { userIds: [userId], crewLabel: crew }, 'challenges', {
        title: `🏁 ${c.title}: target hit`,
        body: `${formatScore(value, c.unit)} this week (target ${formatScore(c.target, c.unit)}). See where you stand in Crew Challenges.`,
        tag: `wk-${week}-${c.id}-${crew}`,
        url: '/crew/challenges',
      })
    }
  }

  // The crew's monthly goal just fell.
  const month = monthKeyUTC(new Date())
  const goal = monthlyGoalFor(month)
  const totals = await monthTotals(ctx, crew, month)
  if (totals[goal.metric] >= goal.target && (await markOnce(ctx, `month_goal:${crew}:${month}`))) {
    await deliver(ctx, { crew }, 'challenges', {
      title: `🏆 ${goal.title} smashed`,
      body: `Your crew hit ${formatScore(goal.target, goal.unit)} this month. Nice riding.`,
      tag: `month-${month}-${crew}`,
      url: '/crew/challenges',
    })
  }
}

async function crewConvoy(ctx: Ctx, id: string) {
  const c = await one(ctx, 'convoys', id, 'id, crew_code, is_listed, leader_id, destination_name, ride_ended_at')
  if (!c || !c.is_listed || c.ride_ended_at || !c.crew_code) return
  if (!(await markOnce(ctx, `crew_convoy:${id}`))) return
  const leader = str(c.leader_id)
  const name = leader ? await displayName(ctx, leader) : 'A crew mate'
  const dest = str(c.destination_name)
  await deliver(ctx, { crew: str(c.crew_code), exclude: [leader] }, 'crew_convoys', {
    title: `🏍️ ${name} opened a crew convoy`,
    body: dest ? `Heading to ${clip(dest, 60)}. Tap to see it and join.` : 'Tap to see it and join.',
    tag: `crew-convoy-${id}`,
    url: '/crew/convoys',
  })
}

// ── Scheduled (every 10 minutes) ────────────────────────────────────────────

export async function runScheduled(ctx: Ctx, now = new Date()) {
  const jobs: [string, () => Promise<void>][] = [
    ['reminders', () => dueReminders(ctx)],
    ['weather', () => weatherAlerts(ctx, now)],
    ['week results', () => weekResults(ctx, now)],
    ['month results', () => monthResults(ctx, now)],
    ['month reminder', () => monthReminder(ctx, now)],
    ['cleanup', () => cleanup(ctx, now)],
  ]
  const report: Record<string, string> = {}
  for (const [name, job] of jobs) {
    try {
      await job()
      report[name] = 'ok'
    } catch (e) {
      console.error(`[send-push] ${name} failed`, e)
      report[name] = 'failed'
    }
  }
  return report
}

async function dueReminders(ctx: Ctx) {
  const { data, error } = await ctx.admin
    .from('push_reminders').select('*').is('sent_at', null).lte('due_at', new Date().toISOString()).limit(200)
  if (error) throw error
  for (const r of data ?? []) {
    // Mark first so a slow send can't go out twice.
    const { data: claimed } = await ctx.admin
      .from('push_reminders').update({ sent_at: new Date().toISOString() }).eq('id', r.id).is('sent_at', null).select('id')
    if (!claimed?.length) continue
    await deliver(ctx, { userIds: [r.user_id] }, r.category, {
      title: str(r.title),
      body: str(r.body),
      tag: `reminder-${str(r.key).slice(0, 60)}`,
      url: str(r.url, '/'),
    })
  }
}

async function weatherAlerts(ctx: Ctx, now: Date) {
  const since = new Date(now.getTime() - 3 * 86400000).toISOString()
  const { data, error } = await ctx.admin
    .from('push_subscriptions').select('weather_lat, weather_lng')
    .contains('categories', ['weather']).not('weather_lat', 'is', null).gte('weather_at', since).limit(5000)
  if (error) throw error
  const areas = new Map<string, { lat: number; lng: number }>()
  for (const r of data ?? []) {
    const lat = num(r.weather_lat)
    const lng = num(r.weather_lng)
    areas.set(`${lat.toFixed(1)},${lng.toFixed(1)}`, { lat, lng })
  }

  // Each area at most every 25 minutes.
  const due: { key: string; lat: number; lng: number }[] = []
  for (const [key, a] of areas) {
    if (due.length >= 200) break
    if (await markOnce(ctx, `wxcheck:${key}`, 25 * 60)) due.push({ key, ...a })
  }

  const nowSec = Math.floor(now.getTime() / 1000)
  for (let i = 0; i < due.length; i += 50) {
    const batch = due.slice(i, i + 50)
    // Our own geo server's Open-Meteo first (when set up; the public API is
    // free for non-commercial use only, ~10,000 calls a day), then the public one.
    let json: unknown
    try {
      json = await viaGeo('weather', ['https://api.open-meteo.com'], async (base, own) => {
        const url = new URL(`${base}/v1/forecast`)
        url.searchParams.set('latitude', batch.map((a) => a.lat.toFixed(1)).join(','))
        url.searchParams.set('longitude', batch.map((a) => a.lng.toFixed(1)).join(','))
        url.searchParams.set('hourly', 'precipitation,weather_code,wind_gusts_10m')
        url.searchParams.set('forecast_hours', '4')
        url.searchParams.set('timeformat', 'unixtime')
        url.searchParams.set('timezone', 'GMT')
        // Ours only holds the model it syncs (infra/geo), so name it.
        if (own) url.searchParams.set('models', OWN_WEATHER_MODEL)
        const res = await fetchWithTimeout(url.toString(), { headers: upstreamHeaders(own) }, 15000)
        if (!res.ok) throw new Error(`weather ${res.status}`)
        const body = await res.json()
        const first = Array.isArray(body) ? body[0] : body
        // An empty forecast from ours means its data isn't synced yet: try the public one.
        if (own && !first?.hourly?.time?.length) throw new Error('weather: no data yet')
        return body
      })
    } catch (e) {
      console.warn('[send-push] weather fetch', e instanceof Error ? e.message : e)
      continue
    }
    const series = Array.isArray(json) ? json : [json]
    for (let j = 0; j < batch.length; j++) {
      const hourly = series[j]?.hourly as HourlyForecast | undefined
      if (!hourly) continue
      const alert = findAlert(hourly, nowSec)
      if (!alert) continue
      // One warning per area every 6 hours.
      if (!(await markOnce(ctx, `wxalert:${batch[j].key}`, 6 * 3600))) continue
      await deliver(ctx, { area: { lat: batch[j].lat, lng: batch[j].lng } }, 'weather', weatherMessage(alert, nowSec, batch[j].key), {
        ttl: 3600,
        urgency: 'high',
      })
    }
  }
}

function weekLine(c: Challenge, me: Row, rows: Row[], solo: boolean): { line: string; won: boolean } {
  // A peak this rider keeps private (Public Road Privacy) is null: it reads "--" and can't win.
  if (me[c.metric] == null) {
    if (solo) return { line: `${c.title}: --`, won: false }
    const leader = [...rows].filter((r) => r[c.metric] != null).sort((a, b) => num(b[c.metric]) - num(a[c.metric]))[0]
    return leader && num(leader[c.metric]) > 0
      ? { line: `${c.title}: ${clip(str(leader.display_name, 'a crew mate'), 20)} took it (${formatScore(num(leader[c.metric]), c.unit)}), you --`, won: false }
      : { line: `${c.title}: nobody scored`, won: false }
  }
  const mine = num(me[c.metric])
  if (solo) {
    const hit = mine >= c.target
    return { line: `${c.title}: ${hit ? `${formatScore(mine, c.unit)} ✓` : formatOf(mine, c.target, c.unit)}`, won: hit }
  }
  const top = [...rows].sort((a, b) => num(b[c.metric]) - num(a[c.metric]))[0]
  if (!top || num(top[c.metric]) <= 0) return { line: `${c.title}: nobody scored`, won: false }
  if (top.user_id === me.user_id || num(top[c.metric]) === mine) {
    return { line: `${c.title}: you won (${formatScore(mine, c.unit)})`, won: true }
  }
  return {
    line: `${c.title}: ${clip(str(top.display_name, 'a crew mate'), 20)} took it (${formatScore(num(top[c.metric]), c.unit)}), you ${formatScore(mine, c.unit)}`,
    won: false,
  }
}

/** Monday afternoon (UTC), once the week is over everywhere: how each rider did. */
async function weekResults(ctx: Ctx, now: Date) {
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 12) return
  const week = weekKeyUTC(new Date(now.getTime() - 7 * 86400000))
  const { data, error } = await ctx.admin.from('crew_weekly_scores').select('*').eq('week_key', week).limit(5000)
  if (error) throw error
  const byCrew = new Map<string, Row[]>()
  for (const r of (data ?? []) as Row[]) {
    const k = str(r.crew_code).toUpperCase()
    byCrew.set(k, [...(byCrew.get(k) ?? []), r])
  }
  const challenges = challengesForWeek(week)
  for (const [crew, rows] of byCrew) {
    if (!(await markOnce(ctx, `week_result:${crew}:${week}`))) continue
    const solo = rows.length === 1
    for (const me of rows) {
      const lines = challenges.map((c) => weekLine(c, me, rows, solo))
      const wins = lines.filter((l) => l.won).length
      const title = solo
        ? '🏁 Your weekly challenges are in'
        : wins === 2
          ? '🏆 You won both weekly challenges'
          : wins === 1
            ? '🏆 Weekly results: you took one'
            : '🏁 Weekly challenge results'
      await deliver(ctx, { userIds: [str(me.user_id)], crewLabel: crew }, 'challenges', {
        title,
        body: `${lines.map((l) => l.line).join('. ')}. New challenges are live.`,
        tag: `week-${week}-${crew}`,
        url: '/crew/challenges',
      })
    }
  }
}

async function activeCrews(ctx: Ctx, month: string): Promise<string[]> {
  const start = `${month}-01T00:00:00Z`
  const [y, m] = month.split('-').map(Number)
  const end = new Date(Date.UTC(y, m, 1)).toISOString()
  const { data, error } = await ctx.admin
    .from('crew_weekly_scores').select('crew_code').gte('updated_at', start).lt('updated_at', end).limit(5000)
  if (error) throw error
  return [...new Set((data ?? []).map((r) => str(r.crew_code).toUpperCase()).filter(Boolean))]
}

/** The 1st of the month (afternoon UTC): crews that missed last month's goal. */
async function monthResults(ctx: Ctx, now: Date) {
  if (now.getUTCDate() !== 1 || now.getUTCHours() < 12) return
  const prev = monthKeyUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)))
  const goal = monthlyGoalFor(prev)
  const next = monthlyGoalFor(monthKeyUTC(now))
  for (const crew of await activeCrews(ctx, prev)) {
    if (!(await markOnce(ctx, `month_result:${crew}:${prev}`))) continue
    const totals = await monthTotals(ctx, crew, prev)
    if (totals[goal.metric] >= goal.target) continue // already celebrated when it fell
    await deliver(ctx, { crew }, 'challenges', {
      title: `😤 ${goal.title} missed`,
      body: `Your crew reached ${formatOf(totals[goal.metric], goal.target, goal.unit)}. This month: ${next.title}.`,
      tag: `month-${prev}-${crew}`,
      url: '/crew/challenges',
    })
  }
}

/** Five days before the month ends (evening UTC): nudge crews still short of the goal. */
async function monthReminder(ctx: Ctx, now: Date) {
  if (daysInMonthUTC(now) - now.getUTCDate() + 1 !== 5 || now.getUTCHours() < 17) return
  const month = monthKeyUTC(now)
  const goal = monthlyGoalFor(month)
  // Every crew a device with challenges on is in (crew_codes), or its one
  // crew on a database from before several crews.
  let { data, error } = await ctx.admin
    .from('push_subscriptions').select('crew_code, crew_codes').contains('categories', ['challenges']).limit(5000)
  if (error && error.code === '42703') {
    ;({ data, error } = await ctx.admin
      .from('push_subscriptions').select('crew_code').contains('categories', ['challenges']).not('crew_code', 'is', null).limit(5000))
  }
  if (error) throw error
  const crews = [...new Set(
    (data ?? []).flatMap((r) => [str(r.crew_code), ...((r as Row).crew_codes as string[] | undefined ?? [])]).map((c) => str(c).toUpperCase()).filter(Boolean),
  )]
  for (const crew of crews) {
    if (!(await markOnce(ctx, `month_reminder:${crew}:${month}`))) continue
    const totals = await monthTotals(ctx, crew, month)
    if (totals[goal.metric] >= goal.target) continue
    await deliver(ctx, { crew }, 'challenges', {
      title: `⏳ 5 days left: ${goal.title}`,
      body: `Your crew is at ${formatOf(totals[goal.metric], goal.target, goal.unit)}. Get out there.`,
      tag: `month-${month}-${crew}`,
      url: '/crew/challenges',
    })
  }
}

async function cleanup(ctx: Ctx, now: Date) {
  if (!(await markOnce(ctx, `cleanup:${now.toISOString().slice(0, 10)}`))) return
  const ago = (days: number) => new Date(now.getTime() - days * 86400000).toISOString()
  await ctx.admin.from('push_outbox').delete().not('claimed_at', 'is', null).lt('claimed_at', ago(7))
  await ctx.admin.from('push_sent').delete().lt('sent_at', ago(120))
  await ctx.admin.from('push_reminders').delete().not('sent_at', 'is', null).lt('sent_at', ago(90))
}
