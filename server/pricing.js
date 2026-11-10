import { MENU, STORE } from './config.js';

const sizeById = new Map(MENU.sizes.map((s) => [s.id, s]));
const toppingById = new Map(MENU.toppings.map((t) => [t.id, t]));

export function pizzaUnitPriceCents(size, toppings) {
  const s = sizeById.get(size);
  if (!s) throw new Error('Unknown size');
  return s.priceCents + toppings.length * MENU.toppings[0].priceCents;
}

/**
 * Validates raw items from a client and recalculates all prices.
 * Returns { items, totalCents } or throws an Error with a customer-safe message.
 */
export function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Your order is empty. Add at least one pizza.');
  }
  const items = rawItems.map((raw) => {
    if (!sizeById.has(raw?.size)) throw new Error('Please choose a valid pizza size.');
    const quantity = raw.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > STORE.maxQuantity) {
      throw new Error(`Quantity must be between 1 and ${STORE.maxQuantity}.`);
    }
    if (!Array.isArray(raw.toppings)) throw new Error('Toppings must be a list.');
    const toppings = [...new Set(raw.toppings)];
    for (const t of toppings) {
      if (!toppingById.has(t)) throw new Error('Unknown topping selected.');
    }
    // Keep menu order so identical pizzas look identical.
    toppings.sort(
      (a, b) =>
        MENU.toppings.findIndex((x) => x.id === a) - MENU.toppings.findIndex((x) => x.id === b),
    );
    const unitPriceCents = pizzaUnitPriceCents(raw.size, toppings);
    return { size: raw.size, toppings, quantity, unitPriceCents };
  });
  const totalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  return { items, totalCents };
}
