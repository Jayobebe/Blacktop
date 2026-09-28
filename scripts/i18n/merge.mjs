/**
 * Merges translation work files into the locale dictionaries.
 *
 *   node scripts/i18n/merge.mjs <dir>
 *
 * <dir>/<lang>/*.txt hold lines "N<TAB>translation", where N is the string's
 * index in scripts/i18n/keys.json. A translation may only use placeholders
 * ({0}, {1}…) the English has, and must keep all but plural suffixes (the
 * `{n}` right after a word, like "day{1}", which only makes sense in
 * English); lines that don't are reported and skipped. Existing
 * entries in src/lib/i18n/locales/<lang>.json are kept unless replaced.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/i18n/merge.mjs <dir>');
  process.exit(1);
}
const ROOT = process.cwd();
const keys = JSON.parse(readFileSync(join(ROOT, 'scripts', 'i18n', 'keys.json'), 'utf8'));
const LOCALES = join(ROOT, 'src', 'lib', 'i18n', 'locales');
mkdirSync(LOCALES, { recursive: true });

const placeholders = (s) => new Set(s.match(/\{\d+\}/g) ?? []);
// "day{1}", "sector{1}": the English plural "s", which other languages drop.
const suffixes = (s) => new Set(s.match(/(?<=[a-z])\{\d+\}/g) ?? []);
const valid = (key, text) => {
  const want = placeholders(key);
  const have = placeholders(text);
  const optional = suffixes(key);
  return [...have].every((p) => want.has(p)) && [...want].every((p) => have.has(p) || optional.has(p));
};

for (const lang of readdirSync(dir)) {
  const langDir = join(dir, lang);
  if (!statSync(langDir).isDirectory()) continue;
  const file = join(LOCALES, `${lang}.json`);
  const dict = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  let added = 0;
  const bad = [];
  for (const f of readdirSync(langDir).filter((x) => x.endsWith('.txt')).sort()) {
    for (const line of readFileSync(join(langDir, f), 'utf8').split(/\r?\n/)) {
      const tab = line.indexOf('\t');
      if (tab < 1) continue;
      const n = Number(line.slice(0, tab));
      const text = line.slice(tab + 1).replace(/\\n/g, '\n');
      const key = keys[n];
      if (key === undefined || !text.trim()) continue;
      if (!valid(key, text)) {
        bad.push(`${lang} #${n}: "${key}" → "${text}"`);
        continue;
      }
      dict[key] = text;
      added++;
    }
  }
  const sorted = Object.fromEntries(Object.keys(dict).sort().map((k) => [k, dict[k]]));
  writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`${lang}: ${added} merged, ${Object.keys(dict).length}/${keys.length} total${bad.length ? `, ${bad.length} rejected` : ''}`);
  bad.forEach((b) => console.log('  ' + b));
}
