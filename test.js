'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
// Run against a temp copy so tests never touch real menu/orders data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-test-'));
fs.copyFileSync(path.join(__dirname, 'data', 'menu.json'), path.join(tmp, 'menu.json'));
process.env.DATA_DIR = tmp;
const { priceOrder } = require('./pricing');
const menu = JSON.parse(fs.readFileSync(__dirname + '/data/menu.json', 'utf8'));

// Pricing unit tests
let r = priceOrder(menu, { method: 'pickup', tipRate: 0, pizzas: [{ size: 'large', crust: 'hand-tossed', toppings: ['pepperoni'], qty: 1 }] });
assert.deepStrictEqual(r.errors, []);
assert.strictEqual(r.subtotal, 18.98);
assert.strictEqual(r.deliveryFee, 0);
assert.strictEqual(r.total, Math.round((18.98 + 18.98 * menu.taxRate) * 100) / 100);

r = priceOrder(menu, { method: 'delivery', tipRate: 0, pizzas: [{ size: 'small', crust: 'thin', toppings: [], qty: 1 }] });
assert.ok(r.errors.some((e) => /minimum/.test(e)), 'delivery minimum enforced');

r = priceOrder(menu, { method: 'pickup', pizzas: [{ size: 'huge', crust: 'thin', toppings: ['x'], qty: -1 }] });
assert.ok(r.errors.length >= 3, 'invalid input rejected');
assert.ok(priceOrder(menu, { method: 'pickup', pizzas: [] }).errors.includes('Order is empty'));

// API integration test
const { server } = require('./server');
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  try {
    const m = await (await fetch(base + '/api/menu')).json();
    assert.ok(m.sizes.length && !m._notes);
    const body = { method: 'delivery', tipRate: 0.15, name: 'Test', phone: '9185551234', address: '1 Main St', pizzas: [{ size: 'large', crust: 'pan', toppings: ['ham'], qty: 1, price: 0.01 }] };
    const bad = await fetch(base + '/api/orders', { method: 'POST', body: JSON.stringify({ ...body, phone: '1' }) });
    assert.strictEqual(bad.status, 400);
    const ok = await fetch(base + '/api/orders', { method: 'POST', body: JSON.stringify(body) });
    assert.strictEqual(ok.status, 201);
    const o = await ok.json();
    assert.strictEqual(o.subtotal, 20.48); // client-supplied price ignored
    const got = await (await fetch(`${base}/api/orders/${o.id}`)).json();
    assert.strictEqual(got.status, 'Received');
    assert.strictEqual((await fetch(base + '/%2e%2e/server.js')).status, 404);
    // Specialty pizza pricing
    const spOrder = { method: 'pickup', tipRate: 0, pizzas: [{ specialty: 'meat-lovers', size: 'large', crust: 'stuffed', qty: 2 }] };
    const q = await (await fetch(base + '/api/quote', { method: 'POST', body: JSON.stringify(spOrder) })).json();
    assert.strictEqual(q.subtotal, 46.98); // (20.99 + 2.50) * 2
    // Admin: orders, prices, specialties
    const orders = await (await fetch(base + '/api/admin/orders')).json();
    assert.ok(orders.length >= 1 && orders[0].customer.name === 'Test');
    const put = (url, method, b) => fetch(base + url, { method, body: JSON.stringify(b) });
    let r2 = await put('/api/admin/prices', 'PUT', { prices: { sizes: { large: 17.49 } }, delivery: { fee: 5.5 }, taxRate: 0.09 });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual((await (await fetch(base + '/api/menu')).json()).sizes[2].price, 17.49);
    assert.strictEqual((await put('/api/admin/prices', 'PUT', { prices: { sizes: { large: -1 } } })).status, 400);
    assert.strictEqual((await put('/api/admin/prices', 'PUT', { delivery: { fee: null } })).status, 400);
    const sp = { name: 'BBQ Chicken', description: 'Test', toppings: ['chicken', 'onions'], prices: { small: 12, medium: 15, large: 18 } };
    r2 = await put('/api/admin/specialties', 'POST', sp);
    assert.strictEqual(r2.status, 201);
    const created = await r2.json();
    assert.strictEqual(created.id, 'bbq-chicken');
    assert.strictEqual((await put('/api/admin/specialties', 'POST', sp)).status, 400); // duplicate name
    assert.strictEqual((await put('/api/admin/specialties', 'POST', { ...sp, name: 'X', toppings: ['nope'] })).status, 400);
    assert.strictEqual((await put('/api/admin/specialties/bbq-chicken', 'PUT', { ...sp, prices: { small: 13, medium: 16, large: 19 } })).status, 200);
    assert.strictEqual((await put('/api/admin/specialties/bbq-chicken', 'DELETE')).status, 200);
    assert.strictEqual((await put('/api/admin/specialties/bbq-chicken', 'DELETE')).status, 404);
    console.log('All tests passed');
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
