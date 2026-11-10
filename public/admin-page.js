'use strict';
const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Number(n).toFixed(2);
let menu;
let editingId = null;

function el(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  Object.assign(e, attrs);
  return e;
}
function say(text, ok = true) {
  $('msg').textContent = text;
  $('msg').className = 'msg ' + (ok ? 'ok' : 'err');
}
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error((data.errors || ['Request failed']).join('\n'));
  return data;
}

// ---- tabs
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('active', x === b));
  ['orders', 'prices', 'specials'].forEach((t) => ($('tab-' + t).hidden = t !== b.dataset.tab));
  say('');
}));

// ---- orders
async function loadOrders() {
  try {
    const orders = await api('GET', '/api/admin/orders');
    const body = $('ordersTable').tBodies[0];
    body.replaceChildren();
    $('noOrders').hidden = orders.length > 0;
    $('ordersTable').hidden = orders.length === 0;
    orders.forEach((o) => {
      const tr = el('tr');
      const cust = el('td', `${o.customer.name} · ${o.customer.phone}`);
      if (o.customer.address) cust.append(el('br'), document.createTextNode(o.customer.address));
      if (o.customer.notes) cust.append(el('br'), el('em', 'Note: ' + o.customer.notes));
      const items = el('td');
      o.items.forEach((it) => items.append(el('div', `${it.qty} × ${it.description}`)));
      tr.append(el('td', '#' + o.id), el('td', new Date(o.createdAt).toLocaleString()), cust,
        el('td', o.method), items, el('td', money(o.total)), el('td', o.status));
      body.append(tr);
    });
  } catch (e) { say(e.message, false); }
}
$('refreshOrders').onclick = loadOrders;

// ---- prices
function renderPrices() {
  const f = $('pricesForm');
  f.replaceChildren();
  const group = (title, children) => {
    const fs = el('fieldset');
    fs.append(el('legend', title));
    const g = el('div', null, { className: 'pgroup' });
    g.append(...children);
    fs.append(g);
    f.append(fs);
  };
  const field = (label, name, value, step = '0.01') => {
    const l = el('label', label);
    l.append(el('input', null, { type: 'number', min: 0, step, name, value }));
    return l;
  };
  for (const [key, title] of [['sizes', 'Pizza sizes (base price)'], ['crusts', 'Crust upcharges'], ['toppings', 'Toppings (per topping)'], ['sides', 'Sides & drinks']]) {
    group(title, menu[key].map((x) => field(x.name, `${key}.${x.id}`, x.price.toFixed(2))));
  }
  group('Delivery & tax', [
    field('Delivery fee ($)', 'delivery.fee', menu.delivery.fee.toFixed(2)),
    field('Delivery minimum ($)', 'delivery.minimum', menu.delivery.minimum.toFixed(2)),
    field('Free delivery over ($, blank = never)', 'delivery.freeOver', menu.delivery.freeOver == null ? '' : menu.delivery.freeOver.toFixed(2)),
    field('Sales tax rate (%)', 'taxRate', (menu.taxRate * 100).toFixed(3), '0.001'),
  ]);
  f.append(el('button', 'Save prices', { type: 'submit' }));
}
$('pricesForm').onsubmit = async (e) => {
  e.preventDefault();
  const body = { prices: { sizes: {}, crusts: {}, toppings: {}, sides: {} }, delivery: {} };
  for (const inp of e.target.querySelectorAll('input')) {
    const [a, b] = inp.name.split('.');
    if (a === 'taxRate') body.taxRate = Number(inp.value) / 100;
    else if (a === 'delivery') body.delivery[b] = inp.value === '' ? null : Number(inp.value);
    else body.prices[a][b] = Number(inp.value);
  }
  try {
    // A blank fee/minimum is sent as null and rejected by the server.
    menu = await api('PUT', '/api/admin/prices', body);
    renderPrices(); renderSpecialties();
    say('Prices saved. They apply to new orders immediately.');
  } catch (err) { say(err.message, false); }
};

// ---- specialties
function renderSpecialties() {
  const list = $('spList');
  list.replaceChildren();
  if (!menu.specialties.length) list.append(el('p', 'No specialty pizzas yet.'));
  menu.specialties.forEach((sp) => {
    const names = sp.toppings.map((id) => (menu.toppings.find((t) => t.id === id) || { name: id }).name).join(', ');
    const info = el('div');
    info.append(el('strong', sp.name), el('small', sp.description || ''), el('small', 'Toppings: ' + names),
      el('small', menu.sizes.map((s) => `${s.name}: ${money(sp.prices[s.id])}`).join(' · ')));
    const edit = el('button', 'Edit', { type: 'button', className: 'small' });
    edit.onclick = () => startEdit(sp);
    const del = el('button', 'Delete', { type: 'button', className: 'small secondary' });
    del.onclick = async () => {
      if (!confirm(`Delete "${sp.name}"?`)) return;
      try { await api('DELETE', '/api/admin/specialties/' + sp.id); await reload(); say('Deleted.'); } catch (e) { say(e.message, false); }
    };
    const actions = el('div', null, { className: 'actions' });
    actions.append(edit, del);
    const row = el('div', null, { className: 'sp' });
    row.append(info, actions);
    list.append(row);
  });
}
function renderSpecialtyForm() {
  $('spToppings').replaceChildren(...menu.toppings.map((t) => {
    const l = el('label', ` ${t.name}`, { style: 'font-weight:400' });
    l.prepend(el('input', null, { type: 'checkbox', value: t.id }));
    return l;
  }));
  $('spPrices').replaceChildren(...menu.sizes.map((s) => {
    const l = el('label', s.name);
    l.append(el('input', null, { type: 'number', min: 0.01, step: '0.01', name: 'price-' + s.id, required: true }));
    return l;
  }));
}
function startEdit(sp) {
  editingId = sp.id;
  const f = $('spForm');
  f.name.value = sp.name; f.description.value = sp.description || '';
  f.querySelectorAll('#spToppings input').forEach((c) => (c.checked = sp.toppings.includes(c.value)));
  menu.sizes.forEach((s) => (f['price-' + s.id].value = sp.prices[s.id].toFixed(2)));
  $('spFormTitle').textContent = 'Edit "' + sp.name + '"';
  $('spSave').textContent = 'Save changes';
  $('spCancel').hidden = false;
  f.scrollIntoView({ behavior: 'smooth' });
}
function resetSpForm() {
  editingId = null;
  $('spForm').reset();
  $('spFormTitle').textContent = 'Add a specialty pizza';
  $('spSave').textContent = 'Add specialty';
  $('spCancel').hidden = true;
}
$('spCancel').onclick = resetSpForm;
$('spForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    name: f.name.value, description: f.description.value,
    toppings: [...f.querySelectorAll('#spToppings input:checked')].map((c) => c.value),
    prices: Object.fromEntries(menu.sizes.map((s) => [s.id, Number(f['price-' + s.id].value)])),
  };
  try {
    await (editingId ? api('PUT', '/api/admin/specialties/' + editingId, body) : api('POST', '/api/admin/specialties', body));
    say(editingId ? 'Specialty updated.' : 'Specialty added.');
    resetSpForm();
    await reload();
  } catch (err) { say(err.message, false); }
};

async function reload() {
  menu = await api('GET', '/api/admin/menu');
  renderPrices(); renderSpecialties(); renderSpecialtyForm();
}

reload().then(loadOrders).catch((e) => say(e.message, false));
