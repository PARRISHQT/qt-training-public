import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PIN = '6046';
const shot = (name) => join(tmpdir(), 'pizza-docs-shots', name);
test.describe.configure({ mode: 'serial' });
let orderNumber;

test.describe('API', () => {
  test('config exposes menu, hours, slots', async ({ request }) => {
    const r = await request.get('/api/config');
    expect(r.ok()).toBeTruthy();
    const c = await r.json();
    expect(c.menu.sizes.map((s) => s.id)).toEqual(['small', 'large']);
    expect(c.menu.toppings).toHaveLength(4);
    expect(c.hours).toEqual({ open: '10:00 AM', close: '11:00 PM' });
  });

  test('server rejects bad orders', async ({ request }) => {
    const good = { name: 'A', phone: '918-555-0100', pickup: 'ASAP', items: [{ size: 'small', toppings: [], quantity: 1 }] };
    const post = (b) => request.post('/api/orders', { data: b });
    const bad = async (label, body) => expect.soft((await post(body)).status(), label).toBe(400);
    await bad('blank name', { ...good, name: '  ' });
    await bad('short phone', { ...good, phone: '123' });
    await bad('no items', { ...good, items: [] });
    await bad('before open', { ...good, pickup: '09:00' });
    await bad('midnight', { ...good, pickup: '00:00' });
    await bad('unknown size', { ...good, items: [{ size: 'huge', toppings: [], quantity: 1 }] });
    await bad('unknown topping', { ...good, items: [{ size: 'small', toppings: ['anchovy'], quantity: 1 }] });
    await bad('quantity 999', { ...good, items: [{ size: 'small', toppings: [], quantity: 999 }] });
    await bad('quantity -1', { ...good, items: [{ size: 'small', toppings: [], quantity: -1 }] });
    await bad('quantity 1.5', { ...good, items: [{ size: 'small', toppings: [], quantity: 1.5 }] });
    await bad('name 61 chars', { ...good, name: 'x'.repeat(61) });
  });

  test('server computes price itself (ignores client price)', async ({ request }) => {
    const r = await request.post('/api/orders', {
      data: { name: 'Hacker', phone: '9185550101', pickup: 'ASAP', totalCents: 1, items: [{ size: 'large', toppings: ['pepperoni'], quantity: 2, priceCents: 1 }] },
    });
    expect(r.status()).toBe(201);
    const o = await r.json();
    expect(o.totalCents).toBe(3200);
    expect(o.phone).toBe('918-555-0101');
  });

  test('public order lookup hides phone; kitchen endpoints need PIN', async ({ request }) => {
    const o = await (await request.get('/api/orders/1')).json();
    expect(o.phone).toBeUndefined();
    expect((await request.get('/api/kitchen/orders')).status()).toBe(401);
    expect((await request.get('/api/kitchen/orders', { headers: { 'x-kitchen-pin': PIN } })).status()).toBe(200);
    expect((await request.get('/api/orders/99999')).status()).toBe(404);
  });

  test('invalid status transition rejected', async ({ request }) => {
    const r = await request.patch('/api/kitchen/orders/1/status', { headers: { 'x-kitchen-pin': PIN }, data: { status: 'Picked Up' } });
    expect(r.status()).toBe(400);
  });
});

