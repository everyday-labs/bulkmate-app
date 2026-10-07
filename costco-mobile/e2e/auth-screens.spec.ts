// Visual regression for the signed-out screens — the only ones that render
// without a backend. Each is captured in light and dark mode.
import { expect, test } from '@playwright/test';

const screens = [
  { path: '/login', ready: 'Sign in', name: 'login' },
  { path: '/register', ready: 'Create account', name: 'register' },
  { path: '/forgot-password', ready: 'Reset password', name: 'forgot-password' },
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const { path, ready, name } of screens) {
      test(name, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByText(ready, { exact: true })).toBeVisible();
        // Fonts load asynchronously on web; wait so text metrics are final.
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}-${scheme}.png`, { fullPage: true });
      });
    }
  });
}

test('forgot-password validation keeps the user on the email step', async ({ page }) => {
  await page.goto('/forgot-password');
  // Alert.alert is a no-op on web; the step must not advance without an email.
  await page.getByText('Send Code').click();
  await expect(page.getByText('Reset password', { exact: true })).toBeVisible();
  await expect(page.getByText('Verify Code')).toHaveCount(0);
});
