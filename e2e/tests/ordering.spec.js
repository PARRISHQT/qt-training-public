import { test, expect } from '@playwright/test';

const PIN = '6046';

test.describe.configure({ mode: 'serial' });

let orderNumber;

test('customer builds an order, reviews it, and places it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Neighborhood Pizza' })).toBeVisible();

  // AC-1.2 / AC-1.3: price shown and updates with size and toppings
  await expect(page.getByText('This pizza: $10.00')).toBeVisible(); // small, plain cheese
  await page.getByLabel(/Large/).check();
  await expect(page.getByText('This pizza: $14.00')).toBeVisible();
  await page.getByLabel('Pepperoni').check();
  await page.getByLabel('Onions').check();
  await expect(page.getByText('This pizza: $18.00')).toBeVisible();
  await page.getByLabel('Onions').uncheck();
  await expect(page.getByText('This pizza: $16.00')).toBeVisible();
  await page.getByLabel('Onions').check();
  await page.getByRole('button', { name: 'Add to order' }).click();

  // AC-2.1: a second, different pizza (small, plain cheese)
  await page.getByLabel(/Small/).check();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await expect(page.getByText('Total: $28.00')).toBeVisible(); // 18 + 10

  // AC-2.3: change quantity, then remove a pizza, total follows
  const largeLine = page.locator('.cart li', { hasText: 'Large' });
  await largeLine.getByRole('button', { name: 'More' }).click();
  await expect(page.getByText('Total: $46.00')).toBeVisible(); // 2*18 + 10
  await page.locator('.cart li', { hasText: 'Small' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Total: $36.00')).toBeVisible();

  // AC-3.1: missing name is blocked
  await page.getByLabel('Phone number').fill('918-555-0123');
  await page.getByRole('button', { name: 'Place order for pickup' }).click();
  await expect(page.getByRole('heading', { name: 'Order Up!' })).toBeHidden();

  // AC-3.2: confirmation shows number, name, items, total
  await page.getByLabel('Name').fill('Leonardo');
  await page.getByRole('button', { name: 'Place order for pickup' }).click();
  await expect(page.getByRole('heading', { name: 'Order Up!' })).toBeVisible();
  await expect(page.getByText('Leonardo', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('2 × Large (14"), Pepperoni, Onions')).toBeVisible();
  await expect(page.getByText('Total: $36.00')).toBeVisible();
  const text = await page.locator('.big-number').innerText();
  orderNumber = text.match(/#(\d+)/)[1];
});

test('empty order cannot be placed', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Name').fill('Raphael');
  await page.getByLabel('Phone number').fill('918-555-0111');
  await page.getByRole('button', { name: 'Place order for pickup' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'order is empty' })).toBeVisible();
});

test('pickup time only offers slots at least 30 minutes out, within hours', async ({ page }) => {
  await page.goto('/');
  const options = await page.locator('select option').allInnerTexts();
  expect(options[0]).toContain('ASAP');
  expect(options[1]).toBe('12:30 PM'); // noon + 30 minutes
  expect(options.at(-1)).toBe('11:00 PM');
  expect(options).not.toContain('12:15 PM');
});

test('kitchen: wrong PIN rejected, right PIN shows order, status flow works', async ({ page }) => {
  await page.goto('/kitchen');
  await page.getByLabel('Kitchen PIN').fill('0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Incorrect PIN.')).toBeVisible();

  await page.getByLabel('Kitchen PIN').fill(PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();

  // AC-4.1 / AC-4.2: order visible as New with details
  const card = page.locator('article', { hasText: `#${orderNumber}` });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Leonardo');
  await expect(card).toContainText('918-555-0123');
  await expect(card).toContainText('2 × Large (14"), Pepperoni, Onions');
  await expect(card).toContainText('Total: $36.00');
  await expect(card.locator('.badge')).toHaveText('New');

  await card.getByRole('button', { name: 'Mark Ready' }).click();
  await expect(card.locator('.badge')).toHaveText('Ready');

  // AC-4.3: still there with its status after a reload (stored in the database)
  await page.reload();
  const reloaded = page.locator('article', { hasText: `#${orderNumber}` });
  await expect(reloaded.locator('.badge')).toHaveText('Ready');

  await reloaded.getByRole('button', { name: 'Picked Up' }).click();
  await expect(page.locator('article', { hasText: `#${orderNumber}` })).toBeHidden();
});
