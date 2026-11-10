// Single source of truth for the menu and store rules. Prices are in cents.
export const MENU = {
  sizes: [
    { id: 'small', label: 'Small (10")', priceCents: 1000 },
    { id: 'large', label: 'Large (14")', priceCents: 1400 },
  ],
  toppings: [
    { id: 'pepperoni', label: 'Pepperoni', priceCents: 200 },
    { id: 'mushrooms', label: 'Mushrooms', priceCents: 200 },
    { id: 'onions', label: 'Onions', priceCents: 200 },
    { id: 'green-peppers', label: 'Green peppers', priceCents: 200 },
  ],
};

export const STORE = {
  timeZone: process.env.SHOP_TZ || 'America/Chicago',
  openMinutes: 10 * 60, // 10:00 AM
  closeMinutes: 23 * 60, // 11:00 PM
  leadMinutes: 30,
  slotMinutes: 15,
  maxQuantity: 20,
};

export const STATUSES = ['New', 'Ready', 'Picked Up'];
export const TRANSITIONS = {
  New: ['Ready'],
  Ready: ['Picked Up', 'New'],
  'Picked Up': [],
};
