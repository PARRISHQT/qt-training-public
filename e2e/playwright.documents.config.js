import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Targets the deployed copy of the app in Documents, on its own port and a throwaway database.
const APP_DIR = 'C:/Users/jfoster/Documents/Claude Code Class';
const PORT = 3300;

export default defineConfig({
  testDir: './tests-documents',
  outputDir: join(tmpdir(), 'pizza-docs-results'),
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: join(tmpdir(), 'pizza-docs-report.json') }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node "${APP_DIR}/server/index.js"`,
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      KITCHEN_PIN: '6046',
      DB_FILE: join(tmpdir(), 'pizza-docs', `${Date.now()}.sqlite`),
    },
  },
});
