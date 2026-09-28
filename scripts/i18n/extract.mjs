/**
 * Lists every translatable string (the first argument of each tr("…") call)
 * and reports what each language dictionary is missing.
 *
 *   npm run i18n:check                    summary per language
 *   node scripts/i18n/extract.mjs --missing de   the German gaps, as JSON
 *
 * Writes scripts/i18n/keys.json (all keys, sorted).
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
const sorted = [...keys].sort();
writeFileSync(join(ROOT, 'scripts', 'i18n', 'keys.json'), JSON.stringify(sorted, null, 1));

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
