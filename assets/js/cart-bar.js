// The sticky "3 items · ₦20,500 → View cart" bar at the bottom of shop pages.
import { money } from './ui.js';
import { getLines } from './cart.js';
import { resolveLines } from './lines.js';

export function initCartBar(store, data, hint) {
  const bar = document.querySelector('[data-cart-bar]');
  const summary = document.querySelector('[data-cart-bar-summary]');
  if (!bar) return;

  const update = () => {
    const rows = resolveLines(store, getLines(store), data).filter((r) => r.available);
    const count = rows.reduce((n, r) => n + r.qty, 0);
    const total = rows.reduce((sum, r) => sum + r.total, 0);
    bar.hidden = count === 0;
    document.body.classList.toggle('has-cart-bar', count > 0);
    summary.innerHTML = `<strong>${count} ${count === 1 ? 'item' : 'items'} · ${money(total)}</strong><small>${hint}</small>`;
  };

  update();
  window.addEventListener('bammie:cart', update);
  window.addEventListener('storage', (e) => {
    if (e.key === `bammie.cart.${store}`) update();
  });
}
