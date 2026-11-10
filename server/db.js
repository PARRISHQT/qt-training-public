import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Opens (and creates, if needed) the SQLite database. Use ':memory:' for tests. */
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      pickup_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New','Ready','Picked Up')),
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      toppings TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  `);
  return db;
}

export function createOrder(db, { name, phone, pickupTime, items, totalCents }) {
  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO orders (name, phone, pickup_time, total_cents) VALUES (?, ?, ?, ?)')
      .run(name, phone, pickupTime, totalCents);
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, size, toppings, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)',
    );
    for (const i of items) {
      insertItem.run(lastInsertRowid, i.size, JSON.stringify(i.toppings), i.quantity, i.unitPriceCents);
    }
    db.exec('COMMIT');
    return Number(lastInsertRowid);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function hydrate(db, rows) {
  const itemStmt = db.prepare(
    'SELECT size, toppings, quantity, unit_price_cents FROM order_items WHERE order_id = ? ORDER BY id',
  );
  return rows.map((o) => ({
    orderNumber: o.id,
    name: o.name,
    phone: o.phone,
    pickupTime: o.pickup_time,
    status: o.status,
    totalCents: o.total_cents,
    createdAt: o.created_at,
    items: itemStmt.all(o.id).map((i) => ({
      size: i.size,
      toppings: JSON.parse(i.toppings),
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
    })),
  }));
}

export function getOrder(db, id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  return row ? hydrate(db, [row])[0] : null;
}

export function listOrders(db, { includePickedUp }) {
  const rows = includePickedUp
    ? db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all()
    : db.prepare("SELECT * FROM orders WHERE status != 'Picked Up' ORDER BY id ASC").all();
  return hydrate(db, rows);
}

export function setStatus(db, id, status) {
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
}
