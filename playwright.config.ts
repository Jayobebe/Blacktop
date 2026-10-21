import { defineConfig, devices, chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Smoke tests (`npm run e2e`): the production build of the app, served locally
 * and driven in a phone-sized Chromium, with the Supabase server played by the
 * tests themselves (e2e/fixtures.ts), so they need no internet and no account.
 * They walk the paths a rider can't do without: launch, Home, every main
 * screen, the map, a ride started and ended, and the rescue check. They'd have
 * caught the 2026-10-21 launch crash (a router hook outside the router).
 */
const PORT = 4180;

/**
 * Playwright's own Chromium when it's installed; otherwise any complete Chromium a
 * Playwright install left on this machine (on Windows, Defender has been seen to stop
 * the download unpacking, leaving the right version missing); E2E_CHROME overrides both.
 */
function chromePath(): string | undefined {
  if (process.env.E2E_CHROME) return process.env.E2E_CHROME;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    /* fall through */
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : join(process.env.HOME || '', '.cache', 'ms-playwright'));
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    for (const sub of ['chrome-win64', 'chrome-win', 'chrome-linux', 'chrome-linux64']) {
      for (const exe of ['chrome.exe', 'chrome']) {
        const p = join(root, dir, sub, exe);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    // The full Chromium, headless (no separate headless-shell download needed).
    channel: 'chromium',
    launchOptions: { executablePath: chromePath() },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    geolocation: { latitude: 53.874, longitude: -3.02 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
  },
  webServer: {
    // The real production build, pointed at a Supabase address the tests answer for.
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:59999',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key',
      VITE_SUPABASE_PROJECT_ID: 'e2e',
    },
  },
});
