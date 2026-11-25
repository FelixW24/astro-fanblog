import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

process.env.READER_UI_FIXTURE = '1';

export default defineConfig({
  testDir: '.',
  testMatch: [
    'reader-profile-ui.spec.ts',
    'required-fields.spec.ts',
    'avatar-crop.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results/reader-profile',
  use: {
    baseURL: 'http://127.0.0.1:4341',
    browserName: 'chromium',
    // Wie im Hauptlauf: Der Willkommenshinweis erscheint bei jedem Besuch
    // und darf Klicks im Profil-Modal nicht abfangen. Der Fixture-Server
    // setzt PLAYWRIGHT_TEST=1 und rendert das Modal serverseitig nicht.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          env: {
            ...process.env,
            ...(process.env.PLAYWRIGHT_CHROMIUM_LIBRARY_PATH
              ? {
                  LD_LIBRARY_PATH: process.env.PLAYWRIGHT_CHROMIUM_LIBRARY_PATH,
                }
              : {}),
          },
        }
      : undefined,
  },
  webServer: {
    command: 'node scripts/serve-reader-profile-fixture.mjs',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://127.0.0.1:4341/reader-ui-fixture?view=onboarding',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
