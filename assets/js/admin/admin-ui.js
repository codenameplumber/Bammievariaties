// Shared bits for the owner-tools pages: the demo bar, deltas, labels.
import { icon, escapeHtml } from '../ui.js';
import { resetDemo } from '../api.js';

export function initAdmin() {
  document.querySelector('[data-reset-demo]')?.addEventListener('click', async () => {
    if (!confirm('Reset the demo? Sales you recorded and "ready" ticks on this phone will be removed.')) return;
    await resetDemo();
    location.reload();
  });
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// "▲ 12% vs last Wed" — the arrow carries direction, so it's never colour alone.
export function deltaHtml(pct, against) {
  if (pct === null) return `<span class="delta delta--flat">No sales ${escapeHtml(against)} to compare with</span>`;
  if (pct === 0) return `<span class="delta delta--flat">Same as ${escapeHtml(against)}</span>`;
  const up = pct > 0;
  return `<span class="delta delta--${up ? 'up' : 'down'}">${icon(up ? 'arrow-up' : 'arrow-down')}${Math.abs(pct)}% <span class="delta__vs">vs ${escapeHtml(against)}</span></span>`;
}

export const PAYMENT_LABEL = {
  cash: 'Cash', transfer: 'Transfer', pos: 'POS',
  'pay-on-delivery': 'Pay on delivery', 'pay-on-collection': 'Pay on collection',
};

export const PAY_STATUS = { paid: 'Paid', deposit: 'Deposit paid', unpaid: 'Not paid' };

// "2 × Meat Pie, 3 × Chin Chin and 1 more"
export function itemsSummary(order, max = 2) {
  const parts = order.items.slice(0, max).map((i) => `${i.qty} × ${i.name}`);
  const more = order.items.length - parts.length;
  return parts.join(', ') + (more > 0 ? ` and ${more} more` : '');
}

export function timeOf(iso) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true });
}
