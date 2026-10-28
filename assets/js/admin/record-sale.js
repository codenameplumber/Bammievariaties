// Record a sale: phone-first. Tap products, check the total, save. Cash and
// walk-in are preselected, so a common shop sale is two taps (product, Save).
// A Bake & Cook sale with a "needed on" date is a pre-order and goes on the
// production list. Optional phone number links the sale to a customer.
import { BAKE } from '../config.js';
import { money, icon, escapeHtml, toast } from '../ui.js';
import { getCatalogue, getAdminOrders, recordSale } from '../api.js';
import { normalisePhone } from '../customer.js';
import { makeRef } from '../orders.js';
import { todayISO } from '../dates.js';
import { MAX_QTY } from '../cart.js';
import { sales, between, totals, CHANNELS } from './stats.js';
import { initAdmin, PAYMENT_LABEL } from './admin-ui.js';

initAdmin();

const $ = (sel) => document.querySelector(sel);
const form = $('[data-form]');
const today = todayISO();

const [varieties, bake, orders] = await Promise.all([getCatalogue('varieties'), getCatalogue('bake'), getAdminOrders()]);

// What can be tapped, per store. Bake items are one tile per pack/size.
const TILES = {
  varieties: varieties.products.map((p) => ({ key: p.id, id: p.id, name: p.name, detail: p.unit, price: p.price, category: p.category, minQty: 1, sellable: p.inStock })),
  bake: bake.products.flatMap((p) => p.options.map((o) => ({ key: `${p.id}:${o.id}`, id: p.id, option: o.id, name: p.name, detail: o.label, price: o.price, category: p.category, minQty: p.minQty ?? 1, sellable: p.available }))),
};
const CATEGORIES = { varieties: varieties.categories, bake: bake.categories };

// Known customers, for the "regular customer" hint.
const customers = new Map();
for (const o of sales(orders)) {
  const phone = o.customer?.phone;
  if (!phone) continue;
  const c = customers.get(digits(phone)) ?? { phone, name: o.customer.name, count: 0, total: 0 };
  c.count += 1;
  c.total += o.total;
  customers.set(digits(phone), c);
}
let todaySoFar = totals(between(sales(orders), today, today));

let store = 'varieties';
let category = 'all';
let query = '';
const sale = new Map(); // key → qty

form.querySelector('[data-slots]').innerHTML = Object.entries(BAKE.timeSlots).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
form.elements.neededBy.min = today;

renderTodayLine();
renderChips();
renderTiles();
renderSale();

// ---- events ----------------------------------------------------------------------
document.querySelector('[role="radiogroup"][aria-label="Store"]').addEventListener('change', (e) => {
  if (sale.size && !confirm('Start a new sale for the other store? The items in this sale will be cleared.')) {
    e.target.checked = false;
    document.querySelector(`input[name="store"][value="${store}"]`).checked = true;
    return;
  }
  store = e.target.value;
  category = 'all';
  sale.clear();
  form.querySelector('[data-bake-only]').hidden = store !== 'bake';
  renderChips();
  renderTiles();
  renderSale();
});

$('[data-search]').addEventListener('input', (e) => {
  query = e.target.value.trim().toLowerCase();
  renderTiles();
});

$('[data-chips]').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-cat]');
  if (!chip) return;
  category = chip.dataset.cat;
  renderChips();
  renderTiles();
});

$('[data-tiles]').addEventListener('click', (e) => {
  const tile = e.target.closest('[data-key]');
  if (!tile) return;
  const t = TILES[store].find((x) => x.key === tile.dataset.key);
  sale.set(t.key, Math.min(MAX_QTY, (sale.get(t.key) ?? 0) + (sale.has(t.key) ? 1 : t.minQty)));
  renderTiles();
  renderSale();
});

