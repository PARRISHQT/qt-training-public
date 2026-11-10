import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3200;
// Fresh database every run, outside the repo.
const dbFile = join(tmpdir(), 'pizza-e2e', `${Date.now()}.sqlite`);

export default defineConfig({
  testDir: './tests',
  // Keep artifacts on a local disk: network drives can lock trace files.
  outputDir: join(tmpdir(), 'pizza-e2e-results'),
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: join(tmpdir(), 'pizza-e2e-report') }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge', // use the installed Edge; no browser download needed
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node ../server/index.js',
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      KITCHEN_PIN: '6046',
      DB_FILE: dbFile,
      TEST_NOW_MINUTES: String(12 * 60), // noon: shop is open
    },
  },
});
