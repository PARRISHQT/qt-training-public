'use strict';
// Admin validation + menu mutation helpers (pure functions; server handles I/O).

const isMoney = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 500;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'special';

function applyPrices(menu, body) {
  const errors = [];
  const next = JSON.parse(JSON.stringify(menu));
  if (body.taxRate !== undefined) {
    if (typeof body.taxRate !== 'number' || body.taxRate < 0 || body.taxRate > 0.2) errors.push('Tax rate must be between 0 and 0.20');
    else next.taxRate = body.taxRate;
  }
  if (body.delivery) {
    const d = body.delivery;
    if (d.fee !== undefined) { if (!isMoney(d.fee)) errors.push('Invalid delivery fee'); else next.delivery.fee = d.fee; }
    if (d.minimum !== undefined) { if (!isMoney(d.minimum)) errors.push('Invalid delivery minimum'); else next.delivery.minimum = d.minimum; }
    if (d.freeOver !== undefined) {
      if (d.freeOver !== null && !isMoney(d.freeOver)) errors.push('Invalid free-delivery threshold');
      else next.delivery.freeOver = d.freeOver;
    }
  }
  for (const group of ['sizes', 'crusts', 'toppings', 'sides']) {
    const upd = body.prices && body.prices[group];
    if (!upd) continue;
    for (const [id, price] of Object.entries(upd)) {
      const item = next[group].find((x) => x.id === id);
      if (!item) errors.push(`Unknown ${group} item: ${id}`);
      else if (!isMoney(price)) errors.push(`Invalid price for ${item.name}`);
      else item.price = price;
    }
  }
  return { errors, menu: next };
}

function validateSpecialty(menu, body, existingId) {
  const errors = [];
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  if (!name || name.length > 60) errors.push('Name is required (max 60 characters)');
  if (description.length > 200) errors.push('Description max 200 characters');
  const toppingIds = new Set(menu.toppings.map((t) => t.id));
  const toppings = Array.isArray(body.toppings) ? [...new Set(body.toppings)] : [];
  if (toppings.length === 0) errors.push('Pick at least one topping');
  if (toppings.some((t) => !toppingIds.has(t))) errors.push('Invalid topping');
  const prices = {};
  for (const s of menu.sizes) {
    const p = body.prices && body.prices[s.id];
    if (!isMoney(p) || p <= 0) errors.push(`Price required for ${s.name}`);
    else prices[s.id] = p;
  }
  if (menu.specialties.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== existingId)) errors.push('A specialty with that name already exists');
  return { errors, value: { name, description, toppings, prices } };
}

function uniqueId(menu, name) {
  const base = slug(name);
  let id = base, n = 2;
  while (menu.specialties.some((x) => x.id === id)) id = `${base}-${n++}`;
  return id;
}

module.exports = { applyPrices, validateSpecialty, uniqueId };
