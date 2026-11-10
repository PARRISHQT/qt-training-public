'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { priceOrder } = require('./pricing');
const { applyPrices, validateSpecialty, uniqueId } = require('./admin');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

const loadMenu = () => JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));
function saveMenu(menu) {
  const tmp = MENU_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(menu, null, 2));
  fs.renameSync(tmp, MENU_FILE);
}
const loadOrders =() => (fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) : []);
const saveOrders = (o) => fs.writeFileSync(ORDERS_FILE, JSON.stringify(o, null, 2));

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 50_000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('bad json')); } });
  });
}

// Status is simulated from elapsed time since the order was placed.
function statusFor(order) {
  const mins = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
  const steps = order.method === 'delivery'
    ? [[0, 'Received'], [2, 'Preparing'], [10, 'In the oven'], [18, 'Out for delivery'], [30, 'Delivered']]
    : [[0, 'Received'], [2, 'Preparing'], [10, 'In the oven'], [18, 'Ready for pickup']];
  let s = steps[0][1];
  for (const [m, label] of steps) if (mins >= m) s = label;
  return s;
}

const clean = (v, max) => String(v || '').trim().slice(0, max);

// Admin has no password (by request), so it is limited to requests from this machine.
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

async function handleAdmin(req, res, url) {
  if (!isLocal(req)) return send(res, 403, { errors: ['Admin is only available from the server machine'] });
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/admin/menu') return send(res, 200, loadMenu());
  if (req.method === 'GET' && p === '/api/admin/orders') {
    const orders = loadOrders().map((o) => ({ ...o, status: statusFor(o) })).reverse();
    return send(res, 200, orders);
  }
  if (req.method === 'PUT' && p === '/api/admin/prices') {
    const { errors, menu } = applyPrices(loadMenu(), await readBody(req));
    if (errors.length) return send(res, 400, { errors });
    saveMenu(menu);
    return send(res, 200, menu);
  }
  if (req.method === 'POST' && p === '/api/admin/specialties') {
    const menu = loadMenu();
    const { errors, value } = validateSpecialty(menu, await readBody(req));
    if (errors.length) return send(res, 400, { errors });
    const sp = { id: uniqueId(menu, value.name), ...value };
    menu.specialties.push(sp);
    saveMenu(menu);
    return send(res, 201, sp);
  }
  const m = p.match(/^\/api\/admin\/specialties\/([a-z0-9-]+)$/);
  if (m) {
    const menu = loadMenu();
    const idx = menu.specialties.findIndex((x) => x.id === m[1]);
    if (idx < 0) return send(res, 404, { errors: ['Specialty not found'] });
    if (req.method === 'PUT') {
      const { errors, value } = validateSpecialty(menu, await readBody(req), m[1]);
      if (errors.length) return send(res, 400, { errors });
      menu.specialties[idx] = { id: m[1], ...value };
      saveMenu(menu);
      return send(res, 200, menu.specialties[idx]);
    }
    if (req.method === 'DELETE') {
      menu.specialties.splice(idx, 1);
      saveMenu(menu);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { errors: ['Not found'] });
}

async function handleApi(req, res, url) {
  if (url.pathname.startsWith('/api/admin/')) return handleAdmin(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/menu') {
    const { _notes, ...menu } = loadMenu();
    return send(res, 200, menu);
  }
  if (req.method === 'POST' && url.pathname === '/api/quote') {
    const priced = priceOrder(loadMenu(), await readBody(req));
    return send(res, priced.errors.length ? 400 : 200, priced);
  }
  if (req.method === 'POST' && url.pathname === '/api/orders') {
    const body = await readBody(req);
    const priced = priceOrder(loadMenu(), body);
    const errors = [...priced.errors];
    const customer = { name: clean(body.name, 80), phone: clean(body.phone, 20), address: clean(body.address, 200), notes: clean(body.notes, 200) };
    if (!customer.name) errors.push('Name is required');
    if (customer.phone.replace(/\D/g, '').length < 10) errors.push('Valid phone number is required');
    if (priced.method === 'delivery' && !customer.address) errors.push('Delivery address is required');
    if (errors.length) return send(res, 400, { errors });
    const order = {
      id: crypto.randomBytes(4).toString('hex').toUpperCase(),
      createdAt: new Date().toISOString(),
      customer, ...priced, errors: undefined,
      payment: priced.method === 'delivery' ? 'Pay driver at the door' : 'Pay at the store',
    };
    const orders = loadOrders();
    orders.push(order);
    saveOrders(orders);
    return send(res, 201, { ...order, status: statusFor(order) });
  }
  const m = url.pathname.match(/^\/api\/orders\/([A-F0-9]{8})$/i);
  if (req.method === 'GET' && m) {
    const order = loadOrders().find((o) => o.id === m[1].toUpperCase());
    if (!order) return send(res, 404, { errors: ['Order not found'] });
    return send(res, 200, { ...order, status: statusFor(order) });
  }
  return send(res, 404, { errors: ['Not found'] });
}

function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    send(res, 400, { errors: [e.message] });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Pizza app running at http://localhost:${PORT}`));
}
module.exports = { server };
