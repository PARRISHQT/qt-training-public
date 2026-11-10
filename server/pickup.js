import { STORE } from './config.js';

/** Minutes since local midnight in the shop's time zone. */
export function shopNowMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STORE.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}

/** Earliest allowed pickup, in minutes since midnight, or null if the shop can't take orders now. */
export function earliestPickupMinutes(nowMinutes) {
  const earliest = Math.max(STORE.openMinutes, nowMinutes + STORE.leadMinutes);
  return earliest > STORE.closeMinutes ? null : earliest;
}

/** Valid same-day pickup slots (minutes since midnight). */
export function pickupSlots(nowMinutes) {
  const earliest = earliestPickupMinutes(nowMinutes);
  if (earliest === null) return [];
  const slots = [];
  const first = Math.ceil(earliest / STORE.slotMinutes) * STORE.slotMinutes;
  for (let t = first; t <= STORE.closeMinutes; t += STORE.slotMinutes) slots.push(t);
  return slots;
}

export function formatMinutes(total) {
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * pickup is 'ASAP' or 'HH:MM' (24h, shop-local, today).
 * Returns the normalized stored value, or throws a customer-safe Error.
 */
export function validatePickup(pickup, nowMinutes = shopNowMinutes()) {
  const earliest = earliestPickupMinutes(nowMinutes);
  if (earliest === null) {
    throw new Error(
      `We are not taking more pickup orders today. Hours are ${formatMinutes(STORE.openMinutes)} to ${formatMinutes(STORE.closeMinutes)}.`,
    );
  }
  if (pickup === 'ASAP') return 'ASAP';
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(pickup ?? ''));
  if (!match) throw new Error('Please choose a pickup time.');
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < STORE.openMinutes || minutes > STORE.closeMinutes) {
    throw new Error(
      `Pickup time must be between ${formatMinutes(STORE.openMinutes)} and ${formatMinutes(STORE.closeMinutes)}.`,
    );
  }
  if (minutes < nowMinutes + STORE.leadMinutes) {
    throw new Error(`Pickup time must be at least ${STORE.leadMinutes} minutes from now.`);
  }
  return pickup;
}
