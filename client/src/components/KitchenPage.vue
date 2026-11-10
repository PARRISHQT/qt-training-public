<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getConfig, kitchenLogin, kitchenOrders, setOrderStatus } from '../api.js';
import { describePizza, money } from '../format.js';

const POLL_MS = 5000;
const pin = ref(sessionStorage.getItem('kitchenPin') || '');
const entered = ref('');
const authed = ref(false);
const error = ref('');
const orders = ref([]);
const menu = ref(null);
const showHistory = ref(false);
let timer;

const columns = computed(() => ({
  New: orders.value.filter((o) => o.status === 'New'),
  Ready: orders.value.filter((o) => o.status === 'Ready'),
  'Picked Up': orders.value.filter((o) => o.status === 'Picked Up'),
}));

function logout() {
  sessionStorage.removeItem('kitchenPin');
  pin.value = '';
  authed.value = false;
  clearInterval(timer);
}

async function refresh() {
  try {
    orders.value = await kitchenOrders(pin.value, showHistory.value);
    error.value = '';
  } catch (err) {
    if (err.status === 401) return logout();
    error.value = err.message;
  }
}

async function login(candidate) {
  error.value = '';
  try {
    await kitchenLogin(candidate);
    pin.value = candidate;
    sessionStorage.setItem('kitchenPin', candidate);
    authed.value = true;
    menu.value ??= (await getConfig()).menu;
    await refresh();
    clearInterval(timer);
    timer = setInterval(refresh, POLL_MS);
  } catch (err) {
    authed.value = false;
    error.value = err.status === 401 || err.status === 429 ? err.message : 'Could not reach the server.';
  }
}

async function move(order, status) {
  try {
    await setOrderStatus(pin.value, order.orderNumber, status);
    await refresh();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(() => pin.value && login(pin.value));
onBeforeUnmount(() => clearInterval(timer));

const timeLabel = (p) => (p === 'ASAP' ? 'ASAP' : p);
const placedAt = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
</script>

<template>
  <main class="page kitchen">
    <header class="hero">
      <h1>Kitchen Orders</h1>
    </header>

    <form v-if="!authed" class="card pin" @submit.prevent="login(entered)">
      <h2>Enter kitchen PIN</h2>
      <input v-model="entered" type="password" inputmode="numeric" autocomplete="off" aria-label="Kitchen PIN" />
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <button class="btn" type="submit">Unlock</button>
    </form>

    <template v-else>
      <div class="toolbar">
        <label class="choice"
          ><input v-model="showHistory" type="checkbox" @change="refresh" /> Show picked up orders</label
        >
        <button class="mini" @click="logout">Lock</button>
      </div>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>

      <div class="board">
        <section v-for="status in showHistory ? ['New', 'Ready', 'Picked Up'] : ['New', 'Ready']" :key="status">
          <h2>{{ status }} ({{ columns[status].length }})</h2>
          <p v-if="columns[status].length === 0" class="muted">No {{ status.toLowerCase() }} orders.</p>
          <article v-for="o in columns[status]" :key="o.orderNumber" class="card order" :class="'st-' + status.replace(' ', '')">
            <div class="order-head">
              <span class="big-number">#{{ o.orderNumber }}</span>
              <span class="badge">{{ o.status }}</span>
            </div>
            <p>
              <strong>{{ o.name }}</strong> · {{ o.phone }}<br />
              Pickup: <strong>{{ timeLabel(o.pickupTime) }}</strong>
              <span class="muted"> (placed {{ placedAt(o.createdAt) }})</span>
            </p>
            <ul class="lines">
              <li v-for="(item, idx) in o.items" :key="idx">
                <span>{{ item.quantity }} × {{ describePizza(item, menu) }}</span>
              </li>
            </ul>
            <p class="total">Total: {{ money(o.totalCents) }}</p>
            <div class="actions">
              <button v-if="o.status === 'New'" class="btn" @click="move(o, 'Ready')">Mark Ready</button>
              <template v-if="o.status === 'Ready'">
                <button class="btn" @click="move(o, 'Picked Up')">Picked Up</button>
                <button class="mini" @click="move(o, 'New')">Back to New</button>
              </template>
            </div>
          </article>
        </section>
      </div>
    </template>
  </main>
</template>
