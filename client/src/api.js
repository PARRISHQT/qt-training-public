async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const getConfig = () => request('/api/config');
export const placeOrder = (order) =>
  request('/api/orders', { method: 'POST', body: JSON.stringify(order) });

const pinHeader = (pin) => ({ 'x-kitchen-pin': pin });
export const kitchenLogin = (pin) =>
  request('/api/kitchen/login', { method: 'POST', body: '{}', headers: pinHeader(pin) });
export const kitchenOrders = (pin, history) =>
  request(`/api/kitchen/orders${history ? '?history=1' : ''}`, { headers: pinHeader(pin) });
export const setOrderStatus = (pin, id, status) =>
  request(`/api/kitchen/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    headers: pinHeader(pin),
  });