$('[data-lines]').addEventListener('click', (e) => {
  const line = e.target.closest('[data-key]');
  if (!line) return;
  const t = TILES[store].find((x) => x.key === line.dataset.key);
  const qty = sale.get(t.key);
  if (e.target.closest('[data-inc]')) {
    sale.set(t.key, Math.min(MAX_QTY, qty + 1));
  } else if (e.target.closest('[data-dec]')) {
    if (qty - 1 < t.minQty) sale.delete(t.key);
    else sale.set(t.key, qty - 1);
  } else if (e.target.closest('[data-remove]')) {
    sale.delete(t.key);
  } else {
    return;
  }
  renderTiles();
  renderSale();
});

$('[data-clear]').addEventListener('click', () => {
  sale.clear();
  renderTiles();
  renderSale();
});

form.addEventListener('change', (e) => {
  if (e.target.name === 'neededBy') form.querySelector('[data-pay-status]').hidden = !e.target.value;
  renderBar();
});

form.elements.phone.addEventListener('input', () => {
  const match = customers.get(digits(form.elements.phone.value));
  const hint = form.querySelector('[data-regular]');
  hint.hidden = !match;
  if (match) {
    hint.innerHTML = `${icon('users')}<span>Regular customer: <strong>${escapeHtml(match.name)}</strong> · ${match.count} orders · ${money(match.total)} spent</span>`;
    if (!form.elements.customer.value) form.elements.customer.value = match.name;
  }
  hideError('phone');
});

$('[data-bar-save]').addEventListener('click', () => form.requestSubmit());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const lines = saleLines();
  if (!lines.length) return;

  const phoneRaw = form.elements.phone.value.trim();
  const known = customers.get(digits(phoneRaw));
  const phone = phoneRaw ? known?.phone ?? normalisePhone(phoneRaw) : null;
  if (phoneRaw && !phone) {
    showError('phone', 'Enter a Nigerian number, e.g. 0803 123 4567, or leave it empty.');
    return;
  }
  const neededBy = store === 'bake' ? form.elements.neededBy.value : '';
  if (neededBy && neededBy < today) {
    showError('neededBy', "Pick today or a later date (or leave it empty if they've taken it).");
    return;
  }

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const channel = form.elements.channel.value;
  const order = {
    ref: makeRef(store),
    type: 'order',
    store,
    channel,
    createdAt: new Date().toISOString(),
    customer: { name: form.elements.customer.value.trim() || null, phone },
    items: lines.map((l) => ({ id: l.id, name: l.name, unit: l.detail, ...(l.option && { option: l.option }), price: l.price, qty: l.qty })),
    subtotal: total,
    deliveryFee: 0,
    total,
    fulfilment: channel === 'walk-in' ? 'in-store' : 'pickup',
    ...(neededBy && { neededBy, timeSlot: form.elements.timeSlot.value }),
    payment: { method: form.elements.method.value, status: neededBy ? form.elements.payStatus.value : 'paid' },
    status: neededBy ? 'confirmed' : 'completed',
    recorded: true,
  };

  await recordSale(order);
  todaySoFar = { count: todaySoFar.count + 1, total: todaySoFar.total + total };
  toast(`Saved ${order.ref} · ${money(total)}${neededBy ? ' · added to the production list' : ''}`);

  sale.clear();
  form.reset();
  form.querySelector('[data-regular]').hidden = true;
  form.querySelector('[data-pay-status]').hidden = true;
  renderTodayLine();
  renderTiles();
  renderSale();
});

// ---- rendering -------------------------------------------------------------------
function renderTodayLine() {
  $('[data-today-line]').innerHTML = todaySoFar.count
    ? `Today so far: <strong>${money(todaySoFar.total)}</strong> from ${todaySoFar.count} ${todaySoFar.count === 1 ? 'sale' : 'sales'}. <a href="./">See the dashboard</a>`
    : 'Tap what was sold, then save. Cash and walk-in are already selected.';
}

function renderChips() {
  $('[data-chips]').innerHTML = [{ id: 'all', name: 'All' }, ...CATEGORIES[store]]
    .map((c) => `<button type="button" class="chip" data-cat="${escapeHtml(c.id)}" aria-pressed="${c.id === category}">${escapeHtml(c.name)}</button>`)
    .join('');
}

