// The store build: builds the web app as it goes inside the iOS and Android apps (CAP_BUNDLED=1: no crypto
// payments in it at all, see __STORE_BUILD__ in src/vite-env.d.ts, and capacitor.config.ts drops server.url
// so the app's own files are bundled in), checks nothing about payments is left in it, then syncs the native
// shells and fixes the iOS package paths like `npm run cap:sync`.
import { spawnSync } from 'node:child_process';

const env = { ...process.env, CAP_BUNDLED: '1' };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npx', ['vite', 'build']);
run('node', ['scripts/check-store-build.mjs']);
if (process.argv.includes('--web-only')) process.exit(0);
run('npx', ['cap', 'sync']);
run('node', ['scripts/fix-ios-spm.mjs']);
