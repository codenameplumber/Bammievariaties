// Varieties Store catalogue: category chips, search, add-to-cart steppers,
// share links (?item=<id>) and the sticky cart bar.
import { initPage, money, icon, escapeHtml, productThumb, siteUrl, toast, copyText, whatsappUrl } from '../ui.js';
import { getCatalogue } from '../api.js';
import { getQty, addQty, MAX_QTY } from '../cart.js';
import { initCartBar } from '../cart-bar.js';

const STORE = 'varieties';

const els = {
  search: document.querySelector('[data-search]'),
  chips: document.querySelector('[data-chips]'),
  meta: document.querySelector('[data-meta]'),
  catalogue: document.querySelector('[data-catalogue]'),
};

initPage();
main();

async function main() {
  let data;
  try {
    data = await getCatalogue(STORE);
  } catch {
    els.catalogue.innerHTML = `
      <div class="empty">
        ${icon('basket')}
        <h2>The shop didn't load</h2>
        <p>Check your connection and try again, or send us your list on WhatsApp.</p>
        <a class="btn btn--whatsapp" href="${whatsappUrl("Hello Bammie! Here's my shopping list:")}" target="_blank" rel="noopener">${icon('whatsapp')}Send your list on WhatsApp</a>
      </div>`;
    return;
  }

  const categories = data.categories;
  const products = data.products;
  const byId = new Map(products.map((p) => [p.id, p]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const params = new URLSearchParams(location.search);
  let activeCat = catById.has(params.get('cat')) ? params.get('cat') : 'all';
  let query = '';

  renderChips();
  renderProducts();
  initCartBar(STORE, data, 'Ready when you are');
  highlightSharedItem(params.get('item'));

  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    activeCat = chip.dataset.cat;
    if (query) {
      query = '';
      els.search.value = '';
    }
    renderChips();
    renderProducts();
    syncUrl();
  });

  els.search.addEventListener('input', () => {
    query = els.search.value.trim();
    if (query && activeCat !== 'all') {
      activeCat = 'all'; // search covers the whole shop
      renderChips();
      syncUrl();
    }
    renderProducts();
  });

  els.catalogue.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    const card = e.target.closest('.product');
    if (!button || !card) return;
    const product = byId.get(card.dataset.id);
    if (!product) return;

    if (button.matches('[data-share]')) {
      shareProduct(product);
      return;
    }
    if (button.matches('[data-add]')) addQty(STORE, product.id, 1);
    else if (button.matches('[data-inc]')) addQty(STORE, product.id, 1);
    else if (button.matches('[data-dec]')) addQty(STORE, product.id, -1);
    else return;
    refreshCard(card, product, button);
  });

  window.addEventListener('storage', (e) => {
    if (e.key === `bammie.cart.${STORE}`) renderProducts();
  });

  // Keep ?cat= in the address bar so the page can be shared or refreshed as-is.
  function syncUrl() {
    const url = new URL(location.href);
    url.searchParams.delete('item');
    if (activeCat === 'all') url.searchParams.delete('cat');
    else url.searchParams.set('cat', activeCat);
    history.replaceState(null, '', url);
  }

  function renderChips() {
    els.chips.innerHTML = [{ id: 'all', name: 'All' }, ...categories]
      .map((c) => `<button type="button" class="chip" data-cat="${escapeHtml(c.id)}" aria-pressed="${c.id === activeCat}">${escapeHtml(c.name)}</button>`)
      .join('');
  }

  function matches(p) {
    if (!query) return true;
    const haystack = `${p.name} ${p.unit} ${catById.get(p.category)?.name ?? ''}`.toLowerCase();
    return query.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
  }

  function renderProducts() {
    const visible = products.filter((p) => (activeCat === 'all' || p.category === activeCat) && matches(p));

    els.meta.textContent = query
      ? `${visible.length} ${visible.length === 1 ? 'item' : 'items'} for “${query}”`
      : '';

    if (!visible.length) {
      els.catalogue.innerHTML = `
        <div class="empty">
          ${icon('search')}
          <h2>Nothing matches “${escapeHtml(query)}”</h2>
          <p>We may still have it in the shop. Ask us on WhatsApp and we'll check for you.</p>
          <a class="btn btn--whatsapp" href="${whatsappUrl(`Hello Bammie! Do you have ${query}?`)}" target="_blank" rel="noopener">${icon('whatsapp')}Ask on WhatsApp</a>
        </div>`;
      return;
    }

    const groups = activeCat === 'all' && !query
      ? categories.map((c) => ({ cat: c, items: visible.filter((p) => p.category === c.id) }))
      : [{ cat: activeCat === 'all' ? null : catById.get(activeCat), items: visible }];

    els.catalogue.innerHTML = groups
      .filter((g) => g.items.length)
      .map((g) => `
        <section class="catalogue-group" ${g.cat ? `aria-labelledby="cat-${escapeHtml(g.cat.id)}"` : ''}>
          ${g.cat ? `
            <div class="catalogue-group__head">
              <h2 id="cat-${escapeHtml(g.cat.id)}">${escapeHtml(g.cat.name)}</h2>
              <p>${escapeHtml(g.cat.blurb)}</p>
            </div>` : ''}
          <div class="product-grid">${g.items.map(card).join('')}</div>
        </section>`)
      .join('');
  }

  function card(p) {
    const iconName = catById.get(p.category)?.icon;
    return `
      <article class="product${p.inStock ? '' : ' is-out'}" id="p-${escapeHtml(p.id)}" data-id="${escapeHtml(p.id)}">
        ${productThumb(p, iconName)}
        <button type="button" class="icon-btn icon-btn--sm product__share" data-share aria-label="Share ${escapeHtml(p.name)}">${icon('share')}</button>
        <div class="product__body">
          <h3 class="product__name">${escapeHtml(p.name)}</h3>
          <p class="product__unit">${escapeHtml(p.unit)}</p>
          <p class="product__price">${money(p.price)}</p>
        </div>
        <div class="product__actions" data-actions>${actions(p)}</div>
      </article>`;
  }

  function actions(p) {
    const label = `${p.name} (${p.unit})`;
    if (!p.inStock) {
      return `<button type="button" class="btn btn--muted btn--sm btn--block" disabled>Out of stock</button>`;
    }
    const qty = getQty(STORE, p.id);
    if (qty === 0) {
      return `<button type="button" class="btn btn--brand btn--sm btn--block" data-add aria-label="Add ${escapeHtml(label)} to cart">${icon('plus')}Add</button>`;
    }
    return `
      <div class="qty" role="group" aria-label="Quantity of ${escapeHtml(label)}">
        <button type="button" data-dec aria-label="Remove one">${icon('minus')}</button>
        <output aria-live="polite">${qty}</output>
        <button type="button" data-inc aria-label="Add one more" ${qty >= MAX_QTY ? 'disabled' : ''}>${icon('plus')}</button>
      </div>`;
  }

  // Swap just this card's buttons, keeping keyboard focus on the matching control.
  function refreshCard(card, product, pressed) {
    const hadFocus = document.activeElement === pressed;
    card.querySelector('[data-actions]').innerHTML = actions(product);
    if (!hadFocus) return;
    const qty = getQty(STORE, product.id);
    const target = qty === 0
      ? card.querySelector('[data-add]')
      : card.querySelector(pressed.matches('[data-dec]') ? '[data-dec]' : '[data-inc]');
    target?.focus();
  }

  async function shareProduct(p) {
    const url = siteUrl(`varieties/?item=${encodeURIComponent(p.id)}`);
    const text = `${p.name} (${p.unit}): ${money(p.price)} at Bammie Varieties Store`;
    if (navigator.share) {
      try {
        await navigator.share({ title: p.name, text, url });
      } catch {
        // closed the share sheet
      }
      return;
    }
    toast(await copyText(`${text}\n${url}`) ? 'Link copied. Paste it in your status or a chat.' : "Couldn't copy the link on this device.");
  }

  function highlightSharedItem(id) {
    const el = id && byId.has(id) ? document.getElementById(`p-${id}`) : null;
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('is-highlighted');
    setTimeout(() => el.classList.remove('is-highlighted'), 4000);
  }
}
