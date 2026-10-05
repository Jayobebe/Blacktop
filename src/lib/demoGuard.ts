import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { tr } from '@/lib/i18n';
import { isDemoModeActive } from '@/lib/demoMode';

/**
 * Demo mode never saves anything to Blacktop's servers, so a demo session
 * can't flood hazard reports, drop cards, spin up convoys or lobbies, upload
 * photos or burn the real account behind it.
 *
 * Two layers:
 *  - `demoBlocked()` for user actions to call up front (shows why, once).
 *  - `installDemoGuard()`, run once at start-up: while demo mode is on, every
 *    table write, storage upload, write RPC and write Edge Function resolves
 *    to a harmless "not saved" error instead of reaching the server. Reads
 *    are untouched. Background writes (presence, push registration, crew
 *    stats) are blocked silently; anything else also shows the notice.
 *
 * Keep WRITE_RPCS / WRITE_FUNCTIONS in step when adding server functions.
 */

const WRITE_RPCS = new Set([
  'cw_save_wear',
  'cw_wear_offline',
  'cw_action',
  'blacktank_cancel_request',
  'blacktank_join',
  'blacktank_pledge',
  'blacktank_request',
  'blacktank_set_place',
  'blacktank_settle',
  'blacktank_vote',
  'claim_convoy_leadership',
  'transfer_convoy_leadership',
  'generate_convoy_code',
  'collect_card_drop',
  'register_push_subscription',
  'unregister_push_subscription',
  'set_push_reminders',
  'report_hazard',
  'vote_hazard',
  'remove_my_hazard',
  'verify_enterprise_token',
  'submit_track_lap',
  'leave_track_leaderboards',
]);

const WRITE_FUNCTIONS = new Set([
  'burn-account',
  'send-push',
  'discord-announce-convoy',
  'discord-announce-rescue',
  'discord-announce-solo-rescue',
]);

/** Written in the background, not by a tap: blocked without a notice. */
const SILENT = new Set([
  'world_locations',
  'crew_scores',
  'register_push_subscription',
  'unregister_push_subscription',
  'set_push_reminders',
  'send-push',
]);

export const DEMO_BLOCKED_MESSAGE = 'Demo mode: nothing is saved';

let lastNotice = 0;
function notice() {
  const now = Date.now();
  if (now - lastNotice < 4000) return;
  lastNotice = now;
  toast(tr("Not available in demo mode"), { description: tr("Nothing is saved while demo mode is on. Turn it off in Settings to do this for real.") });
}

/** For user actions: true (and a notice) when demo mode is on and the action must not run. */
export function demoBlocked(): boolean {
  if (!isDemoModeActive()) return false;
  notice();
  return true;
}

/** A query result that is already settled with a "not saved" error, whatever gets chained on. */
function blockedResult(): unknown {
  const result = {
    data: null,
    error: { message: DEMO_BLOCKED_MESSAGE, code: 'demo', details: '', hint: '', name: 'DemoModeBlocked' },
    count: null,
    status: 403,
    statusText: 'demo',
  };
  const settled = Promise.resolve(result);
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return settled.then.bind(settled);
      if (prop === 'catch') return settled.catch.bind(settled);
      if (prop === 'finally') return settled.finally.bind(settled);
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}

let installed = false;

export function installDemoGuard() {
  if (installed) return;
  installed = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  // Tables: writes blocked, reads as normal.
  const from = client.from.bind(client);
  client.from = (table: string) => {
    const qb = from(table);
    if (!isDemoModeActive()) return qb;
    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      if (typeof qb[method] === 'function') {
        qb[method] = () => {
          if (!SILENT.has(table)) notice();
          return blockedResult();
        };
      }
    }
    return qb;
  };

  // RPCs: the writing ones.
  const rpc = client.rpc.bind(client);
  client.rpc = (fn: string, ...args: unknown[]) => {
    if (isDemoModeActive() && WRITE_RPCS.has(fn)) {
      if (!SILENT.has(fn)) notice();
      return blockedResult();
    }
    return rpc(fn, ...args);
  };

  // Edge Functions: `supabase.functions` is a fresh client per access, so patch its prototype.
  const fnProto = Object.getPrototypeOf(client.functions);
  const invoke = fnProto.invoke;
  fnProto.invoke = function (name: string, ...args: unknown[]) {
    if (isDemoModeActive() && WRITE_FUNCTIONS.has(name)) {
      if (!SILENT.has(name)) notice();
      return Promise.resolve({ data: null, error: { message: DEMO_BLOCKED_MESSAGE, name: 'DemoModeBlocked' } });
    }
    return invoke.call(this, name, ...args);
  };

  // Storage: uploads and changes.
  const fileProto = Object.getPrototypeOf(client.storage.from('demo-guard'));
  for (const method of ['upload', 'update', 'remove', 'move', 'copy', 'uploadToSignedUrl']) {
    const orig = fileProto[method];
    if (typeof orig !== 'function') continue;
    fileProto[method] = function (...args: unknown[]) {
      if (isDemoModeActive()) {
        notice();
        return Promise.resolve({ data: null, error: { message: DEMO_BLOCKED_MESSAGE, name: 'DemoModeBlocked' } });
      }
      return orig.apply(this, args);
    };
  }
}
