// Record a sale (shop counter or an order taken on WhatsApp/TikTok/phone):
// tap products, check the total, save. Cash and walk-in are preselected, so a
// common sale is two taps. A Bake & Cook sale with a "needed on" date becomes a
// pre-order on the production list. Each line keeps its cost price for profit.
import { BAKE } from '../config.js';
import { loadShop, recordSale } from '../api.js';
import { siteUrl } from '../ui.js';
import { hydrateImages } from '../idb.js';
import { normalisePhone } from '../customer.js';
import { makeRef } from '../orders.js';
import { todayISO } from '../dates.js';
import { initShell, setBadges } from './shell.js';
import { completedSales, dayOf } from './stats.js';
import { money, escapeHtml, toast, PAYMENT_METHOD, CHANNEL, renderPills } from './common.js';

initShell();

const shop = await loadShop();
setBadges(shop.orders);
const today = todayISO();
const $q = (sel) => document.querySelector(sel);
const form = $q('[data-form]');

const TILES = {
  varieties: shop.varieties.products.map((p) => ({ key: p.id, id: p.id, name: p.name, detail: p.unit, price: p.price, cost: p.cost ?? 0, image: p.image, category: p.category, minQty: 1, sellable: p.inStock })),
  bake: shop.bake.products.flatMap((p) => p.options.map((o) => ({ key: `${p.id}:${o.id}`, id: p.id, option: o.id, name: p.name, detail: o.label, price: o.price, cost: o.cost ?? 0, image: p.image, category: p.category, minQty: p.minQty ?? 1, sellable: p.available }))),
};
const CATEGORIES = { varieties: shop.varieties.categories, bake: shop.bake.categories };

// Known customers by phone, for the "regular customer" hint.
const customers = new Map();
for (const o of shop.orders) {
  const phone = o.customer?.phone;
  if (!phone || o.type === 'request') continue;
  const key = phoneKey(phone);
  const c = customers.get(key) ?? { phone, name: o.customer.name, count: 0, total: 0 };
  c.count += 1;
  c.total += o.total;
  customers.set(key, c);
}

const todays = completedSales(shop.orders).filter((o) => dayOf(o) === today);
let todaySoFar = { count: todays.length, total: todays.reduce((s, o) => s + o.total, 0) };
let store = 'varieties';
let category = 'all';
let query = '';
const sale = new Map(); // tile key → qty

form.querySelector('[data-slots]').innerHTML = Object.entries(BAKE.timeSlots).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
form.elements.neededBy.min = today;

renderTodayLine();
renderCats();
renderTiles();
renderSale();

