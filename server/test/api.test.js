import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { pizzaUnitPriceCents, priceItems } from '../pricing.js';
import { validatePickup, pickupSlots } from '../pickup.js';

const PIN = '6046';
const NOON = 12 * 60;
let server;
let base;
let db;

before(async () => {
  db = openDb(':memory:');
  const app = createApp({ db, kitchenPin: PIN, now: () => NOON });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (path, body, headers = {}) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const goodOrder = {
  name: 'Donatello',
  phone: '(918) 555-0123',
  pickup: 'ASAP',
  items: [
    { size: 'large', toppings: ['pepperoni', 'onions'], quantity: 2 },
    { size: 'small', toppings: [], quantity: 1 },
  ],
};

test('pricing: sizes plus $2 per topping, any size', () => {
  assert.equal(pizzaUnitPriceCents('small', []), 1000);
  assert.equal(pizzaUnitPriceCents('large', []), 1400);
  assert.equal(pizzaUnitPriceCents('small', ['pepperoni']), 1200);
  assert.equal(pizzaUnitPriceCents('large', ['pepperoni', 'mushrooms', 'onions', 'green-peppers']), 2200);
  assert.equal(priceItems(goodOrder.items).totalCents, 2 * 1800 + 1000);
});

test('pricing: duplicate toppings are not double charged, bad input rejected', () => {
  assert.equal(priceItems([{ size: 'small', toppings: ['onions', 'onions'], quantity: 1 }]).totalCents, 1200);
  assert.throws(() => priceItems([]));
  assert.throws(() => priceItems([{ size: 'xl', toppings: [], quantity: 1 }]));
  assert.throws(() => priceItems([{ size: 'small', toppings: ['anchovies'], quantity: 1 }]));
  assert.throws(() => priceItems([{ size: 'small', toppings: [], quantity: 0 }]));
});

test('pickup: lead time and store hours', () => {
  assert.equal(validatePickup('12:30', NOON), '12:30');
  assert.throws(() => validatePickup('12:29', NOON), /30 minutes/);
  assert.throws(() => validatePickup('09:45', 9 * 60), /between/);
  assert.equal(validatePickup('23:00', NOON), '23:00');
  assert.throws(() => validatePickup('23:15', NOON), /between/);
  assert.throws(() => validatePickup('later', NOON), /choose/);
  assert.equal(validatePickup('ASAP', NOON), 'ASAP');
  assert.throws(() => validatePickup('ASAP', 22 * 60 + 45), /not taking/);
  assert.equal(pickupSlots(NOON)[0], 12 * 60 + 30);
  assert.equal(pickupSlots(23 * 60).length, 0);
});

test('AC-3.1: empty order and missing name are rejected', async () => {
  assert.equal((await post('/api/orders', { ...goodOrder, items: [] })).status, 400);
  assert.equal((await post('/api/orders', { ...goodOrder, name: '   ' })).status, 400);
  assert.equal((await post('/api/orders', { ...goodOrder, phone: '123' })).status, 400);
  assert.equal((await post('/api/orders', { ...goodOrder, pickup: '12:10' })).status, 400);
});

test('server recalculates price and ignores client-supplied totals', async () => {
  const res = await post('/api/orders', {
    ...goodOrder,
    totalCents: 1,
    items: [{ ...goodOrder.items[0], unitPriceCents: 1 }],
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).totalCents, 3600);
});

test('AC-3.2/4.x: confirmation, kitchen view, status flow', async () => {
  const created = await (await post('/api/orders', goodOrder)).json();
  assert.ok(created.orderNumber > 0);
  assert.equal(created.status, 'New');
  assert.equal(created.totalCents, 4600);

  const pub = await (await fetch(`${base}/api/orders/${created.orderNumber}`)).json();
  assert.equal(pub.name, 'Donatello');
  assert.equal(pub.phone, undefined);

  const auth = { 'x-kitchen-pin': PIN };
  const list = await (await fetch(`${base}/api/kitchen/orders`, { headers: auth })).json();
  const found = list.find((o) => o.orderNumber === created.orderNumber);
  assert.equal(found.phone, '918-555-0123');
  assert.equal(found.items.length, 2);

  const patch = (status) =>
    fetch(`${base}/api/kitchen/orders/${created.orderNumber}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ status }),
    });
  assert.equal((await patch('Picked Up')).status, 400); // must be Ready first
  assert.equal((await patch('Ready')).status, 200);
  assert.equal((await patch('Picked Up')).status, 200);
  const active = await (await fetch(`${base}/api/kitchen/orders`, { headers: auth })).json();
  assert.ok(!active.some((o) => o.orderNumber === created.orderNumber));
  const all = await (await fetch(`${base}/api/kitchen/orders?history=1`, { headers: auth })).json();
  assert.equal(all.find((o) => o.orderNumber === created.orderNumber).status, 'Picked Up');
});

test('kitchen endpoints reject missing or wrong PIN', async () => {
  assert.equal((await fetch(`${base}/api/kitchen/orders`)).status, 401);
  assert.equal(
    (await fetch(`${base}/api/kitchen/orders`, { headers: { 'x-kitchen-pin': '0000' } })).status,
    401,
  );
  assert.equal((await post('/api/kitchen/login', {}, { 'x-kitchen-pin': PIN })).status, 200);
});

test('AC-4.3: orders persist across closing and reopening the database', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createOrder, getOrder } = await import('../db.js');
  const dir = mkdtempSync(join(tmpdir(), 'pizza-test-'));
  const file = join(dir, 'p.sqlite');
  try {
    const first = openDb(file);
    const { items, totalCents } = priceItems(goodOrder.items);
    const id = createOrder(first, { name: 'Raph', phone: '918-555-0100', pickupTime: 'ASAP', items, totalCents });
    first.close();
    const second = openDb(file);
    assert.equal(getOrder(second, id).name, 'Raph');
    assert.equal(getOrder(second, id).status, 'New');
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
