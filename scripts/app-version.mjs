/**
 * Prints the app's version: the newest release's in What's new (src/lib/whatsNew.ts,
 * "Version 1.24" on the list), so the store versions are the ones riders read in the app.
 * The native build workflow passes it to Android (versionName) and iOS (MARKETING_VERSION).
 */
import { readFileSync } from 'node:fs';

const m = readFileSync('src/lib/whatsNew.ts', 'utf8').match(/version:\s*'(\d+(?:\.\d+){1,2})'/);
if (!m) {
  console.error("No version: '…' found in src/lib/whatsNew.ts");
  process.exit(1);
}
console.log(m[1]);
