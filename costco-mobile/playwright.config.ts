// Visual regression tests: Playwright screenshots of the Expo web export.
// Run: npm run build:web && npm run test:visual
//
// Baselines are per-platform ({platform} in the path) because font rendering
// differs between macOS and Linux. CI (Linux, pinned Playwright Docker image)
// is the source of truth — only *-linux.png baselines are committed; local
// macOS baselines are gitignored and just for local before/after checks.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    // Strict: a few dozen pixels of anti-aliasing noise at most. A ratio-based
    // tolerance (1%) let a changed tagline through unnoticed.
    toHaveScreenshot: { maxDiffPixels: 50, threshold: 0.2, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['iPhone 13'],
    // Chromium only — WebKit isn't needed to catch layout/color regressions.
    browserName: 'chromium',
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
