export const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export function describePizza(item, menu) {
  const size = menu.sizes.find((s) => s.id === item.size)?.label ?? item.size;
  const names = item.toppings.map((id) => menu.toppings.find((t) => t.id === id)?.label ?? id);
  return `${size}, ${names.length ? names.join(', ') : 'plain cheese'}`;
}
