import { defineConfig, devices } from '@playwright/test';

// Parallele Läufe brauchen eigene Ports, sonst beendet der Teardown des
// einen Laufs den wiederverwendeten Dev-Server des anderen.
const port = process.env.PLAYWRIGHT_PORT ?? '4330';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: process.env.PLAYWRIGHT_REPORT_DIR ?? 'playwright-report',
      },
    ],
  ],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Der Willkommenshinweis erscheint bei jedem Besuch und darf die
    // Szenarien nicht als Overlay blockieren: Der Dev-Server läuft mit
    // PLAYWRIGHT_TEST=1 (siehe webServer.env unten) und rendert das Modal
    // dann serverseitig nicht.
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `ASTRO_DEV_BACKGROUND=0 npm run dev -- --port ${port}`,
    // PLAYWRIGHT_TEST markiert die Test-Umgebung; der Limiter hebt darauf
    // die Login-Budgets, auch bei manuell vor gestarteten Servern.
    env: { PLAYWRIGHT_TEST: '1' },
    url: baseURL,
    reuseExistingServer:
      !process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER !== '0',
    timeout: 120_000,
  },
});
