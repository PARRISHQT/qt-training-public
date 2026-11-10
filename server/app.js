import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { MENU, STORE, TRANSITIONS } from './config.js';
import { priceItems } from './pricing.js';
import {
  earliestPickupMinutes,
  formatMinutes,
  pickupSlots,
  shopNowMinutes,
  validatePickup,
} from './pickup.js';
import { createOrder, getOrder, listOrders, setStatus } from './db.js';

const MAX_FAILURES = 10;
const LOCKOUT_MS = 60_000;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) throw new Error('Please enter a 10-digit phone number.');
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * @param {object} opts
 * @param {import('node:sqlite').DatabaseSync} opts.db
 * @param {string} opts.kitchenPin
 * @param {string} [opts.staticDir] built client directory
 * @param {() => number} [opts.now] minutes since midnight in shop time (injectable for tests)
 */
export function createApp({ db, kitchenPin, staticDir, now = shopNowMinutes }) {
  if (!kitchenPin) throw new Error('A kitchen PIN is required.');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));

  const failures = new Map(); // ip -> { count, until }

  function requireKitchen(req, res, next) {
    const entry = failures.get(req.ip);
    if (entry && entry.until > Date.now()) {
      return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
    }
    if (safeEqual(req.get('x-kitchen-pin') ?? '', kitchenPin)) {
      failures.delete(req.ip);
      return next();
    }
    const count = (entry?.count ?? 0) + 1;
    failures.set(req.ip, { count, until: count >= MAX_FAILURES ? Date.now() + LOCKOUT_MS : 0 });
    if (count >= MAX_FAILURES) failures.set(req.ip, { count: 0, until: Date.now() + LOCKOUT_MS });
    return res.status(401).json({ error: 'Incorrect PIN.' });
  }

  app.get('/api/config', (_req, res) => {
    const n = now();
    res.json({
      menu: MENU,
      hours: {
        open: formatMinutes(STORE.openMinutes),
        close: formatMinutes(STORE.closeMinutes),
      },
      leadMinutes: STORE.leadMinutes,
      maxQuantity: STORE.maxQuantity,
      acceptingOrders: earliestPickupMinutes(n) !== null,
      asapAvailable: earliestPickupMinutes(n) !== null,
      pickupSlots: pickupSlots(n).map((m) => ({
        value: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
        label: formatMinutes(m),
      })),
    });
  });

  app.post('/api/orders', (req, res) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      if (!name) throw new Error('Please enter your name.');
      if (name.length > 60) throw new Error('Name is too long.');
      const phone = normalizePhone(req.body?.phone);
      const pickupTime = validatePickup(req.body?.pickup, now());
      const { items, totalCents } = priceItems(req.body?.items);
      const id = createOrder(db, { name, phone, pickupTime, items, totalCents });
      res.status(201).json(getOrder(db, id));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/orders/:id', (req, res) => {
    const order = getOrder(db, Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    // Public confirmation lookup: leave out the phone number.
    const { phone: _phone, ...publicOrder } = order;
    res.json(publicOrder);
  });

  app.post('/api/kitchen/login', requireKitchen, (_req, res) => res.json({ ok: true }));

  app.get('/api/kitchen/orders', requireKitchen, (req, res) => {
    res.json(listOrders(db, { includePickedUp: req.query.history === '1' }));
  });

  app.patch('/api/kitchen/orders/:id/status', requireKitchen, (req, res) => {
    const id = Number(req.params.id);
    const order = getOrder(db, id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const next = req.body?.status;
    if (!TRANSITIONS[order.status].includes(next)) {
      return res.status(400).json({ error: `Cannot change ${order.status} to ${next}.` });
    }
    setStatus(db, id, next);
    res.json(getOrder(db, id));
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/.*/, (_req, res) => res.sendFile('index.html', { root: staticDir }));
  }
  return app;
}
