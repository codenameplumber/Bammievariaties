// Bake & Cook: this week's batch (order-by cutoff, ready date, add straight to
// the pre-order) and the full menu, where each item opens its own page.
import { initPage, money, icon, escapeHtml, productThumb, whatsappUrl } from '../ui.js';
import { getCatalogue } from '../api.js';
import { getQty, addQty } from '../cart.js';
import { isBatchOpen, noticeText } from '../lines.js';
import { initCartBar } from '../cart-bar.js';
import { todayISO, toISODate, daysBetween, formatDay, formatDateTime } from '../dates.js';

const STORE = 'bake';

const els = {
  batch: document.querySelector('[data-batch]'),
  nav: document.querySelector('[data-menu-nav]'),
  menu: document.querySelector('[data-menu]'),
};

initPage();
main();

async function main() {
  let data;
  try {
    data = await getCatalogue(STORE);
  } catch {
    els.menu.innerHTML = `
      <div class="empty">
        ${icon('cupcake')}
        <h2>The menu didn't load</h2>
        <p>Check your connection and try again, or send your pre-order on WhatsApp.</p>
        <a class="btn btn--whatsapp" href="${whatsappUrl("Hello Bammie! I'd like to pre-order from Bake and Cook. I need it on:")}" target="_blank" rel="noopener">${icon('whatsapp')}Pre-order on WhatsApp</a>
      </div>`;
    return;
  }

  const byId = new Map(data.products.map((p) => [p.id, p]));
  const icons = new Map(data.categories.map((c) => [c.id, c.icon]));
  const batch = data.batch;

  renderBatch();
  renderMenu();
  initCartBar(STORE, data, 'Pick a date next');

  if (location.hash === '#batch') document.getElementById('batch')?.scrollIntoView();

  els.batch.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    const row = e.target.closest('.batch-row');
    if (!button || !row) return;
    const variant = { option: row.dataset.option, batch: batch.id };
    if (button.matches('[data-add], [data-inc]')) addQty(STORE, row.dataset.id, 1, variant);
    else if (button.matches('[data-dec]')) addQty(STORE, row.dataset.id, -1, variant);
    else return;
    const hadFocus = document.activeElement === button;
    row.querySelector('[data-actions]').innerHTML = batchActions(row.dataset.id, row.dataset.option, Number(row.dataset.limit));
    if (hadFocus) {
      const qty = getQty(STORE, row.dataset.id, variant);
      (qty === 0 ? row.querySelector('[data-add]') : row.querySelector(button.matches('[data-dec]') ? '[data-dec]' : '[data-inc]'))?.focus();
    }
  });

  window.addEventListener('storage', (e) => {
    if (e.key === `bammie.cart.${STORE}`) renderBatch();
  });

  function renderBatch() {
    // A batch whose ready day has passed is stale: hide it until the next one is posted.
    if (!batch || batch.readyOn < todayISO()) {
      els.batch.hidden = true;
      return;
    }
    const open = isBatchOpen(batch);
    const daysLeft = daysBetween(todayISO(), toISODate(new Date(batch.orderBy)));
    const countdown = daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? 'Closes tomorrow' : 'Closes today';

    const rows = batch.items
      .map((item) => ({ item, product: byId.get(item.itemId) }))
      .map(({ item, product }) => ({ item, product, option: product?.options.find((o) => o.id === item.option) }))
      .filter(({ product, option }) => product?.available && option);

    els.batch.hidden = false;
    els.batch.innerHTML = `
      <section class="batch" id="batch" aria-labelledby="batch-title">
        <div class="batch__head">
          <span class="tag${open ? '' : ' tag--muted'}">${open ? "This week's batch" : 'Orders closed'}</span>
          <h2 id="batch-title">${escapeHtml(batch.title)}</h2>
          <p>${escapeHtml(batch.blurb)}</p>
          <ul class="batch__facts" role="list">
            <li>${icon('clock')}Order by ${formatDateTime(batch.orderBy)}</li>
            <li>${icon('calendar')}Ready ${formatDay(batch.readyOn)}</li>
            ${open ? `<li><strong>${countdown}</strong></li>` : ''}
          </ul>
        </div>
        ${open ? `
          <div class="batch__items">
            ${rows.map(({ item, product, option }) => `
              <div class="batch-row" data-id="${escapeHtml(product.id)}" data-option="${escapeHtml(option.id)}" data-limit="${item.limit}">
                ${productThumb(product, icons.get(product.category))}
                <div>
                  <p class="batch-row__name">${escapeHtml(product.name)}</p>
                  <p class="batch-row__detail">${escapeHtml(option.label)} · Limited to ${item.limit} in this batch</p>
                  <p class="batch-row__price">${money(option.price)}</p>
                </div>
                <div class="batch-row__actions" data-actions>${batchActions(product.id, option.id, item.limit)}</div>
              </div>`).join('')}
          </div>` : `
          <div class="batch__closed">
            <p>Orders for this batch have closed. Watch Bammie's WhatsApp status for the next one, or order from the menu below for another day.</p>
            <a class="btn btn--gold" href="${whatsappUrl("Hello Bammie! When is your next batch?")}" target="_blank" rel="noopener">${icon('whatsapp')}Ask about the next batch</a>
          </div>`}
      </section>`;
  }

  function batchActions(id, option, limit) {
    const qty = getQty(STORE, id, { option, batch: batch.id });
    const product = byId.get(id);
    const label = `${product.name} (${product.options.find((o) => o.id === option)?.label})`;
    if (qty === 0) {
      return `<button type="button" class="btn btn--brand btn--sm btn--block" data-add aria-label="Add ${escapeHtml(label)} from this week's batch">${icon('plus')}Add</button>`;
    }
    return `
      <div class="qty" role="group" aria-label="Quantity of ${escapeHtml(label)}">
        <button type="button" data-dec aria-label="Remove one">${icon('minus')}</button>
        <output aria-live="polite">${qty}</output>
        <button type="button" data-inc aria-label="Add one more" ${qty >= limit ? 'disabled' : ''}>${icon('plus')}</button>
      </div>`;
  }

  function renderMenu() {
    const groups = data.categories
      .map((c) => ({ cat: c, items: data.products.filter((p) => p.category === c.id) }))
      .filter((g) => g.items.length);

    els.nav.innerHTML = groups
      .map(({ cat }) => `<a class="chip" href="#cat-${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</a>`)
      .join('');

    els.menu.innerHTML = groups.map(({ cat, items }) => `
      <section class="catalogue-group" id="cat-${escapeHtml(cat.id)}" aria-labelledby="cat-${escapeHtml(cat.id)}-title">
        <div class="catalogue-group__head">
          <h2 id="cat-${escapeHtml(cat.id)}-title">${escapeHtml(cat.name)}</h2>
          <p>${escapeHtml(cat.blurb)}</p>
        </div>
        <div class="product-grid">${items.map(menuCard).join('')}</div>
      </section>`).join('');
  }

  function menuCard(p) {
    const prices = p.options.map((o) => o.price);
    const from = Math.min(...prices);
    const href = `item.html?id=${encodeURIComponent(p.id)}`;
    const meta = [noticeText(p.leadTimeDays), p.minQty > 1 ? `min. ${p.minQty}` : null].filter(Boolean).join(' · ');
    return `
      <article class="product${p.available ? '' : ' is-out'}">
        ${productThumb(p, icons.get(p.category))}
        <div class="product__body">
          <h3 class="product__name"><a href="${href}" class="product__link">${escapeHtml(p.name)}</a></h3>
          <p class="product__unit">${p.options.length > 1 ? `${p.options.length} options` : escapeHtml(p.options[0].label)}</p>
          <p class="product__price">${prices.length > 1 ? '<span class="muted">from</span> ' : ''}${money(from)}</p>
          <p class="product__meta">${icon('clock')}${escapeHtml(meta)}</p>
        </div>
        <div class="product__actions">
          ${p.available
            ? `<a class="btn btn--brand btn--sm btn--block" href="${href}" aria-label="Choose ${escapeHtml(p.name)}">Choose</a>`
            : `<button type="button" class="btn btn--muted btn--sm btn--block" disabled>Not available</button>`}
        </div>
      </article>`;
  }
}