function renderTiles() {
  const shown = TILES[store].filter((t) => (category === 'all' || t.category === category)
    && (!query || `${t.name} ${t.detail}`.toLowerCase().includes(query)));
  $('[data-tiles]').innerHTML = shown.length ? shown.map((t) => {
    const qty = sale.get(t.key) ?? 0;
    return `
      <button type="button" class="pos-tile${qty ? ' is-picked' : ''}" data-key="${escapeHtml(t.key)}" ${t.sellable ? '' : 'disabled'}
        aria-label="Add ${escapeHtml(t.name)} (${escapeHtml(t.detail)}), ${money(t.price)}${qty ? `, ${qty} in this sale` : ''}">
        <span class="pos-tile__name">${escapeHtml(t.name)}</span>
        <span class="pos-tile__detail">${escapeHtml(t.detail)}${t.sellable ? '' : ' · out of stock'}</span>
        <span class="pos-tile__price">${money(t.price)}</span>
        ${qty ? `<span class="count-badge">${qty}</span>` : ''}
      </button>`;
  }).join('') : '<p class="panel__note">No products match.</p>';
}

function saleLines() {
  return [...sale].map(([key, qty]) => ({ ...TILES[store].find((t) => t.key === key), qty }));
}

function renderSale() {
  const lines = saleLines();
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  $('[data-empty]').hidden = lines.length > 0;
  $('[data-clear]').hidden = !lines.length;
  $('[data-total-row]').hidden = !lines.length;
  $('[data-total]').textContent = money(total);
  form.querySelector('[data-save]').disabled = !lines.length;
  $('[data-lines]').innerHTML = lines.map((l) => `
    <li class="sale-line" data-key="${escapeHtml(l.key)}">
      <div>
        <p class="sale-line__name">${escapeHtml(l.name)}</p>
        <p class="sale-line__detail">${escapeHtml(l.detail)} · ${money(l.price)} each</p>
      </div>
      <p class="sale-line__total">${money(l.price * l.qty)}</p>
      <div class="qty" role="group" aria-label="Quantity of ${escapeHtml(l.name)} (${escapeHtml(l.detail)})">
        <button type="button" data-dec aria-label="One fewer">${icon('minus')}</button>
        <output aria-live="polite">${l.qty}</output>
        <button type="button" data-inc aria-label="One more" ${l.qty >= MAX_QTY ? 'disabled' : ''}>${icon('plus')}</button>
      </div>
      <button type="button" class="link-btn" data-remove aria-label="Remove ${escapeHtml(l.name)}">${icon('trash')}Remove</button>
    </li>`).join('');
  renderBar();
}

function renderBar() {
  const lines = saleLines();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const bar = $('[data-sale-bar]');
  bar.hidden = !count;
  document.body.classList.toggle('has-sale-bar', count > 0);
  if (!count) return;
  $('[data-bar-total]').textContent = `${count} ${count === 1 ? 'item' : 'items'} · ${money(lines.reduce((s, l) => s + l.price * l.qty, 0))}`;
  const pre = store === 'bake' && form.elements.neededBy.value ? ' · pre-order' : '';
  $('[data-bar-meta]').textContent = `${PAYMENT_LABEL[form.elements.method.value]} · ${CHANNELS[form.elements.channel.value]}${pre}`;
}

function showError(name, message) {
  const field = form.querySelector(`[data-field="${name}"]`);
  field.classList.add('is-invalid');
  const err = field.querySelector('.field__error');
  err.textContent = message;
  err.hidden = false;
  field.scrollIntoView({ block: 'center', behavior: 'smooth' });
  field.querySelector('input').focus({ preventScroll: true });
}

function hideError(name) {
  const field = form.querySelector(`[data-field="${name}"]`);
  field.classList.remove('is-invalid');
  field.querySelector('.field__error').hidden = true;
}

function digits(value) {
  const n = normalisePhone(value);
  return n ?? String(value ?? '').replace(/\D/g, '');
}
