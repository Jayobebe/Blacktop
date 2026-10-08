/**
 * A backup of this phone: everything Blacktop keeps in local storage (rides,
 * the garage and logbook, cards, tracks and sessions, badges, stickers, saved
 * places, settings) as one JSON file the rider keeps wherever they like, and
 * can bring back on this phone or another. Nothing goes through a server.
 *
 * What isn't in it, on purpose:
 *   - what belongs to the account, not the phone (the profile, Card Wars,
 *     Enterprise workspaces): a new phone signs in as a new anonymous
 *     account, and a stale copy of the server's answer would only mislead;
 *   - what belongs to this device or this moment (permissions it was given,
 *     its push registration, audio devices, a ride or convoy in progress,
 *     offline map packs whose tiles aren't in the file, demo mode);
 *   - IndexedDB (overlay videos, map tiles, radio stations): too big for a file.
 *
 * The unlock pattern's hash is in it, so Public Road Privacy can't be lifted
 * by restoring a backup onto a phone with no pattern.
 */
const PREFIXES = ['blacktop', 'bt.', 'bt-'];
const LEFT_OUT = new Set([
  'blacktop_profile',
  'blacktop_profile_country',
  'blacktop_enterprise_workspaces',
  'bt.card_wars.v1',
  'bt.server_caps',
  'blacktop_active_convoy_id',
  'blacktop_active_ride',
  'blacktop_convoy_merge',
  'blacktop_derez_lobby_id',
  'blacktop_burn_reveal',
  'blacktop_demo_mode',
  'blacktop_crash_trace',
  'blacktop_devicecheck_last',
  'blacktop_location_granted',
  'blacktop_motion_granted',
  'blacktop_motion_refused_at',
  'blacktop_push_nudged',
  'blacktop_voice_state',
  'blacktop_audio_input',
  'blacktop_audio_output',
  'bt.push.enabled.v1',
  'bt.push.location.v1',
  'bt.map.offlinePacks.v1',
]);

const inBackup = (key: string) => PREFIXES.some((p) => key.startsWith(p)) && !LEFT_OUT.has(key);

export interface Backup {
  app: 'blacktop';
  kind: 'backup';
  v: 1;
  /** When it was made (ISO). */
  at: string;
  keys: Record<string, string>;
}

function ourKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && inBackup(k)) keys.push(k);
  }
  return keys;
}

export function makeBackup(): Backup {
  const keys: Record<string, string> = {};
  for (const k of ourKeys()) {
    const v = localStorage.getItem(k);
    if (v != null) keys[k] = v;
  }
  return { app: 'blacktop', kind: 'backup', v: 1, at: new Date().toISOString(), keys };
}

export const backupFileName = (b: Backup) => `blacktop-backup-${b.at.slice(0, 10)}.json`;

/** Reads a file the rider picked: the backup, or null if it isn't one. Only our own keys are kept. */
export function parseBackup(text: string): Backup | null {
  try {
    const raw = JSON.parse(text) as Partial<Backup> | null;
    if (!raw || raw.app !== 'blacktop' || raw.kind !== 'backup' || raw.v !== 1 || typeof raw.keys !== 'object' || !raw.keys) return null;
    const keys: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.keys)) if (inBackup(k) && typeof v === 'string') keys[k] = v;
    if (!Object.keys(keys).length) return null;
    return { app: 'blacktop', kind: 'backup', v: 1, at: typeof raw.at === 'string' ? raw.at : '', keys };
  } catch {
    return null;
  }
}

/**
 * Replaces what's on the phone with the backup. All or nothing: if the phone
 * runs out of room part-way, what was there is put back and false comes back.
 * The caller reloads the app after a true (every store reads storage at start).
 */
export function restoreBackup(b: Backup): boolean {
  const before: Record<string, string> = {};
  for (const k of ourKeys()) before[k] = localStorage.getItem(k) ?? '';
  const put = (keys: Record<string, string>) => {
    for (const k of ourKeys()) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v);
  };
  try {
    put(b.keys);
    return true;
  } catch {
    try {
      put(before);
    } catch {
      // It fitted a moment ago; nothing more to try.
    }
    return false;
  }
}
