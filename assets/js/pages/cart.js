// Cart page for either store; the store comes from <body data-store>.
import { initPage, money, icon, escapeHtml, productThumb, whatsappUrl } from '../ui.js';
import { getCatalogue } from '../api.js';
import { getLines, addQty, setQty } from '../cart.js';
import { resolveLines, noticeText } from '../lines.js';
import { formatDay } from '../dates.js';

const STORE = document.body.dataset.store;
const root = document.querySelector('[data-cart]');

const COPY = {
  varieties: {
    empty: "Add foodstuffs, provisions, stationery or Bammie Chips, and they'll show up here.",
    browse: 'Browse the store',
    browseIcon: 'basket',
    note: 'No delivery fee if you pick up or send your own rider.',
    checkout: 'Checkout',
  },
  bake: {
    empty: "Choose treats from this week's batch or the menu, and they'll show up here.",
    browse: 'See the menu',
    browseIcon: 'cupcake',
    note: "You'll choose the day you need it at checkout. Bammie confirms the price, delivery fee and any deposit on WhatsApp.",
    checkout: 'Choose your date',
  },
}[STORE];

initPage();
main();

async function main() {
  let data;
  try {
    data = await getCatalogue(STORE);
  } catch {
    root.innerHTML = `
      <div class="empty">
        ${icon('cart')}
        <h2>Your cart didn't load</h2>
        <p>Check your connection and refresh the page. Your items are still saved on this phone.</p>
      </div>`;
    return;
  }

  // Items Bammie no longer sells can never be ordered, so drop them (and say so).
  // Out-of-stock items and closed-batch items stay, with a note.
  const discontinued = resolveLines(STORE, getLines(STORE), data).filter((r) => !r.known);
  discontinued.forEach((r) => setQty(STORE, r.line.id, 0, r.line));
  let removedNotice = discontinued.length
    ? `${discontinued.length === 1 ? 'An item' : `${discontinued.length} items`} in your cart ${discontinued.length === 1 ? 'is' : 'are'} no longer sold, so we took ${discontinued.length === 1 ? 'it' : 'them'} out.`
    : '';

  render();

  root.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    const el = e.target.closest('.cart-line');
    if (!button || !el) return;
    const variant = { option: el.dataset.option || undefined, batch: el.dataset.batch || undefined };
    const index = [...root.querySelectorAll('.cart-line')].indexOf(el);
    let focus = null;

    if (button.matches('[data-inc]')) {
      addQty(STORE, el.dataset.id, 1, variant);
      focus = '[data-inc]';
    } else if (button.matches('[data-dec]')) {
      focus = addQty(STORE, el.dataset.id, -1, variant) ? '[data-dec]' : null;
    } else if (button.matches('[data-remove]')) {
      setQty(STORE, el.dataset.id, 0, variant);
    } else {
      return;
    }
    removedNotice = '';
    render();
    const line = root.querySelectorAll('.cart-line')[index];
    ((focus && line?.querySelector(`${focus}:not(:disabled)`)) || line?.querySelector('button') || root.querySelector('.empty a'))?.focus();
  });

  window.addEventListener('storage', (e) => {
    if (e.key === `bammie.cart.${STORE}`) render();
  });

  function render() {
    const rows = resolveLines(STORE, getLines(STORE), data).filter((r) => r.known);

    if (!rows.length) {
      root.innerHTML = `
        <div class="empty">
          ${icon('cart')}
          <h2>${STORE === 'bake' ? 'Your pre-order is empty' : 'Your cart is empty'}</h2>
          <p>${COPY.empty}</p>
          <a class="btn btn--brand" href="./">${icon(COPY.browseIcon)}${COPY.browse}</a>
        </div>`;
      return;
    }

    const available = rows.filter((r) => r.available);
    const count = available.reduce((n, r) => n + r.qty, 0);
    const subtotal = available.reduce((sum, r) => sum + r.total, 0);
    const unavailableCount = rows.length - available.length;

    root.innerHTML = `
      <section class="card cart-lines" aria-label="Items">
        ${removedNotice ? `<div class="notice card__after" role="status">${icon('info')}<span>${removedNotice}</span></div>` : ''}
        ${rows.map(lineHtml).join('')}
      </section>
      <aside class="split-layout__aside">
        <div class="card summary" aria-labelledby="summary-title">
          <h2 id="summary-title">Order summary</h2>
          <div class="summary__row"><span>Items</span><span>${count}${unavailableCount ? ` <span class="muted">(+${unavailableCount} unavailable)</span>` : ''}</span></div>
          <div class="summary__row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          <div class="summary__row"><span>Delivery</span><span class="muted">Confirmed on WhatsApp</span></div>
          <div class="summary__row summary__row--total"><span>Total so far</span><span>${money(subtotal)}</span></div>
          <p class="summary__note">${COPY.note}</p>
          <div class="summary__actions">
            ${count
              ? `<a class="btn btn--brand btn--lg btn--block" href="checkout.html">${COPY.checkout} ${icon('arrow-right')}</a>`
              : `<button type="button" class="btn btn--brand btn--lg btn--block" disabled>${COPY.checkout}</button>`}
            <a class="btn btn--outline btn--block" href="./">Keep shopping</a>
          </div>
        </div>
      </aside>`;
  }

  function lineHtml(r) {
    const attrs = `data-id="${escapeHtml(r.line.id)}"${r.line.option ? ` data-option="${escapeHtml(r.line.option)}"` : ''}${r.line.batch ? ` data-batch="${escapeHtml(r.line.batch)}"` : ''}`;
    const label = `${r.name} (${r.detail})`;

    if (!r.available) {
      const fix = STORE === 'bake' && r.line.batch && r.product?.available
        ? `<a class="link-btn" href="item.html?id=${encodeURIComponent(r.line.id)}&option=${encodeURIComponent(r.line.option)}">${icon('calendar')}Order it for another day</a>`
        : `<a class="link-btn" href="${whatsappUrl(`Hello Bammie! When will ${label} be available again?`)}" target="_blank" rel="noopener">${icon('whatsapp')}Ask when it's back</a>`;
      return `
        <div class="cart-line is-unavailable" ${attrs}>
          ${productThumb(r.product, r.icon)}
          <div>
            <p class="cart-line__name">${escapeHtml(label)}</p>
            <p class="cart-line__problem">${escapeHtml(r.problem)}. It won't be included in your order.</p>
            <div class="cart-line__bottom">
              ${fix}
              <button type="button" class="link-btn cart-line__remove" data-remove aria-label="Remove ${escapeHtml(label)}">${icon('trash')}Remove</button>
            </div>
          </div>
        </div>`;
    }

    const when = STORE !== 'bake' ? ''
      : r.readyOn ? `<p class="cart-line__unit">${icon('calendar')} ${escapeHtml(r.batchTitle)}, ready ${formatDay(r.readyOn)}</p>`
        : `<p class="cart-line__unit">${icon('clock')} ${noticeText(r.leadTimeDays)}</p>`;

    return `
      <div class="cart-line" ${attrs}>
        ${productThumb(r.product, r.icon)}
        <div>
          <div class="cart-line__top">
            <div>
              <p class="cart-line__name">${escapeHtml(r.name)}</p>
              <p class="cart-line__unit">${escapeHtml(r.detail)} · ${money(r.price)} each</p>
              ${when}
            </div>
            <p class="cart-line__price">${money(r.total)}</p>
          </div>
          <div class="cart-line__bottom">
            <div class="qty" role="group" aria-label="Quantity of ${escapeHtml(label)}">
              <button type="button" data-dec aria-label="Remove one" ${r.qty <= r.minQty && r.minQty > 1 ? 'disabled' : ''}>${icon('minus')}</button>
              <output aria-live="polite">${r.qty}</output>
              <button type="button" data-inc aria-label="Add one more" ${r.qty >= r.maxQty ? 'disabled' : ''}>${icon('plus')}</button>
            </div>
            <button type="button" class="link-btn cart-line__remove" data-remove aria-label="Remove ${escapeHtml(label)}">${icon('trash')}Remove</button>
          </div>
        </div>
      </div>`;
  }
}
