// `npx cap sync` on Windows writes the iOS Swift package's plugin paths with
// backslashes (..\..\..\node_modules\@capacitor\app), which Xcode on a Mac
// can't read. `npm run cap:sync` runs this straight after to put them right.
import fs from 'node:fs';

const file = 'ios/App/CapApp-SPM/Package.swift';
if (fs.existsSync(file)) {
  const src = fs.readFileSync(file, 'utf8');
  const fixed = src.replace(/path: "([^"]+)"/g, (_, p) => `path: "${p.split('\\').join('/')}"`);
  if (fixed !== src) {
    fs.writeFileSync(file, fixed);
    console.log('fix-ios-spm: plugin paths now use forward slashes');
  }
}
