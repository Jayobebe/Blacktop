import { test as base, expect, type Page } from '@playwright/test';

/**
 * What every smoke test shares:
 * - `server`: the Supabase server played locally (auth answers a signed-in
 *   rider, the profile has a name, every table read is empty, every server
 *   cap probe says "not deployed", functions answer empty). Anything else off
 *   the machine is refused, so the tests never touch the internet.
 * - `signedIn`: a rider already set up (a session, a profile, tips and the
 *   tour offer out of the way), as if they'd opened the app before.
 * - `errors`: every uncaught error on the page; each test ends by checking
 *   there were none and the "Something went wrong" screen never showed.
 */
const SUPABASE = 'http://127.0.0.1:59999';
const USER_ID = '00000000-0000-4000-8000-000000000e2e';

function fakeJwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.e2e`;
}

const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(), is_anonymous: true };

async function playServer(page: Page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!local) return route.abort();
    if (!url.href.startsWith(SUPABASE)) return route.continue();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });
    if (route.request().method() === 'OPTIONS') return json({});
    const path = url.pathname;
    if (path.startsWith('/auth/v1/user')) return json(user);
    if (path.startsWith('/auth/v1/token')) return json({ access_token: fakeJwt(), token_type: 'bearer', expires_in: 2592000, refresh_token: 'e2e', user });
    if (path.startsWith('/auth/v1/')) return json({});
    if (path.startsWith('/rest/v1/profiles')) {
      // maybeSingle asks for one object.
      const one = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
      return json(one ? { display_name: 'E2E Rider' } : [{ display_name: 'E2E Rider' }]);
    }
    // Server features stay off: every cap probe and write answers "function not deployed".
    if (path.startsWith('/rest/v1/rpc/')) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    if (path.startsWith('/rest/v1/')) return json([]);
    if (path.startsWith('/functions/v1/')) return json([]);
    return json({});
  });
}

async function signIn(page: Page) {
  const session = { access_token: fakeJwt(), token_type: 'bearer', expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: 'e2e', user };
  await page.addInitScript(
    ([s, created]) => {
      try {
        if (sessionStorage.getItem('e2e-seeded')) return;
        sessionStorage.setItem('e2e-seeded', '1');
        localStorage.setItem('sb-127-auth-token', s);
        localStorage.setItem('blacktop_profile', JSON.stringify({ name: 'E2E Rider', createdAt: created, preferredNavApp: 'google' }));
        localStorage.setItem('blacktop_page_tips', JSON.stringify({ pages: [], off: true }));
        localStorage.setItem('blacktop_tour_offered', '1');
        // Seen before: the first ride's note about keeping the screen on.
        localStorage.setItem('blacktop_screen_on_tip', '1');
      } catch {
        /* the test will say so */
      }
    },
    [JSON.stringify(session), new Date().toISOString()] as const,
  );
}

export const test = base.extend<{ server: void; signedIn: void; errors: string[] }>({
  server: [async ({ page }, run) => {
    await playServer(page);
    await run();
  }, { auto: true }],
  errors: async ({ page }, run) => {
    const errors: string[] = [];
    // The message and the top of its stack, so a failure says where it came from.
    page.on('pageerror', (e) => errors.push([e.message, ...(e.stack || '').split('\n').slice(1, 4)].join('\n')));
    await run(errors);
  },
  signedIn: async ({ page }, run) => {
    await signIn(page);
    await run();
  },
});

/** No uncaught error, and the error screen never showed. */
export async function expectHealthy(page: Page, errors: string[]) {
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  expect(errors, `uncaught errors:\n${errors.join('\n')}`).toEqual([]);
}

export { expect };