// ---- events --------------------------------------------------------------------------
document.querySelectorAll('input[name="store"]').forEach((r) => r.addEventListener('change', async (e) => {
  if (sale.size && !confirm('Start a new sale for the other store? The items in this sale will be cleared.')) {
    document.querySelector(`input[name="store"][value="${store}"]`).checked = true;
    return;
  }
  store = e.target.value;
  category = 'all';
  sale.clear();
  form.querySelector('[data-bake-only]').hidden = store !== 'bake';
  renderCats();
  renderTiles();
  renderSale();
}));
$q('[data-search]').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); renderTiles(); });
$q('[data-cats]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (btn) { category = btn.dataset.filter; renderCats(); renderTiles(); }
});
$q('[data-tiles]').addEventListener('click', (e) => {
  const tile = TILES[store].find((t) => t.key === e.target.closest('[data-key]')?.dataset.key);
  if (!tile) return;
  sale.set(tile.key, Math.min(999, (sale.get(tile.key) ?? 0) + (sale.has(tile.key) ? 1 : tile.minQty)));
  renderTiles();
  renderSale();
});
$q('[data-lines]').addEventListener('click', (e) => {
  const key = e.target.closest('[data-line]')?.dataset.line;
  const tile = TILES[store].find((t) => t.key === key);
  if (!tile) return;
  const qty = sale.get(key);
  if (e.target.closest('[data-inc]')) sale.set(key, Math.min(999, qty + 1));
  else if (e.target.closest('[data-dec]')) { if (qty - 1 < tile.minQty) sale.delete(key); else sale.set(key, qty - 1); }
  else if (e.target.closest('[data-remove]')) sale.delete(key);
  else return;
  renderTiles();
  renderSale();
});
$q('[data-clear]').addEventListener('click', () => { sale.clear(); renderTiles(); renderSale(); });
form.addEventListener('change', (e) => {
  if (e.target.name === 'neededBy') form.querySelector('[data-pay-status]').hidden = !e.target.value;
  renderBar();
});
form.elements.phone.addEventListener('input', () => {
  form.elements.phone.classList.remove('is-invalid');
  const match = customers.get(phoneKey(form.elements.phone.value));
  const hint = form.querySelector('[data-regular]');
  hint.hidden = !match;
  if (match) {
    hint.innerHTML = `<i class="bi bi-person-check me-1"></i>Regular customer: <strong>${escapeHtml(match.name)}</strong> · ${match.count} orders · ${money(match.total)} spent`;
    if (!form.elements.customer.value) form.elements.customer.value = match.name;
  }
});
$q('[data-bar-save]').addEventListener('click', () => form.requestSubmit());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const lines = saleLines();
  if (!lines.length) return;
  const raw = form.elements.phone.value.trim();
  const known = customers.get(phoneKey(raw));
  const phone = raw ? known?.phone ?? normalisePhone(raw) : null;
  if (raw && !phone) {
    form.elements.phone.classList.add('is-invalid');
    form.elements.phone.focus();
    return;
  }
  const neededBy = store === 'bake' ? form.elements.neededBy.value : '';
  if (neededBy && neededBy < today) {
    form.elements.neededBy.classList.add('is-invalid');
    return;
  }
  form.elements.neededBy.classList.remove('is-invalid');

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const channel = form.elements.channel.value;
  const order = {
    ref: makeRef(store),
    type: 'order',
    store,
    channel,
    createdAt: new Date().toISOString(),
    customer: { name: form.elements.customer.value.trim() || null, phone },
    items: lines.map((l) => ({ id: l.id, name: l.name, unit: l.detail, ...(l.option && { option: l.option }), price: l.price, cost: l.cost, qty: l.qty })),
    subtotal: total,
    deliveryFee: 0,
    total,
    fulfilment: channel === 'walk-in' ? 'in-store' : 'pickup',
    ...(neededBy && { neededBy, timeSlot: form.elements.timeSlot.value }),
    payment: { method: form.elements.method.value, status: neededBy ? form.elements.payStatus.value : 'paid' },
    status: neededBy ? 'confirmed' : 'completed',
    recorded: true,
  };
  try {
    await recordSale(order);
  } catch (err) {
    toast(err.message, 'danger');
    return;
  }
  if (!neededBy) todaySoFar = { count: todaySoFar.count + 1, total: todaySoFar.total + total };
  shop.orders.unshift(order);
  setBadges(shop.orders);
  toast(`Saved ${order.ref} · ${money(total)}${neededBy ? ' · on the production list' : ''}`);
  sale.clear();
  form.reset();
  form.querySelector('[data-regular]').hidden = true;
  form.querySelector('[data-pay-status]').hidden = true;
  renderTodayLine();
  renderTiles();
  renderSale();
});

// ---- rendering ------------------------------------------------------------------------
function renderTodayLine() {
  $q('[data-today-line]').innerHTML = todaySoFar.count
    ? `Today so far: <strong>${money(todaySoFar.total)}</strong> from ${todaySoFar.count} completed ${todaySoFar.count === 1 ? 'sale' : 'sales'}.`
    : 'Tap what was sold, then save. Cash and walk-in are already selected.';
}

function renderCats() {
  const filters = [{ id: 'all', label: 'All', test: () => true }, ...CATEGORIES[store].map((c) => ({ id: c.id, label: c.name, test: (t) => t.category === c.id }))];
  renderPills($q('[data-cats]'), filters, category, TILES[store]);
}

