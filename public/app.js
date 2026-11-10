'use strict';
const $ = (id) => document.getElementById(id);
const money = (n) => '$' + n.toFixed(2);
let menu;
const cart = { pizzas: [], sides: {} };
let pollTimer;

function el(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  Object.assign(e, attrs);
  return e;
}

async function init() {
  menu = await (await fetch('/api/menu')).json();
  menu.sizes.forEach((s) => $('size').append(new Option(`${s.name} – ${money(s.price)}`, s.id)));
  $('size').value = 'large';
  menu.crusts.forEach((c) => $('crust').append(new Option(c.name + (c.price ? ` (+${money(c.price)})` : ''), c.id)));
  menu.toppings.forEach((t) => {
    const l = el('label');
    const cb = el('input', null, { type: 'checkbox', value: t.id });
    l.append(cb, ` ${t.name} (+${money(t.price)})`);
    $('toppings').append(l);
  });
  renderSpecials();
  menu.sides.forEach((s) => {
    const row = el('div');
    row.append(el('span', `${s.name} – ${money(s.price)}`));
    const b = el('button', 'Add', { type: 'button', className: 'small' });
    b.onclick = () => { cart.sides[s.id] = (cart.sides[s.id] || 0) + 1; refresh(); };
    row.append(b);
    $('sides').append(row);
  });
  menu.tipOptions.forEach((t) => $('tip').append(new Option(t === 0 ? 'No tip' : `${t * 100}%`, t)));
  $('tip').value = '0.15';
  refresh();
}

const readQty = () => Math.max(1, Math.min(20, parseInt($('qty').value, 10) || 1));

// Specialty prices depend on the selected size, so re-render when it changes.
function renderSpecials() {
  const box = $('specials');
  box.replaceChildren();
  if (!menu.specialties.length) box.append(el('p', 'No specialty pizzas right now.'));
  menu.specialties.forEach((sp) => {
    const row = el('div');
    const info = el('span', `${sp.name} – ${money(sp.prices[$('size').value])}`);
    if (sp.description) info.append(el('br'), el('small', sp.description));
    const b = el('button', 'Add', { type: 'button', className: 'small' });
    b.onclick = () => {
      cart.pizzas.push({ specialty: sp.id, size: $('size').value, crust: $('crust').value, toppings: [], qty: readQty() });
      $('qty').value = 1;
      refresh();
    };
    row.append(info, b);
    box.append(row);
  });
}
$('size').onchange = renderSpecials;

$('addPizza').onclick = () => {
  const toppings = [...document.querySelectorAll('#toppings input:checked')].map((c) => c.value);
  cart.pizzas.push({ size: $('size').value, crust: $('crust').value, toppings, qty: Math.max(1, Math.min(20, parseInt($('qty').value, 10) || 1)) });
  document.querySelectorAll('#toppings input').forEach((c) => (c.checked = false));
  $('qty').value = 1;
  refresh();
};

const method = () => document.querySelector('input[name=method]:checked').value;
const payload = () => ({
  method: method(), tipRate: Number($('tip').value),
  pizzas: cart.pizzas, sides: Object.entries(cart.sides).map(([id, qty]) => ({ id, qty })),
});

async function refresh() {
  $('addrWrap').hidden = method() !== 'delivery';
  const list = $('cartItems');
  list.replaceChildren();
  const hasItems = cart.pizzas.length || Object.keys(cart.sides).length;
  $('empty').hidden = !!hasItems;
  $('place').disabled = !hasItems;
  $('totals').replaceChildren();
  $('errors').textContent = '';
  if (!hasItems) return;
  const res = await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
  const q = await res.json();
  // Render items from the server's quote so prices always come from the backend.
  list.replaceChildren();
  (q.items || []).forEach((it) => {
    const li = el('li');
    li.append(el('span', `${it.qty} × ${it.description}`), el('span', money(it.lineTotal)));
    const rm = el('button', '✕', { type: 'button', className: 'small', title: 'Remove', ariaLabel: 'Remove item' });
    rm.onclick = () => {
      if (it.kind === 'pizza') cart.pizzas.splice(cart.pizzas.findIndex((p) => p.specialty === it.specialty && p.size === it.size && p.crust === it.crust && p.qty === it.qty && p.toppings.join() === it.toppings.join()), 1);
      else delete cart.sides[it.id];
      refresh();
    };
    li.append(rm);
    list.append(li);
  });
  if (!res.ok) { $('errors').textContent = q.errors.join('\n'); $('place').disabled = true; if (!q.items.length) return; }
  const rows = [['Subtotal', q.subtotal], ['Delivery fee', q.deliveryFee], ['Tax', q.tax], ['Tip', q.tip], ['Total', q.total]];
  rows.forEach(([k, v]) => {
    if ((k === 'Delivery fee' && method() !== 'delivery') || (k === 'Tip' && !v)) return;
    const cls = k === 'Total' ? 'total' : '';
    $('totals').append(el('dt', k, { className: cls }), el('dd', money(v), { className: cls }));
  });
}

document.querySelectorAll('input[name=method]').forEach((r) => (r.onchange = refresh));
$('tip').onchange = refresh;

$('checkout').onsubmit = async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  $('place').disabled = true;
  const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload(), ...f }) });
  const o = await res.json();
  if (!res.ok) { $('errors').textContent = o.errors.join('\n'); $('place').disabled = false; return; }
  showConfirmation(o);
};

function showConfirmation(o) {
  $('builder').hidden = $('cart').hidden = true;
  $('confirmation').hidden = false;
  $('orderId').textContent = '#' + o.id;
  $('payment').textContent = o.payment;
  $('confTotal').textContent = money(o.total);
  $('confItems').replaceChildren(...o.items.map((it) => { const li = el('li'); li.append(el('span', `${it.qty} × ${it.description}`), el('span', money(it.lineTotal))); return li; }));
  const poll = async () => {
    const r = await fetch('/api/orders/' + o.id);
    if (r.ok) $('status').textContent = (await r.json()).status;
  };
  poll();
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, 15000);
}

$('newOrder').onclick = () => {
  clearInterval(pollTimer);
  cart.pizzas = []; cart.sides = {};
  $('checkout').reset();
  $('confirmation').hidden = true;
  $('builder').hidden = $('cart').hidden = false;
  refresh();
};

init();
