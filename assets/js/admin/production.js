// Production list: Bake & Cook pre-orders due in the next 7 days, one card per
// day. Each day starts with what to make (totals per item and pack), then the
// orders, each with a "Ready" tick so Bammie can work down the list.
import { BAKE } from '../config.js';
import { escapeHtml } from '../ui.js';
import { getAdminOrders, getReadyRefs, setOrderReady } from '../api.js';
import { todayISO, addDays, formatDay } from '../dates.js';
import { displayPhone } from '../customer.js';
import { initAdmin, PAY_STATUS } from './admin-ui.js';

initAdmin();

const today = todayISO();
const last = addDays(today, 6);
const slots = Object.keys(BAKE.timeSlots);

const [orders, ready] = await Promise.all([getAdminOrders(), getReadyRefs()]);
const due = orders
  .filter((o) => o.store === 'bake' && o.type !== 'request' && o.neededBy >= today && o.neededBy <= last)
  .sort((a, b) => a.neededBy.localeCompare(b.neededBy) || slots.indexOf(a.timeSlot) - slots.indexOf(b.timeSlot) || (a.customer?.name ?? '').localeCompare(b.customer?.name ?? ''));

const days = [...new Set(due.map((o) => o.neededBy))];
const dayName = (d) => (d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : formatDay(d).split(',')[0]);

document.querySelector('[data-print]').addEventListener('click', () => window.print());
render();

function render() {
  const nav = document.querySelector('[data-days-nav]');
  const box = document.querySelector('[data-days]');
  if (!days.length) {
    nav.hidden = true;
    box.innerHTML = '<div class="panel"><p class="panel__note">No pre-orders due in the next 7 days.</p></div>';
    return;
  }
  nav.innerHTML = days.map((d) => `<a class="chip" href="#day-${d}">${dayName(d)} (${due.filter((o) => o.neededBy === d).length})</a>`).join('');
  box.innerHTML = days.map(dayCard).join('');
}

function dayCard(day) {
  const list = due.filter((o) => o.neededBy === day);
  const done = list.filter((o) => ready.has(o.ref)).length;
  return `
    <section class="panel" id="day-${day}" aria-labelledby="day-${day}-title">
      <div class="prod-day__head">
        <h2 id="day-${day}-title">${day <= addDays(today, 1) ? `${dayName(day)} · ` : ''}${formatDay(day)}</h2>
        <span class="prod-day__count" data-progress="${day}">${done} of ${list.length} ready</span>
      </div>
      <h3 class="visually-hidden">To make</h3>
      <ul class="make-list" role="list">${makeList(list)}</ul>
      <h3 class="visually-hidden">Orders</h3>
      ${list.map(orderRow).join('')}
    </section>`;
}

// "Meat Pie — 14 × Pack of 6 · 3 × Pack of 12"
function makeList(list) {
  const byItem = new Map();
  for (const o of list) {
    for (const i of o.items) {
      const packs = byItem.get(i.name) ?? new Map();
      packs.set(i.unit, (packs.get(i.unit) ?? 0) + i.qty);
      byItem.set(i.name, packs);
    }
  }
  return [...byItem].sort(([a], [b]) => a.localeCompare(b)).map(([name, packs]) => `
    <li>
      <span class="make-list__name">${escapeHtml(name)}</span>
      <span class="make-list__qty">${[...packs].map(([unit, qty]) => `${qty} × ${escapeHtml(unit)}`).join(' · ')}</span>
    </li>`).join('');
}

function orderRow(o) {
  const isReady = ready.has(o.ref);
  const id = `ready-${o.ref}`;
  const where = o.fulfilment === 'delivery' ? `Delivery${o.area ? `, ${o.area}` : ''}` : 'Pickup';
  return `
    <div class="prod-order${isReady ? ' is-ready' : ''}" data-ref="${escapeHtml(o.ref)}">
      <input type="checkbox" id="${escapeHtml(id)}" ${isReady ? 'checked' : ''} aria-describedby="${escapeHtml(id)}-what">
      <div class="prod-order__body">
        <div class="prod-order__top">
          <label class="prod-order__who" for="${escapeHtml(id)}">${escapeHtml(o.customer?.name || 'Customer')}</label>
          <span class="pill pill--neutral">${escapeHtml(BAKE.timeSlots[o.timeSlot] ?? 'Any time')}</span>
          <span class="pill pill--${o.payment.status}">${PAY_STATUS[o.payment.status]}</span>
          ${o.status === 'requested' ? '<span class="pill pill--unpaid">Not confirmed yet</span>' : ''}
        </div>
        <p class="prod-order__items" id="${escapeHtml(id)}-what">${o.items.map((i) => `${i.qty} × ${escapeHtml(i.name)} (${escapeHtml(i.unit)})`).join(', ')}</p>
        ${o.cakeMessage ? `<p class="prod-order__meta">On the cake: “${escapeHtml(o.cakeMessage)}”</p>` : ''}
        <p class="prod-order__meta">${escapeHtml(where)}${o.occasion ? ` · ${escapeHtml(o.occasion)}` : ''}${o.customer?.phone ? ` · ${escapeHtml(displayPhone(o.customer.phone))}` : ''} · ${escapeHtml(o.ref)}</p>
      </div>
    </div>`;
}

document.querySelector('[data-days]').addEventListener('change', async (e) => {
  const row = e.target.closest('[data-ref]');
  if (!row) return;
  const isReady = e.target.checked;
  row.classList.toggle('is-ready', isReady);
  if (isReady) ready.add(row.dataset.ref);
  else ready.delete(row.dataset.ref);
  await setOrderReady(row.dataset.ref, isReady);
  const day = due.find((o) => o.ref === row.dataset.ref).neededBy;
  const list = due.filter((o) => o.neededBy === day);
  document.querySelector(`[data-progress="${day}"]`).textContent = `${list.filter((o) => ready.has(o.ref)).length} of ${list.length} ready`;
});