test.describe('Customer UI', () => {
  test('page loads with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Neighborhood Pizza' })).toBeVisible();
    await page.screenshot({ path: shot('01-home.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('price updates with size and toppings', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('This pizza: $10.00')).toBeVisible();
    await page.getByLabel(/Large/).check();
    await page.getByLabel('Pepperoni').check();
    await page.getByLabel('Onions').check();
    await expect(page.getByText('This pizza: $18.00')).toBeVisible();
    await page.getByLabel('Onions').uncheck();
    await expect(page.getByText('This pizza: $16.00')).toBeVisible();
  });

  test('full order flow shows confirmation', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Large/).check();
    await page.getByLabel('Pepperoni').check();
    await page.getByRole('button', { name: 'Add to order' }).click();
    await page.locator('.cart li').getByRole('button', { name: 'More' }).click();
    await expect(page.getByText('Total: $32.00')).toBeVisible();
    await page.getByLabel('Name').fill('Donatello');
    await page.getByLabel('Phone number').fill('(918) 555-0123');
    await page.screenshot({ path: shot('02-cart.png'), fullPage: true });
    await page.getByRole('button', { name: 'Place order for pickup' }).click();
    await expect(page.getByRole('heading', { name: 'Order Up!' })).toBeVisible();
    await expect(page.getByText('Total: $32.00')).toBeVisible();
    await page.screenshot({ path: shot('03-confirmation.png'), fullPage: true });
    orderNumber = (await page.locator('.big-number').innerText()).match(/#(\d+)/)[1];
  });

  test('validation: empty cart, bad phone', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Name').fill('Raph');
    await page.getByLabel('Phone number').fill('918-555-0111');
    await page.getByRole('button', { name: 'Place order for pickup' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'order is empty' })).toBeVisible();

    await page.getByRole('button', { name: 'Add to order' }).click();
    await page.getByLabel('Phone number').fill('12345');
    await page.getByRole('button', { name: 'Place order for pickup' }).click();
    await expect(page.getByRole('alert')).toContainText(/10-digit/);
    await expect(page.getByRole('heading', { name: 'Order Up!' })).toBeHidden();
  });

  test('pickup slots respect 30-minute lead and closing time', async ({ page }) => {
    await page.goto('/');
    const options = await page.locator('select option').allInnerTexts();
    expect(options[0]).toContain('ASAP');
    expect(options.at(-1)).toBe('11:00 PM');
    const toMin = (s) => {
      const [, h, m, ap] = /(\d+):(\d+) (AM|PM)/.exec(s);
      return ((+h % 12) + (ap === 'PM' ? 12 : 0)) * 60 + +m;
    };
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const nowMin = +parts.find((p) => p.type === 'hour').value * 60 + +parts.find((p) => p.type === 'minute').value;
    expect(toMin(options[1])).toBeGreaterThanOrEqual(nowMin + 30);
  });

  test('quantity capped at max and removal works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add to order' }).click();
    const more = page.locator('.cart li').getByRole('button', { name: 'More' });
    for (let i = 0; i < 25; i++) if (await more.isEnabled()) await more.click();
    await expect(page.getByText('Total: $200.00')).toBeVisible(); // 20 x $10
    await page.locator('.cart li').getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.cart li')).toHaveCount(0);
  });

  test('script in name is rendered as text, not executed', async ({ page }) => {
    let dialog = false;
    page.on('dialog', (d) => { dialog = true; d.dismiss(); });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add to order' }).click();
    await page.getByLabel('Name').fill('<img src=x onerror=alert(1)>');
    await page.getByLabel('Phone number').fill('918-555-0199');
    await page.getByRole('button', { name: 'Place order for pickup' }).click();
    await expect(page.getByRole('heading', { name: 'Order Up!' })).toBeVisible();
    expect(dialog).toBe(false);
  });

  test('mobile viewport has no horizontal scroll', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Neighborhood Pizza' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: shot('04-mobile.png'), fullPage: true });
    await ctx.close();
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('Kitchen UI', () => {
  test('wrong PIN rejected; right PIN shows order; status flow works', async ({ page }) => {
    await page.goto('/kitchen');
    await page.getByLabel('Kitchen PIN').fill('0000');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('Incorrect PIN.')).toBeVisible();
    await page.getByLabel('Kitchen PIN').fill(PIN);
    await page.getByRole('button', { name: 'Unlock' }).click();
    const card = page.locator('article', { hasText: `#${orderNumber}` });
    await expect(card).toContainText('Donatello');
    await expect(card).toContainText('918-555-0123');
    await expect(card.locator('.badge')).toHaveText('New');
    await page.screenshot({ path: shot('05-kitchen.png'), fullPage: true });
    await card.getByRole('button', { name: 'Mark Ready' }).click();
    await expect(card.locator('.badge')).toHaveText('Ready');
    await page.reload();
    await expect(page.locator('article', { hasText: `#${orderNumber}` }).locator('.badge')).toHaveText('Ready');
    await page.locator('article', { hasText: `#${orderNumber}` }).getByRole('button', { name: 'Picked Up' }).click();
    await expect(page.locator('article', { hasText: `#${orderNumber}` })).toBeHidden();
  });

  test('PIN lockout after repeated failures', async ({ request }) => {
    let last;
    for (let i = 0; i < 11; i++) last = await request.get('/api/kitchen/orders', { headers: { 'x-kitchen-pin': 'bad' } });
    expect(last.status()).toBe(429);
  });
});