function tileImage(t) {
  if (!t.image) return '<span class="ph"><i class="bi bi-image"></i></span>';
  return t.image.startsWith('idb:')
    ? `<img data-idb-src="${escapeHtml(t.image.slice(4))}" alt="">`
    : `<img src="${siteUrl(t.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
}

function renderTiles() {
  const shown = TILES[store].filter((t) => (category === 'all' || t.category === category) && (!query || `${t.name} ${t.detail}`.toLowerCase().includes(query)));
  $q('[data-tiles]').innerHTML = shown.length ? shown.map((t) => {
    const qty = sale.get(t.key) ?? 0;
    return `
      <button type="button" class="pos-tile${qty ? ' picked' : ''}" data-key="${escapeHtml(t.key)}" ${t.sellable ? '' : 'disabled'}
        aria-label="Add ${escapeHtml(t.name)} (${escapeHtml(t.detail)}), ${money(t.price)}${qty ? `, ${qty} in this sale` : ''}">
        ${tileImage(t)}
        ${qty ? `<span class="qty-badge">${qty}</span>` : ''}
        <span class="body">
          <span class="name">${escapeHtml(t.name)}</span>
          <span class="detail">${escapeHtml(t.detail)}${t.sellable ? '' : ' · out of stock'}</span>
          <span class="price">${money(t.price)}</span>
        </span>
      </button>`;
  }).join('') : '<p class="text-muted">No products match.</p>';
  hydrateImages($q('[data-tiles]'));
}

function saleLines() {
  return [...sale].map(([key, qty]) => ({ ...TILES[store].find((t) => t.key === key), qty }));
}

function renderSale() {
  const lines = saleLines();
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  $q('[data-empty]').hidden = lines.length > 0;
  $q('[data-clear]').hidden = !lines.length;
  $q('[data-total-row]').hidden = !lines.length;
  $q('[data-total]').textContent = money(total);
  form.querySelector('[data-save]').disabled = !lines.length;
  $q('[data-lines]').innerHTML = lines.map((l) => `
    <div class="sale-line" data-line="${escapeHtml(l.key)}">
      <div><div class="fw-semibold">${escapeHtml(l.name)}</div><div class="cell-sub">${escapeHtml(l.detail)} · ${money(l.price)} each</div></div>
      <div class="fw-bold text-end">${money(l.price * l.qty)}</div>
      <div class="btn-group btn-group-sm" role="group" aria-label="Quantity of ${escapeHtml(l.name)}">
        <button type="button" class="btn btn-outline-primary" data-dec aria-label="One fewer"><i class="bi bi-dash-lg"></i></button>
        <span class="btn btn-outline-primary disabled fw-bold" aria-live="polite">${l.qty}</span>
        <button type="button" class="btn btn-outline-primary" data-inc aria-label="One more"><i class="bi bi-plus-lg"></i></button>
      </div>
      <button type="button" class="btn btn-link btn-sm text-danger text-end p-0" data-remove>Remove</button>
    </div>`).join('');
  renderBar();
}

function renderBar() {
  const lines = saleLines();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const bar = $q('[data-sale-bar]');
  bar.hidden = !count;
  document.body.classList.toggle('has-sale-bar', count > 0);
  if (!count) return;
  $q('[data-bar-total]').textContent = `${count} ${count === 1 ? 'item' : 'items'} · ${money(lines.reduce((s, l) => s + l.price * l.qty, 0))}`;
  const pre = store === 'bake' && form.elements.neededBy.value ? ' · pre-order' : '';
  $q('[data-bar-meta]').textContent = `${PAYMENT_METHOD[form.elements.method.value]} · ${CHANNEL[form.elements.channel.value]}${pre}`;
}

function phoneKey(value) {
  return normalisePhone(value) ?? String(value ?? '').replace(/\D/g, '');
}
