// My orders: everything placed from this phone (no account needed), with
// "Send on WhatsApp" for orders not sent yet and "Order again" for past orders.
// Phase 2 adds live status from the backend.
import { BUSINESS } from '../config.js';
import { initPage, money, icon, escapeHtml, siteUrl } from '../ui.js';
import { getCatalogue } from '../api.js';
import { addQty } from '../cart.js';
import { resolveLines } from '../lines.js';
import { listLocalOrders, markSent, clearLocalOrders, whatsappOrderUrl, neededByText } from '../orders.js';
import { formatDateTime } from '../dates.js';

const root = document.querySelector('[data-orders]');
const FILTERS = [
  { id: 'all', name: 'All' },
  { id: 'varieties', name: BUSINESS.stores.varieties.short },
  { id: 'bake', name: BUSINESS.stores.bake.short },
];
let filter = 'all';
const notices = new Map(); // ref → "Order again" result shown on that card

initPage();
render();

window.addEventListener('storage', (e) => {
  if (e.key === 'bammie.orders') render();
});

root.addEventListener('click', async (e) => {
  const chip = e.target.closest('[data-filter]');
  if (chip) {
    filter = chip.dataset.filter;
    render();
    return;
  }
  if (e.target.closest('[data-clear]')) {
    if (confirm('Remove all orders from this phone? This only clears your list here. Bammie keeps her own records on WhatsApp.')) {
      clearLocalOrders();
      render();
    }
    return;
  }
  const card = e.target.closest('[data-ref]');
  if (!card) return;
  const order = listLocalOrders().find((o) => o.ref === card.dataset.ref);
  if (!order) return;

  if (e.target.closest('[data-send]')) {
    markSent(order.ref);
    setTimeout(render, 600); // let WhatsApp open first
  } else if (e.target.closest('[data-again]')) {
    e.target.closest('[data-again]').disabled = true;
    await orderAgain(order);
  }
});

function render() {
  const orders = listLocalOrders();

  if (!orders.length) {
    root.innerHTML = `
      <div class="empty">
        ${icon('receipt')}
        <h2>No orders on this phone yet</h2>
        <p>When you place an order or a pre-order, it shows up here so you can send it again or order the same things next time.</p>
        <div class="order-actions">
          <a class="btn btn--brand theme-varieties" href="varieties/">${icon('basket')}Varieties Store</a>
          <a class="btn btn--brand theme-bake" href="bake/">${icon('cupcake')}Bake &amp; Cook</a>
        </div>
      </div>`;
    return;
  }

  const shown = orders.filter((o) => filter === 'all' || o.store === filter);
  const count = (id) => orders.filter((o) => id === 'all' || o.store === id).length;

  root.innerHTML = `
    <div class="notice notice--soft">${icon('info')}<span>Only orders placed on this phone appear here. Bammie confirms every order on WhatsApp.</span></div>
    <div class="chips" role="toolbar" aria-label="Show orders from">
      ${FILTERS.map((f) => `<button type="button" class="chip" data-filter="${f.id}" aria-pressed="${f.id === filter}">${escapeHtml(f.name)} (${count(f.id)})</button>`).join('')}
    </div>
    ${shown.length
      ? `<div class="orders-list">${shown.map(card).join('')}</div>`
      : `<p class="muted">No ${escapeHtml(FILTERS.find((f) => f.id === filter).name)} orders on this phone yet.</p>`}
    <div class="my-orders__foot">
      <button type="button" class="link-btn" data-clear>${icon('trash')}Clear this list on this phone</button>
    </div>`;
}

function card(o) {
  const store = BUSINESS.stores[o.store];
  const isRequest = o.type === 'request';
  const sent = Boolean(o.sentAt);
  const notice = notices.get(o.ref);

  const total = isRequest ? 'Quote requested'
    : o.fulfilment === 'delivery' ? `${money(o.total)} + delivery`
      : money(o.total);

  return `
    <article class="order-card theme-${escapeHtml(o.store)}" data-ref="${escapeHtml(o.ref)}" aria-label="${isRequest ? 'Request' : 'Order'} ${escapeHtml(o.ref)}">
      <div class="order-card__head">
        <span class="order-card__store">${icon(o.store === 'bake' ? 'cupcake' : 'basket')}${escapeHtml(store.short)}${isRequest ? ' · occasion request' : ''}</span>
        <span class="order-ref">${escapeHtml(o.ref)}</span>
      </div>
      <p class="order-card__items">${escapeHtml(summary(o))}</p>
      <ul class="order-card__meta" role="list">
        <li>Placed ${formatDateTime(o.createdAt)}</li>
        ${o.neededBy ? `<li>${isRequest ? 'Event' : 'Needed'} ${escapeHtml(neededByText(o))}</li>` : ''}
        <li><strong>${escapeHtml(total)}</strong></li>
      </ul>
      <p class="order-card__status ${sent ? 'is-sent' : 'is-pending'}">
        ${sent ? `${icon('check')}Sent on WhatsApp` : `${icon('info')}Not sent to Bammie yet`}
      </p>
      ${notice ? `<div class="notice" role="status">${icon('info')}<span>${notice}</span></div>` : ''}
      <div class="order-card__actions">
        ${sent ? '' : `<a class="btn btn--whatsapp btn--sm" href="${whatsappOrderUrl(o)}" target="_blank" rel="noopener" data-send>${icon('whatsapp')}Send on WhatsApp</a>`}
        <a class="btn btn--outline btn--sm" href="order.html?ref=${encodeURIComponent(o.ref)}">View</a>
        ${isRequest
          ? `<a class="btn btn--brand btn--sm" href="bake/custom-order.html">Plan another occasion</a>`
          : `<button type="button" class="btn btn--brand btn--sm" data-again>${icon('cart')}Order again</button>`}
      </div>
    </article>`;
}

// "2 × Long-grain Rice, 3 × Plantain Chips and 1 more"
function summary(o) {
  if (o.type === 'request') return `${o.request.eventType} for about ${o.request.guests} guests`;
  const parts = o.items.slice(0, 2).map((i) => `${i.qty} × ${i.name}`);
  const more = o.items.length - parts.length;
  return parts.join(', ') + (more > 0 ? ` and ${more} more` : '');
}

// Put the same items back in that store's cart at today's prices. Batch items
// come back as menu items, since that week's batch has closed.
async function orderAgain(order) {
  const cartUrl = siteUrl(`${order.store}/cart.html`);
  let data;
  try {
    data = await getCatalogue(order.store);
  } catch {
    notices.set(order.ref, "Couldn't load the shop. Check your connection and try again.");
    render();
    return;
  }

  const lines = order.items.map((i) => ({ id: i.id, qty: i.qty, ...(i.option && { option: i.option }) }));
  const rows = resolveLines(order.store, lines, data);
  const added = rows.filter((r) => r.available);
  const missing = rows.filter((r) => !r.available);
  added.forEach((r) => addQty(order.store, r.line.id, Math.max(r.qty, r.minQty), { option: r.line.option }));

  if (!missing.length) {
    location.href = cartUrl;
    return;
  }
  const names = missing.map((r) => r.name || order.items.find((i) => i.id === r.line.id)?.name || 'An item');
  const cartName = order.store === 'bake' ? 'pre-order' : 'cart';
  notices.set(order.ref, added.length
    ? `Added ${added.length} of ${rows.length} items to your ${cartName}. Not available right now: ${escapeHtml(names.join(', '))}. <a href="${cartUrl}">Go to your ${cartName}</a>`
    : `None of these items are available right now: ${escapeHtml(names.join(', '))}.`);
  render();
}
