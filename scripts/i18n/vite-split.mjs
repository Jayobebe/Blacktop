/**
 * Vite plugin: ships each language dictionary in two parts.
 *
 *   virtual:i18n-dicts   →  { parts: { de: { main, extra }, … } }  (loaders)
 *
 * `main` is every string the app can show outside the "extra" pages, loaded
 * before the app starts (lib/i18n initI18n). `extra` is text only the legal
 * pages, the demo tour and the Enterprise demos use (about a third of each
 * language), loaded when one of those pages opens or once the app is idle.
 * Strings no code uses any more aren't shipped at all.
 *
 * Only `vite build` splits; the dev server serves each whole file as `main`.
 * The locale files and the translation tooling (scripts/i18n) don't change.
 *
 * A string counts as used by a file when it's the first argument of a tr()
 * call there, or appears as any plain string literal (data passed to tr()
 * later). A string goes to `extra` only when every such use is in an extra
 * file; anything uncertain stays in `main`.
 */
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const VIRTUAL = 'virtual:i18n-dicts';
const PART = 'virtual:i18n-dict/';

/** Files whose text can wait (paths relative to src, forward slashes). */
const EXTRA = [
  /^pages\/(Terms|PrivacyPolicy|DemoShowcase|EnterpriseDemo)\.tsx$/,
  /^components\/demo\//,
  /^features\/enterprise\/lib\/demoFlows\.ts$/,
  /^features\/enterprise\/demo\.ts$/,
];

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'locales') sourceFiles(p, out);
    } else if (/\.(tsx?|mjs)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** key → 'main' | 'extra' for every string literal in the app. */
function classify(srcDir) {
  const where = new Map();
  for (const file of sourceFiles(srcDir)) {
    const rel = relative(srcDir, file).split(sep).join('/');
    const part = EXTRA.some((re) => re.test(rel)) ? 'extra' : 'main';
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const k = node.text;
        if (k && where.get(k) !== 'main') where.set(k, part);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return where;
}

export function i18nSplit({ srcDir, localesDir }) {
  let split = false;
  let where = null;
  const langs = () => readdirSync(localesDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

  return {
    name: 'blacktop-i18n-split',
    configResolved(config) {
      split = config.command === 'build';
    },
    // Chunks named for their language and part (i18n-de-main-<hash>.js).
    outputOptions(out) {
      const prev = out.chunkFileNames;
      out.chunkFileNames = (chunk) => {
        const id = chunk.facadeModuleId ?? '';
        if (id.startsWith('\0' + PART)) return `assets/i18n-${id.slice(PART.length + 1).replace('/', '-')}-[hash].js`;
        return typeof prev === 'function' ? prev(chunk) : prev ?? 'assets/[name]-[hash].js';
      };
      return out;
    },
    resolveId(id) {
      if (id === VIRTUAL || id.startsWith(PART)) return '\0' + id;
    },
    load(id) {
      if (id === '\0' + VIRTUAL) {
        const entries = langs().map(
          (l) => `  ${JSON.stringify(l)}: { main: () => import(${JSON.stringify(`${PART}${l}/main`)}), extra: () => import(${JSON.stringify(`${PART}${l}/extra`)}) }`,
        );
        return `export const parts = {\n${entries.join(',\n')}\n};\n`;
      }
      if (!id.startsWith('\0' + PART)) return;
      const [lang, part] = id.slice(PART.length + 1).split('/');
      const file = join(localesDir, `${lang}.json`);
      this.addWatchFile(file);
      const all = JSON.parse(readFileSync(file, 'utf8'));
      let out = all;
      if (!split) out = part === 'main' ? all : {};
      else {
        where ??= classify(srcDir);
        out = {};
        for (const [k, v] of Object.entries(all)) {
          const w = where.get(k);
          if (w && w === part) out[k] = v;
        }
      }
      // JSON.parse of a string is quicker to start than a big object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(out))});\n`;
    },
  };
}
