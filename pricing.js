'use strict';
// Server-side pricing. The client never supplies prices; only item ids.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function priceOrder(menu, input) {
  const errors = [];
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  const sizes = byId(menu.sizes);
  const crusts = byId(menu.crusts);
  const toppings = byId(menu.toppings);
  const sides = byId(menu.sides);
  const specialties = byId(menu.specialties || []);

  const items = [];
  const pizzas = Array.isArray(input.pizzas) ? input.pizzas : [];
  const sideReqs = Array.isArray(input.sides) ? input.sides : [];

  pizzas.forEach((p, i) => {
    const size = sizes.get(p.size);
    const crust = crusts.get(p.crust);
    const qty = Number(p.qty);
    if (p.specialty) {
      const sp = specialties.get(p.specialty);
      if (!sp) errors.push(`Pizza ${i + 1}: invalid specialty pizza`);
      if (!size) errors.push(`Pizza ${i + 1}: invalid size`);
      if (!crust) errors.push(`Pizza ${i + 1}: invalid crust`);
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) errors.push(`Pizza ${i + 1}: quantity must be 1-20`);
      if (sp && size && crust && Number.isInteger(qty) && qty >= 1 && qty <= 20) {
        const unit = round2(sp.prices[size.id] + crust.price);
        items.push({
          kind: 'pizza', specialty: sp.id, size: size.id, crust: crust.id, toppings: [], qty,
          description: `${size.name} ${sp.name} (${crust.name})`, unitPrice: unit, lineTotal: round2(unit * qty),
        });
      }
      return;
    }
    if (!size) errors.push(`Pizza ${i + 1}: invalid size`);
    if (!crust) errors.push(`Pizza ${i + 1}: invalid crust`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) errors.push(`Pizza ${i + 1}: quantity must be 1-20`);
    const tops = Array.isArray(p.toppings) ? [...new Set(p.toppings)] : [];
    const topObjs = tops.map((t) => toppings.get(t));
    if (topObjs.some((t) => !t)) errors.push(`Pizza ${i + 1}: invalid topping`);
    if (tops.length > 10) errors.push(`Pizza ${i + 1}: max 10 toppings`);
    if (size && crust && !topObjs.some((t) => !t) && Number.isInteger(qty)) {
      const unit = round2(size.price + crust.price + topObjs.reduce((s, t) => s + t.price, 0));
      items.push({
        kind: 'pizza',
        description: `${size.name} ${crust.name}` + (topObjs.length ? ` with ${topObjs.map((t) => t.name).join(', ')}` : ' (cheese)'),
        ...p, toppings: tops, qty, unitPrice: unit, lineTotal: round2(unit * qty),
      });
    }
  });

  sideReqs.forEach((s, i) => {
    const side = sides.get(s.id);
    const qty = Number(s.qty);
    if (!side) errors.push(`Side ${i + 1}: invalid item`);
    else if (!Number.isInteger(qty) || qty < 1 || qty > 20) errors.push(`Side ${i + 1}: quantity must be 1-20`);
    else items.push({ kind: 'side', id: side.id, description: side.name, qty, unitPrice: side.price, lineTotal: round2(side.price * qty) });
  });

  if (items.length === 0) errors.push('Order is empty');

  const method = input.method === 'pickup' ? 'pickup' : input.method === 'delivery' ? 'delivery' : null;
  if (!method) errors.push('Method must be pickup or delivery');

  const subtotal = round2(items.reduce((s, x) => s + x.lineTotal, 0));
  if (method === 'delivery' && subtotal < menu.delivery.minimum) {
    errors.push(`Delivery minimum is $${menu.delivery.minimum.toFixed(2)}`);
  }
  const tipRate = Number(input.tipRate || 0);
  if (!menu.tipOptions.includes(tipRate)) errors.push('Invalid tip option');

  const deliveryFee = method === 'delivery' && !(menu.delivery.freeOver != null && subtotal >= menu.delivery.freeOver) ? menu.delivery.fee : 0;
  const tax = round2(subtotal * menu.taxRate); // delivery fee treated as non-taxable (assumption)
  const tip = round2(subtotal * tipRate);
  const total = round2(subtotal + deliveryFee + tax + tip);
  return { errors, items, method, subtotal, deliveryFee, tax, tip, total };
}

module.exports = { priceOrder, round2 };
