import { test, expect, expectHealthy } from './fixtures';

test('a new rider sees the welcome screen', async ({ page, errors }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /get started/i }).first()).toBeVisible();
  await expectHealthy(page, errors);
});

test.describe('signed in', () => {
  test.use({});

  test('Home opens with the ride tiles', async ({ page, signedIn, errors }) => {
    void signedIn;
    await page.goto('/');
    await expect(page.getByText('Convoy', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-nav="history"]').first()).toBeVisible();
    await expectHealthy(page, errors);
  });

  const screens: [string, RegExp][] = [
    ['/settings', /settings/i],
    ['/history', /history/i],
    ['/stats', /stat/i],
    ['/wrapped/week', /wrapped/i],
    ['/garage', /garage/i],
    ['/calendar', /calendar/i],
    ['/world', /world/i],
    ['/whats-new', /what's new/i],
    ['/storage', /storage/i],
    ['/arcade', /arcade/i],
    ['/track', /track/i],
    ['/solo-lobby', /.+/],
    ['/create-convoy', /.+/],
    ['/join-convoy', /.+/],
    ['/routes/new', /.+/],
    ['/crew/leaderboard', /leaderboard/i],
    ['/privacy', /privacy/i],
    ['/terms', /terms/i],
  ];
  for (const [path, title] of screens) {
    test(`${path} opens`, async ({ page, signedIn, errors }) => {
      void signedIn;
      await page.goto(path);
      await expect(page.locator('h1').first()).toHaveText(title, { timeout: 30_000 });
      await expectHealthy(page, errors);
    });
  }

  test('the map opens from Home', async ({ page, signedIn, errors }) => {
    void signedIn;
    await page.goto('/');
    await page.getByRole('button', { name: /open the map|open map/i }).first().click();
    await expect(page.getByPlaceholder('Search destination...')).toBeVisible({ timeout: 30_000 });
    await expectHealthy(page, errors);
  });

  test('a ride starts, the rescue check asks first, and the ride ends', async ({ page, signedIn, errors }) => {
    void signedIn;
    // As a rider does: the solo lobby's Start (a ride can't be opened by its address with none going).
    await page.goto('/solo-lobby');
    await page.getByRole('button', { name: /^start (ride|drive)$/i }).first().click();
    await expect(page).toHaveURL(/\/ride$/);
    const rescue = page.locator('[data-tip="rescue"]:visible').first();
    await expect(rescue).toBeVisible({ timeout: 30_000 });
    // The R has to be held: a tap only says so, a hold asks "Are you okay?" and sends nothing until answered.
    const box = await rescue.boundingBox();
    if (!box) throw new Error('no rescue button');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1500);
    await page.mouse.up();
    const ask = page.getByRole('alertdialog', { name: 'Are you okay?' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: /i'm okay/i }).click();
    await expect(ask).toHaveCount(0);
    // Ending takes two taps.
    const end = page.locator('[data-tip="end-ride"]:visible').first();
    await end.click();
    await page.locator('[data-tip="end-ride"]:visible').first().click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await expectHealthy(page, errors);
  });
});
