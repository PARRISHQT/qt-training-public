<script setup>
import { computed, onMounted, ref } from 'vue';
import { getConfig, placeOrder } from '../api.js';
import { describePizza, money } from '../format.js';

const config = ref(null);
const loadError = ref('');
const size = ref('small');
const toppings = ref([]);
const cart = ref([]);
const name = ref('');
const phone = ref('');
const pickup = ref('ASAP');
const submitting = ref(false);
const error = ref('');
const confirmation = ref(null);

onMounted(async () => {
  try {
    config.value = await getConfig();
    if (!config.value.asapAvailable) pickup.value = config.value.pickupSlots[0]?.value ?? '';
  } catch {
    loadError.value = 'We could not load the menu. Please refresh the page.';
  }
});

const toppingPrice = computed(() => config.value?.menu.toppings[0].priceCents ?? 0);
const currentPrice = computed(() => {
  const s = config.value?.menu.sizes.find((x) => x.id === size.value);
  return (s?.priceCents ?? 0) + toppings.value.length * toppingPrice.value;
});
const lineTotal = (i) => i.unitPriceCents * i.quantity;
const total = computed(() => cart.value.reduce((sum, i) => sum + lineTotal(i), 0));

function addToOrder() {
  const key = `${size.value}|${[...toppings.value].sort().join(',')}`;
  const existing = cart.value.find((i) => i.key === key);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + 1, config.value.maxQuantity);
  } else {
    cart.value.push({
      key,
      size: size.value,
      toppings: [...toppings.value],
      quantity: 1,
      unitPriceCents: currentPrice.value,
    });
  }
  toppings.value = [];
  error.value = '';
}

function changeQty(item, delta) {
  item.quantity = Math.min(Math.max(item.quantity + delta, 1), config.value.maxQuantity);
}
const removeItem = (item) => (cart.value = cart.value.filter((i) => i !== item));

async function submit() {
  error.value = '';
  if (cart.value.length === 0) return (error.value = 'Your order is empty. Add a pizza first!');
  if (!name.value.trim()) return (error.value = 'Please enter your name.');
  submitting.value = true;
  try {
    confirmation.value = await placeOrder({
      name: name.value,
      phone: phone.value,
      pickup: pickup.value,
      items: cart.value.map(({ size, toppings, quantity }) => ({ size, toppings, quantity })),
    });
  } catch (err) {
    error.value = err.message;
    try {
      config.value = await getConfig(); // times may have moved on
    } catch {
      /* keep the old config */
    }
  } finally {
    submitting.value = false;
  }
}

function startOver() {
  confirmation.value = null;
  cart.value = [];
  name.value = '';
  phone.value = '';
  pickup.value = config.value.asapAvailable ? 'ASAP' : (config.value.pickupSlots[0]?.value ?? '');
}

const pickupLabel = (p) =>
  p === 'ASAP' ? `ASAP (about ${config.value.leadMinutes} minutes)` : (config.value.pickupSlots.find((s) => s.value === p)?.label ?? p);
</script>

<template>
  <main class="page">
    <header class="hero">
      <h1>Neighborhood Pizza</h1>
      <p class="tagline">Order online. Pick it up. Pay at the counter!</p>
    </header>

    <p v-if="loadError" class="alert" role="alert">{{ loadError }}</p>
    <p v-else-if="!config" class="muted">Loading the menu…</p>

    <section v-else-if="confirmation" class="card slime" aria-live="polite">
      <h2>Order Up!</h2>
      <p class="big-number">Order #{{ confirmation.orderNumber }}</p>
      <p>
        Thanks, <strong>{{ confirmation.name }}</strong
        >! Pickup: <strong>{{ pickupLabel(confirmation.pickupTime) }}</strong
        >. Pay at the counter.
      </p>
      <ul class="lines">
        <li v-for="(item, idx) in confirmation.items" :key="idx">
          <span>{{ item.quantity }} × {{ describePizza(item, config.menu) }}</span>
          <span>{{ money(item.unitPriceCents * item.quantity) }}</span>
        </li>
      </ul>
      <p class="total">Total: {{ money(confirmation.totalCents) }}</p>
      <button class="btn" @click="startOver">Order more pizza</button>
    </section>

    <template v-else>
      <p v-if="!config.acceptingOrders" class="alert" role="alert">
        We are closed for online orders right now. Hours are {{ config.hours.open }} to
        {{ config.hours.close }}.
      </p>

      <div class="columns">
        <section class="card">
          <h2>1. Build a pizza</h2>
          <fieldset>
            <legend>Size</legend>
            <label v-for="s in config.menu.sizes" :key="s.id" class="choice">
              <input v-model="size" type="radio" name="size" :value="s.id" />
              {{ s.label }} <span class="price">{{ money(s.priceCents) }}</span>
            </label>
          </fieldset>
          <fieldset>
            <legend>Toppings ({{ money(toppingPrice) }} each)</legend>
            <label v-for="t in config.menu.toppings" :key="t.id" class="choice">
              <input v-model="toppings" type="checkbox" :value="t.id" />
              {{ t.label }}
            </label>
            <p v-if="toppings.length === 0" class="muted">No toppings = plain cheese.</p>
          </fieldset>
          <p class="total">This pizza: {{ money(currentPrice) }}</p>
          <button class="btn" @click="addToOrder">Add to order</button>
        </section>

        <section class="card">
          <h2>2. Your order</h2>
          <p v-if="cart.length === 0" class="muted">Nothing here yet. Build a pizza!</p>
          <ul class="cart">
            <li v-for="item in cart" :key="item.key">
              <div class="cart-desc">
                <strong>{{ describePizza(item, config.menu) }}</strong>
                <span class="muted">{{ money(item.unitPriceCents) }} each</span>
              </div>
              <div class="qty">
                <button class="mini" :aria-label="'Fewer'" @click="changeQty(item, -1)">−</button>
                <span aria-live="polite">{{ item.quantity }}</span>
                <button class="mini" :aria-label="'More'" @click="changeQty(item, 1)">+</button>
              </div>
              <span class="price">{{ money(lineTotal(item)) }}</span>
              <button class="mini danger" @click="removeItem(item)">Remove</button>
            </li>
          </ul>
          <p class="total">Total: {{ money(total) }}</p>

          <h2>3. Pickup details</h2>
          <form @submit.prevent="submit">
            <label class="field"
              >Name
              <input v-model="name" type="text" maxlength="60" autocomplete="name" required />
            </label>
            <label class="field"
              >Phone number
              <input v-model="phone" type="tel" autocomplete="tel" placeholder="918-555-0123" required />
            </label>
            <label class="field"
              >Pickup time
              <select v-model="pickup" required>
                <option v-if="config.asapAvailable" value="ASAP">
                  ASAP (about {{ config.leadMinutes }} minutes)
                </option>
                <option v-for="s in config.pickupSlots" :key="s.value" :value="s.value">
                  {{ s.label }}
                </option>
              </select>
            </label>
            <p class="muted">
              Pickup only. Orders need at least {{ config.leadMinutes }} minutes. Open
              {{ config.hours.open }}–{{ config.hours.close }}.
            </p>
            <p v-if="error" class="alert" role="alert">{{ error }}</p>
            <button class="btn big" type="submit" :disabled="submitting || !config.acceptingOrders">
              {{ submitting ? 'Placing order…' : 'Place order for pickup' }}
            </button>
          </form>
        </section>
      </div>
    </template>
  </main>
</template>
