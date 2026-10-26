/**
 * npm run app-links
 *
 * Writes the two files that let blacktoplive.com links open the Android and
 * iOS apps instead of the browser, into public/.well-known (served from the
 * site's root once the site is deployed):
 *
 *   assetlinks.json              Android App Links: the app id and the SHA-256 of every key it's signed with
 *   apple-app-site-association   iOS universal links: TEAMID.bundle id and the paths (only once APPLE_TEAM_ID is set)
 *
 * and checks that the Android manifest's link filter claims the same paths as
 * PATHS below (it fails if they've drifted). Fill in the constants as the
 * accounts are set up, run it, commit the files and deploy the site.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const APP_ID = 'com.blacktoplive.app';

/** The Apple Developer team id (Membership details, 10 characters). Empty: no iOS file yet. */
const APPLE_TEAM_ID = '';

/**
 * SHA-256 fingerprints of the keys the store app reaches phones signed with: Google Play's app
 * signing key from Play Console → Test and release → App integrity (Play re-signs what you upload
 * with it), and the upload key if release builds are installed directly. Empty: no Android file yet.
 *
 * Never the test key (android/app/test-signing.p12): it's public in this repo, so anyone could sign
 * an app with it, and listing it here would let that app take blacktoplive.com links (join codes,
 * Enterprise tokens) on a phone it's installed on. The test app opens links in the browser instead.
 */
const ANDROID_FINGERPRINTS = [];

/** Paths the apps open: the links riders send each other. */
const PATHS = ['/join', '/crew/join', '/enterprise', '/rescue', '/spectate', '/arcade'];

const dir = 'public/.well-known';
mkdirSync(dir, { recursive: true });

const assetlinks = `${dir}/assetlinks.json`;
if (ANDROID_FINGERPRINTS.length) {
  writeFileSync(
    assetlinks,
    JSON.stringify(
      [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: APP_ID, sha256_cert_fingerprints: ANDROID_FINGERPRINTS },
        },
      ],
      null,
      2,
    ) + '\n',
  );
  console.log(`wrote ${assetlinks} (${ANDROID_FINGERPRINTS.length} key${ANDROID_FINGERPRINTS.length === 1 ? '' : 's'})`);
} else {
  if (existsSync(assetlinks)) rmSync(assetlinks);
  console.log('no Play signing key yet: no assetlinks.json');
}

const aasa = `${dir}/apple-app-site-association`;
if (APPLE_TEAM_ID) {
  writeFileSync(
    aasa,
    JSON.stringify(
      {
        applinks: {
          details: [
            {
              appIDs: [`${APPLE_TEAM_ID}.${APP_ID}`],
              components: PATHS.flatMap((p) => [{ '/': p }, { '/': `${p}/*` }]),
            },
          ],
        },
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`wrote ${aasa}`);
} else {
  if (existsSync(aasa)) rmSync(aasa);
  console.log('no APPLE_TEAM_ID yet: no apple-app-site-association');
}

// The manifest's link filter must claim the same paths.
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const claimed = [...manifest.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]).sort();
const want = [...PATHS].sort();
if (claimed.join() !== want.join()) {
  console.error(`AndroidManifest.xml claims ${claimed.join(', ')}; PATHS here is ${want.join(', ')}. Make them match.`);
  process.exit(1);
}
console.log('AndroidManifest.xml claims the same paths');
