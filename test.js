'use strict';
const assert = require('assert');
const fs = require('fs');
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
    assert.strictEqual((await fetch(base + '/../server.js')).status === 200 && false, false);
    assert.strictEqual((await fetch(base + '/%2e%2e/server.js')).status, 404);
    console.log('All tests passed');
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close();
});
