// Production list: pre-orders due in the next 7 days, one card per day — what to
// make (totals per item and size), then each order with a "Ready" tick.
import { loadShop, updateOrder } from '../api.js';
import { todayISO, addDays, formatDay } from '../dates.js';
import { initShell, setBadges } from './shell.js';
import { openOrderModal } from './order-modal.js';
import { escapeHtml, displayPhone, paymentBadge, slotLabel, toast } from './common.js';

initShell();

let all = (await loadShop()).orders;
setBadges(all);

const today = todayISO();
const last = addDays(today, 6);
const SLOTS = ['morning', 'afternoon', 'evening'];

document.querySelector('[data-print]').addEventListener('click', () => window.print());
render();

function due() {
  return all
    .filter((o) => o.store === 'bake' && o.type !== 'request' && ['requested', 'confirmed', 'ready'].includes(o.status) && o.neededBy >= today && o.neededBy <= last)
    .sort((a, b) => a.neededBy.localeCompare(b.neededBy) || SLOTS.indexOf(a.timeSlot) - SLOTS.indexOf(b.timeSlot));
}

function dayName(d) {
  if (d === today) return `Today · ${formatDay(d)}`;
  if (d === addDays(today, 1)) return `Tomorrow · ${formatDay(d)}`;
  return formatDay(d);
}

function render() {
  const list = due();
  const days = [...new Set(list.map((o) => o.neededBy))];
  const box = document.querySelector('[data-days]');
  document.querySelector('[data-days-nav]').innerHTML = days.map((d) =>
    `<a class="btn btn-outline-primary" href="#day-${d}">${escapeHtml(dayName(d).split(' · ')[0])}<span class="count">${list.filter((o) => o.neededBy === d).length}</span></a>`).join('');
  if (!days.length) {
    box.innerHTML = '<div class="card-panel text-muted">No pre-orders due in the next 7 days.</div>';
    return;
  }
  box.innerHTML = days.map((d) => {
    const orders = list.filter((o) => o.neededBy === d);
    const ready = orders.filter((o) => o.status === 'ready').length;
    return `
      <section class="card-panel" id="day-${d}" aria-labelledby="day-${d}-title">
        <div class="panel-head">
          <h2 id="day-${d}-title" class="h5">${escapeHtml(dayName(d))}</h2>
          <span class="small text-muted">${ready} of ${orders.length} ready</span>
        </div>
        <h3 class="visually-hidden">To make</h3>
        <ul class="make-list">${makeList(orders)}</ul>
        <h3 class="visually-hidden">Orders</h3>
        ${orders.map(row).join('')}
      </section>`;
  }).join('');
}

function makeList(orders) {
  const byItem = new Map();
  for (const o of orders) {
    for (const i of o.items) {
      const sizes = byItem.get(i.name) ?? new Map();
      sizes.set(i.unit, (sizes.get(i.unit) ?? 0) + i.qty);
      byItem.set(i.name, sizes);
    }
  }
  return [...byItem].sort(([a], [b]) => a.localeCompare(b)).map(([name, sizes]) =>
    `<li><strong>${escapeHtml(name)}</strong><span>${[...sizes].map(([unit, qty]) => `${qty} × ${escapeHtml(unit)}`).join(' · ')}</span></li>`).join('');
}

function row(o) {
  const id = `ready-${o.ref}`;
  const ready = o.status === 'ready';
  const where = o.fulfilment === 'delivery' ? `Delivery${o.customer?.area || o.area ? `, ${o.customer?.area || o.area}` : ''}` : 'Pickup';
  return `
    <div class="prod-order${ready ? ' is-ready' : ''}">
      <input class="form-check-input" type="checkbox" id="${escapeHtml(id)}" data-ready="${escapeHtml(o.ref)}" ${ready ? 'checked' : ''}>
      <div class="body">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <label class="fw-semibold" for="${escapeHtml(id)}">${escapeHtml(o.customer?.name || 'Customer')}</label>
          <span class="badge-soft secondary">${escapeHtml(slotLabel(o.timeSlot) || 'Any time')}</span>
          ${paymentBadge(o)}
          ${o.status === 'requested' ? '<span class="badge-soft warning">Not confirmed yet</span>' : ''}
        </div>
        <p class="items mb-1 mt-1">${o.items.map((i) => `${i.qty} × ${escapeHtml(i.name)} (${escapeHtml(i.unit)})`).join(', ')}</p>
        ${o.cakeMessage ? `<p class="small mb-1">On the cake: “${escapeHtml(o.cakeMessage)}”</p>` : ''}
        <p class="small text-muted mb-0">${escapeHtml(where)}${o.customer?.phone ? ` · ${escapeHtml(displayPhone(o.customer.phone))}` : ''} · <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-open="${escapeHtml(o.ref)}">${escapeHtml(o.ref)}</button></p>
      </div>
    </div>`;
}

document.querySelector('[data-days]').addEventListener('change', async (e) => {
  const ref = e.target.dataset.ready;
  if (!ref) return;
  const ready = e.target.checked;
  const order = await updateOrder(ref, { status: ready ? 'ready' : 'confirmed' }, ready ? 'Marked as ready' : 'Marked as not ready');
  all = all.map((o) => (o.ref === ref ? order : o));
  setBadges(all);
  toast(ready ? 'Marked as ready' : 'Marked as not ready');
  render();
});

document.querySelector('[data-days]').addEventListener('click', (e) => {
  const ref = e.target.closest('[data-open]')?.dataset.open;
  const order = ref && all.find((o) => o.ref === ref);
  if (order) openOrderModal(order, { onChange: (o) => { all = all.map((x) => (x.ref === o.ref ? o : x)); setBadges(all); render(); } });
});
