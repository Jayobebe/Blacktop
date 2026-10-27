/**
 * Things renamed after phones had already saved them under the old names,
 * carried over so nobody loses anything. Run once at start (main.tsx, before
 * the app's stores read storage) and on a backup file being restored (an older
 * file still has the old names). Every step is safe to run again. Imports
 * nothing, like lib/backup.ts, so the backup check can run it.
 *
 * - SwitchBack (was Card Wars, then BlackGrid; 2026-10-20): the game's store
 *   and its how-to mark, sticker ids (`cw:` → `sb:`), artwork paths
 *   (`/card-wars/` → `/switchback/`) and the page id of its first-time tips.
 * - Gridlock (was Derez Legacy): its wins and the lobby the phone was in.
 * - Plan a route (was Save a route, 2026-10-27): the page id of its first-time tips.
 */

/** Old storage key → new. */
const KEYS: Record<string, string> = {
  'bt.card_wars.v1': 'bt.switchback.v1',
  'bt.card_wars_howto': 'bt.switchback_howto',
  blacktop_arcade_legacy_derez_wins: 'blacktop_arcade_gridlock_wins',
  blacktop_derez_lobby_id: 'blacktop_gridlock_lobby_id',
};

/** What's inside a saved value that was renamed too (artwork paths, sticker ids, a tips page id). */
function renameInside(key: string, value: string): string {
  let v = value.split('/card-wars/').join('/switchback/');
  if (key === 'blacktop_stickers') v = v.split('"cw:').join('"sb:');
  if (key === 'blacktop_page_tips') v = v.split('"card-wars"').join('"switchback"').split('"save-route-pick"').join('"plan-route-pick"');
  return v;
}

/** The same carry-over for a backup file's keys (an older file has the old names). */
export function renameBackupKeys(keys: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(keys)) {
    const name = KEYS[k] ?? k;
    if (name !== k && name in keys) continue; // the file has both: the new one wins
    out[name] = typeof v === 'string' ? renameInside(name, v) : v;
  }
  return out;
}

export function carryOverRenamedKeys() {
  try {
    for (const [from, to] of Object.entries(KEYS)) {
      const old = localStorage.getItem(from);
      if (old == null) continue;
      if (localStorage.getItem(to) == null) localStorage.setItem(to, old);
      localStorage.removeItem(from);
    }
    for (const key of ['bt.switchback.v1', 'blacktop_stickers', 'blacktop_page_tips']) {
      const v = localStorage.getItem(key);
      if (v == null) continue;
      const next = renameInside(key, v);
      if (next !== v) localStorage.setItem(key, next);
    }
  } catch {
    /* storage unavailable: nothing to carry */
  }
}
