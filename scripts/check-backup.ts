/**
 * npm run backup:check
 *
 * Fills a made-up phone with one of everything Blacktop stores, saves a backup,
 * restores it onto an empty phone and onto one that already has data, and
 * fails if anything that should travel didn't, or anything that shouldn't did.
 * It also reads the app's source for every storage key it can find and fails
 * on one that is neither backed up nor deliberately left out, so a new key
 * can't be forgotten.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

class Storage {
  map = new Map<string, string>();
  full = false;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) {
    if (this.full) throw new Error('QuotaExceededError');
    this.map.set(k, String(v));
  }
  removeItem(k: string) { this.map.delete(k); }
}
const phone = (data: Record<string, string>) => {
  const s = new Storage();
  for (const [k, v] of Object.entries(data)) s.map.set(k, v);
  (globalThis as { localStorage?: unknown }).localStorage = s;
  return s;
};

const { makeBackup, parseBackup, restoreBackup, vaultPicks, VAULT_KEY } = await import('../src/lib/backup');
const source = readFileSync('src/lib/backup.ts', 'utf8');
const LEFT_OUT = [...source.slice(source.indexOf('const LEFT_OUT'), source.indexOf(']);')).matchAll(/'([^']+)'/g)].map((m) => m[1]);

let failed = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? `  (${extra})` : ''}`);
};

// ── Every storage key in the source is either carried or left out on purpose ──
const files = (dir: string, out: string[] = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};
const found = new Set<string>();
// A key is a quoted name on our prefixes that is handed to storage somewhere, directly or as a constant.
for (const f of files('src')) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/['"`]((?:blacktop[_-]|bt\.)[A-Za-z0-9_.:-]+)['"`]/g)) found.add(m[1]);
}
// Names on the prefixes that aren't storage keys (map layers, events, caches, CSS, databases).
const NOT_KEYS = /^(blacktop-(badges|buildings-3d|card-copies|dem|devicecheck|enterprise|pilot-voice|poi-saved|radio|recent-saved|rescue-.*|ride|route.*|tile|user-marker|water-wordmark|world)|blacktop_tile_cache|blacktop_overlays|bt-.*)$/;
const keys = [...found].filter((k) => !NOT_KEYS.test(k)).sort();
const carried = keys.filter((k) => !LEFT_OUT.includes(k));
console.log(`${keys.length} storage keys in the source: ${carried.length} carried, ${keys.length - carried.length} left out on purpose`);
ok('nothing is left out that the list does not name', LEFT_OUT.every((k) => keys.includes(k) || k === 'bt.card_wars.v1'), LEFT_OUT.filter((k) => !keys.includes(k)).join(', '));

// ── A phone with one of everything ──
const vault = {
  deck: ['w11', 'f2004', 'rb19', 'gp23', 'rsgp'],
  tags: ['tag:boost:gp23', 'tag:heal:gs', 'tag-wild:heal:car'],
  rewards: ['911', 'civic'],
  unlocks: ['mt07'],
  run: { id: 'battle-in-progress' },
  wear: { w11: 62 },
  owned: ['w11'],
  wearQueue: [{ id: 'x' }],
};
const old: Record<string, string> = {};
for (const k of keys) old[k] = JSON.stringify({ key: k, value: `data for ${k}`, n: [1, 2, 3], unicode: 'ride — 走る 🏍' });
old['blacktop_profile'] = JSON.stringify({ name: 'Jesse', createdAt: '2026-01-01T00:00:00.000Z', preferredNavApp: 'blacktop' });
old['bt.card_wars.v1'] = JSON.stringify(vault);
old['blacktop:crew:ABC123'] = 'a key made from a crew code';
old['sb-xwagsaqsomzrubfpjaad-auth-token'] = 'the sign-in, which is the account and never in a file';
old['someone-elses-key'] = 'not ours';

phone(old);
const file = JSON.stringify(makeBackup());
const read = parseBackup(file);
ok('the file reads back as a backup', !!read);

// ── Onto an empty phone ──
let next = phone({});
ok('restores', restoreBackup(read!));
const missing = carried.filter((k) => next.getItem(k) !== old[k]);
ok('every carried key arrives exactly as it was', missing.length === 0, missing.join(', '));
ok('a key made from a code arrives too', next.getItem('blacktop:crew:ABC123') === old['blacktop:crew:ABC123']);
const leaked = LEFT_OUT.filter((k) => k !== 'bt.card_wars.v1' && next.getItem(k) !== null);
ok('nothing left out on purpose arrives', leaked.length === 0, leaked.join(', '));
ok('the sign-in and other apps\' keys are never in the file', !file.includes('never in a file') && !file.includes('not ours'));
const arrived = JSON.parse(next.getItem(VAULT_KEY) ?? '{}');
ok('Card Wars: the deck, dog tags and cards won on the phone arrive', JSON.stringify([arrived.deck, arrived.tags, arrived.rewards, arrived.unlocks]) === JSON.stringify([vault.deck, vault.tags, vault.rewards, vault.unlocks]));
ok('Card Wars: the battle in progress and what the server said do not', !('run' in arrived) && !('wear' in arrived) && !('owned' in arrived) && !('wearQueue' in arrived));

// ── Onto a phone that already has data ──
next = phone({ blacktop_rides: 'the rides this phone had', 'bt.garage.v1': 'its garage', blacktop_location_granted: '1', 'bt.card_wars.v1': JSON.stringify({ deck: ['mx5'], tags: [], rewards: [], unlocks: [], run: { id: 'theirs' }, wear: { mx5: 80 } }), other: 'untouched' });
ok('restores over existing data', restoreBackup(read!));
ok('what the phone had is replaced', next.getItem('blacktop_rides') === old['blacktop_rides'] && next.getItem('bt.garage.v1') === old['bt.garage.v1']);
ok('what belongs to the device stays', next.getItem('blacktop_location_granted') === '1' && next.getItem('other') === 'untouched');
const merged = JSON.parse(next.getItem(VAULT_KEY) ?? '{}');
ok('Card Wars: the backup\'s deck over the phone\'s, its battle in progress kept', merged.deck.join() === vault.deck.join() && merged.run?.id === 'theirs' && merged.wear?.mx5 === 80);

// ── No room: all or nothing ──
const before = { blacktop_rides: 'the rides this phone had', 'bt.card_wars.v1': JSON.stringify({ deck: ['mx5'], tags: [], rewards: [] }) };
next = phone(before);
const real = next.setItem.bind(next);
let writes = 0;
next.setItem = (k: string, v: string) => {
  // Runs out of room part-way through the restore, then has room again for what was there.
  if (++writes === 5) throw new Error('QuotaExceededError');
  real(k, v);
};
ok('a phone that runs out of room says so', restoreBackup(read!) === false);
ok('and is left exactly as it was', next.getItem('blacktop_rides') === before.blacktop_rides && next.getItem(VAULT_KEY) === before['bt.card_wars.v1'] && next.map.size === 2, `${next.map.size} keys`);

// ── Files that aren't backups, or are tampered with ──
ok('not a backup', parseBackup('{"app":"other"}') === null && parseBackup('not json') === null && parseBackup('{"app":"blacktop","kind":"backup","v":1,"keys":{}}') === null);
const tampered = parseBackup(JSON.stringify({ app: 'blacktop', kind: 'backup', v: 1, at: '', keys: { blacktop_rides: 'r', blacktop_demo_mode: '1', 'sb-auth': 'x', evil: 'y', 'bt.card_wars.v1': JSON.stringify({ deck: ['w11'], owned: ['everything'], run: { id: 'forged' } }) } }));
ok('a file can only set our own carried keys', !!tampered && Object.keys(tampered.keys).sort().join() === 'blacktop_rides,bt.card_wars.v1');
ok('and only the choices from its Card Wars entry', tampered?.keys[VAULT_KEY] === JSON.stringify({ deck: ['w11'], tags: [], rewards: [], unlocks: [] }));
ok('an empty vault is not worth carrying', vaultPicks(JSON.stringify({ deck: [], tags: [], rewards: [] })) === null);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll backup checks passed');
