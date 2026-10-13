// Fails if anything about crypto payments is left in `dist` after a store build (the app stores don't allow
// them, and a hidden feature in the binary is its own reason for a rejection). Run by cap-sync-store.mjs;
// on its own: CAP_BUNDLED=1 npx vite build && node scripts/check-store-build.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FOUND = /nimiq|usdt|blacktank|pay up|polygonscan/gi;
const files = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(js|mjs|css|html|json|webmanifest|txt|xml)$/.test(name)) out.push(p);
  }
  return out;
};
let bad = 0;
for (const f of files('dist')) {
  // The circuit library is OpenStreetMap data (a track could be called anything).
  if (f.split(/[\\/]/).includes('circuits')) continue;
  const text = readFileSync(f, 'utf8');
  const hits = [...text.matchAll(FOUND)];
  if (!hits.length) continue;
  bad += hits.length;
  const at = hits[0].index;
  console.error(`${f}: ${hits.length} × (${[...new Set(hits.map((h) => h[0].toLowerCase()))].join(', ')})  …${text.slice(Math.max(0, at - 60), at + 60).replace(/\s+/g, ' ')}…`);
}
if (bad) {
  console.error(`\nStore build check FAILED: ${bad} mentions of crypto payments left in dist. Put the code behind !__STORE_BUILD__ (src/vite-env.d.ts).`);
  process.exit(1);
}
console.log('Store build check passed: nothing about crypto payments in dist.');
