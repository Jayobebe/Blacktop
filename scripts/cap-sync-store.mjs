// The store build: syncs the native shells with the app's own files bundled in
// (CAP_BUNDLED=1 drops capacitor.config.ts's server.url), then fixes the iOS
// package paths like `npm run cap:sync`. `npm run cap:sync:store` builds first.
import { spawnSync } from 'node:child_process';

const env = { ...process.env, CAP_BUNDLED: '1' };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npx', ['cap', 'sync']);
run('node', ['scripts/fix-ios-spm.mjs']);
