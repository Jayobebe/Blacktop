/**
 * Lists every translatable string (the first argument of each tr("…") call)
 * and reports what each language dictionary is missing.
 *
 *   npm run i18n:check                    summary per language
 *   node scripts/i18n/extract.mjs --missing de   the German gaps, as JSON
 *
 * Writes scripts/i18n/keys.json (all keys, sorted), and the push notifications'
 * own strings: every say("…") / words("…") in supabase/functions/send-push is a
 * key here too (translated with the rest), and the translations it uses are written
 * to send-push/strings.ts, which the function reads (it can't see src).
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const LOCALES = join(SRC, 'lib', 'i18n', 'locales');

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const keys = new Set();
for (const file of files(SRC)) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes('tr(')) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'tr') {
      const a = node.arguments[0];
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.add(a.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
// The push notifications (send-push/i18n.ts): say("…"), u.say("…") and words("…").
const PUSH = join(ROOT, 'supabase', 'functions', 'send-push');
const pushKeys = new Set();
for (const file of existsSync(PUSH) ? files(PUSH) : []) {
  if (file.endsWith('strings.ts')) continue;
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : '';
      const a = node.arguments[0];
      if ((name === 'say' || name === 'words') && a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) pushKeys.add(a.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
for (const k of pushKeys) keys.add(k);
const sorted = [...keys].sort();
writeFileSync(join(ROOT, 'scripts', 'i18n', 'keys.json'), JSON.stringify(sorted, null, 1));

// send-push/strings.ts: for each language, the push keys it has a translation for.
if (existsSync(PUSH)) {
  const pushSorted = [...pushKeys].sort();
  const table = {};
  for (const l of readdirSync(LOCALES).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort()) {
    const dict = JSON.parse(readFileSync(join(LOCALES, `${l}.json`), 'utf8'));
    table[l] = Object.fromEntries(pushSorted.filter((k) => dict[k]).map((k) => [k, dict[k]]));
  }
  writeFileSync(
    join(PUSH, 'strings.ts'),
    "// Written by scripts/i18n/extract.mjs (npm run i18n:check) from the app's translations: do not edit.\n" +
      '// Every say("…") / words("…") in send-push, by language (English is the key itself).\n' +
      `export const STRINGS: Record<string, Record<string, string>> = ${JSON.stringify({ en: {}, ...table }, null, 1)}\n`,
  );
}

const missingFor = process.argv.includes('--missing') ? process.argv[process.argv.indexOf('--missing') + 1] : null;
const langs = existsSync(LOCALES) ? readdirSync(LOCALES).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')) : [];
if (missingFor) {
  const file = join(LOCALES, `${missingFor}.json`);
  const dict = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  console.log(JSON.stringify(sorted.filter((k) => !dict[k]), null, 1));
} else {
  console.log(`${sorted.length} strings`);
  for (const l of langs.sort()) {
    const dict = JSON.parse(readFileSync(join(LOCALES, `${l}.json`), 'utf8'));
    const missing = sorted.filter((k) => !dict[k]).length;
    const stale = Object.keys(dict).filter((k) => !keys.has(k)).length;
    console.log(`${l}: ${sorted.length - missing}/${sorted.length} translated${missing ? `, ${missing} missing` : ''}${stale ? `, ${stale} unused` : ''}`);
  }
}
