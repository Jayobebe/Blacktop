/**
 * Wraps user-facing English text in `tr()` so it can be translated.
 *
 *   node scripts/i18n/wrap.mjs --dry     count what would change
 *   node scripts/i18n/wrap.mjs           rewrite files
 *
 * What counts as user-facing text:
 *   - JSX text (`<p>Hello</p>`)
 *   - string attributes that people read (placeholder, title, aria-label,
 *     alt, label, description, subtitle, hint, empty, backLabel…)
 *   - toast(...) messages and their `description`
 *   - object properties that hold display text (label, title, subtitle,
 *     description, text, sub, desc, hint, empty, body, spoken, message…)
 *   - including each branch of `a ? 'X' : 'Y'` / `a || 'X'` in those places,
 *     and template literals (`${n} rides` → tr('{0} rides', [n]))
 * Skipped: strings with no letters, identifier/class/URL-looking strings, and
 * anything already inside tr(). Source text is the translation key.
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const DRY = process.argv.includes('--dry');
const FN = 'tr';
const IMPORT = `import { tr } from '@/lib/i18n';`;

const SKIP_DIRS = ['integrations', join('lib', 'i18n'), '__harness'];
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'description', 'subtitle', 'hint', 'empty', 'backLabel', 'sub', 'text', 'heading', 'caption', 'tooltip', 'emptyText', 'confirmLabel', 'cancelLabel']);
const PROPS = new Set(['label', 'title', 'subtitle', 'description', 'text', 'sub', 'desc', 'hint', 'empty', 'body', 'spoken', 'message', 'heading', 'caption', 'tooltip', 'placeholder', 'cta', 'blurb', 'tagline', 'detail', 'note', 'question', 'answer', 'prompt', 'confirm', 'labelShort', 'shortLabel', 'longLabel', 'unitLabel']);
const TOAST_METHODS = new Set(['success', 'error', 'info', 'warning', 'message', 'loading']);

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(SRC, p);
    if (SKIP_DIRS.some((d) => rel === d || rel.startsWith(d + '\\') || rel.startsWith(d + '/'))) continue;
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const hasLetters = (s) => /\p{L}/u.test(s);
function looksLikeCode(s) {
  const t = s.trim();
  if (!hasLetters(t)) return true;
  if (/^(https?:|mailto:|tel:|\/|#|data:)/.test(t)) return true;
  if (/^[a-z0-9_\-.:/#@]+$/.test(t) && !/^(on|off|or|and|mi|km|mph|kph|am|pm|ok)$/.test(t)) return true; // keys, classes, ids
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 1 && /_/.test(t)) return true; // CONSTANTS
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(t)) return true; // camelCase
  if (/[{}<>;=]|=>|\(\)/.test(t)) return true;
  return false;
}

const keys = new Map(); // text -> first location
let changedFiles = 0;
let wrapped = 0;

function collapse(s) {
  return s.replace(/\s+/g, ' ');
}

for (const file of files(SRC)) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = []; // {start, end, text}
  const rel = relative(ROOT, file);

  const addKey = (k, node) => {
    if (!keys.has(k)) keys.set(k, `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
  };

  const insideTr = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === FN) return true;
    }
    return false;
  };

  /** Wrap a string-ish expression (literal, template, or branches of ?:/||/??) in place. */
  const wrapExpr = (expr) => {
    if (!expr) return;
    if (ts.isParenthesizedExpression(expr)) return wrapExpr(expr.expression);
    if (ts.isConditionalExpression(expr)) {
      wrapExpr(expr.whenTrue);
      wrapExpr(expr.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(expr) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(expr.operatorToken.kind)) {
      if (expr.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) wrapExpr(expr.left);
      wrapExpr(expr.right);
      return;
    }
    if (insideTr(expr)) return;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      const v = expr.text;
      if (looksLikeCode(v)) return;
      addKey(v, expr);
      edits.push({ start: expr.getStart(), end: expr.getEnd(), text: `${FN}(${JSON.stringify(v)})` });
      wrapped++;
      return;
    }
    if (ts.isTemplateExpression(expr)) {
      let key = expr.head.text;
      const args = [];
      expr.templateSpans.forEach((span, i) => {
        key += `{${i}}` + span.literal.text;
        args.push(span.expression.getText());
      });
      if (looksLikeCode(key.replace(/\{\d+\}/g, ' x '))) return;
      if (!hasLetters(key.replace(/\{\d+\}/g, ''))) return;
      addKey(key, expr);
      edits.push({ start: expr.getStart(), end: expr.getEnd(), text: `${FN}(${JSON.stringify(key)}, [${args.join(', ')}])` });
      wrapped++;
    }
  };

  const visit = (node) => {
    // JSX text
    if (ts.isJsxText(node)) {
      const raw = node.getFullText();
      const text = collapse(raw).trim();
      if (text && hasLetters(text) && !/[{}]/.test(text) && !insideTr(node)) {
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        // Keep a space where JSX would have rendered one next to an element.
        const pre = lead && !lead.includes('\n') ? '{" "}' : lead.includes('\n') ? '' : '';
        const post = trail && !trail.includes('\n') ? '{" "}' : '';
        addKey(text, node);
        edits.push({ start: node.getFullStart(), end: node.getEnd(), text: `${lead.includes('\n') ? lead : pre}{${FN}(${JSON.stringify(text)})}${trail.includes('\n') ? trail : post}` });
        wrapped++;
      }
      return;
    }
    // JSX attributes
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText();
      if (ATTRS.has(name)) {
        const init = node.initializer;
        if (ts.isStringLiteral(init)) {
          if (!looksLikeCode(init.text)) {
            addKey(init.text, init);
            edits.push({ start: init.getStart(), end: init.getEnd(), text: `{${FN}(${JSON.stringify(init.text)})}` });
            wrapped++;
          }
        } else if (ts.isJsxExpression(init)) wrapExpr(init.expression);
      }
      return ts.forEachChild(node, visit);
    }
    // {expr} directly in JSX children
    if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      wrapExpr(node.expression);
    }
    // toast('…', { description: '…' })
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      const isToast =
        (ts.isIdentifier(e) && e.text === 'toast') ||
        (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'toast' && TOAST_METHODS.has(e.name.text));
      if (isToast && node.arguments.length) {
        wrapExpr(node.arguments[0]);
        const opts = node.arguments[1];
        if (opts && ts.isObjectLiteralExpression(opts)) {
          for (const pr of opts.properties) {
            if (ts.isPropertyAssignment(pr) && ['description', 'label'].includes(pr.name.getText())) wrapExpr(pr.initializer);
            if (ts.isPropertyAssignment(pr) && pr.name.getText() === 'action' && ts.isObjectLiteralExpression(pr.initializer)) {
              for (const a of pr.initializer.properties) if (ts.isPropertyAssignment(a) && a.name.getText() === 'label') wrapExpr(a.initializer);
            }
          }
        }
      }
    }
    // { label: '…' } display props in data
    if (ts.isPropertyAssignment(node) && PROPS.has(node.name.getText().replace(/['"]/g, ''))) {
      wrapExpr(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!edits.length) continue;
  changedFiles++;
  if (DRY) continue;
  edits.sort((a, b) => b.start - a.start);
  // Drop overlaps (outer edit wins).
  let out = src;
  let lastStart = Infinity;
  for (const ed of edits) {
    if (ed.end > lastStart) continue;
    out = out.slice(0, ed.start) + ed.text + out.slice(ed.end);
    lastStart = ed.start;
  }
  if (!/from '@\/lib\/i18n'/.test(out)) {
    // After the last import (or at the top).
    const importEnd = [...out.matchAll(/^import[\s\S]*?;\s*$/gm)].pop();
    out = importEnd ? out.slice(0, importEnd.index + importEnd[0].length) + '\n' + IMPORT + out.slice(importEnd.index + importEnd[0].length) : IMPORT + '\n' + out;
  }
  writeFileSync(file, out);
}

const sorted = [...keys.keys()].sort();
writeFileSync(join(ROOT, 'scripts', 'i18n', 'keys.json'), JSON.stringify(sorted, null, 1));
const words = sorted.reduce((n, k) => n + k.split(/\s+/).length, 0);
console.log(`${DRY ? '[dry] ' : ''}${wrapped} wraps in ${changedFiles} files; ${sorted.length} unique strings, ~${words} words`);
