import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Load KITCHEN_PIN etc. from a git-ignored .env file if present.
const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const kitchenPin = process.env.KITCHEN_PIN;
if (!kitchenPin) {
  console.error('KITCHEN_PIN is not set. Create a .env file with KITCHEN_PIN=<pin> (see README).');
  process.exit(1);
}

const dbFile = process.env.DB_FILE || join(root, 'db', 'pizza.sqlite');
const port = Number(process.env.PORT) || 3000;

const app = createApp({
  db: openDb(dbFile),
  kitchenPin,
  staticDir: join(root, 'client', 'dist'),
});
app.listen(port, () => console.log(`Neighborhood Pizza running at http://localhost:${port}`));
