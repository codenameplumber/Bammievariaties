// Bake & Cook item page (item.html?id=…): pick a pack/size, a quantity, and add
// it to the pre-order. The date is chosen once for the whole pre-order at checkout.
import { initPage, money, icon, escapeHtml, productThumb, siteUrl, toast, copyText, whatsappUrl } from '../ui.js';
import { getCatalogue } from '../api.js';
import { addQty, MAX_QTY } from '../cart.js';
import { isBatchOpen, noticeText } from '../lines.js';
import { initCartBar } from '../cart-bar.js';
import { todayISO, addDays, formatDay } from '../dates.js';

const STORE = 'bake';
const root = document.querySelector('[data-item]');

initPage();
main();

async function main() {
  let data;
  try {
    data = await getCatalogue(STORE);
  } catch {
    renderMissing("This page didn't load", 'Check your connection and try again.');
    return;
  }

  const params = new URLSearchParams(location.search);
  const product = data.products.find((p) => p.id === params.get('id'));
  if (!product) {
    renderMissing("We can't find that item", "It may have come off the menu. Have a look at what's on it now.");
    return;
  }

  initCartBar(STORE, data, 'Pick a date next');
  document.title = `${product.name} | Bammie Bake and Cook`;

  const category = data.categories.find((c) => c.id === product.category);
  const minQty = product.minQty ?? 1;
  const earliest = addDays(todayISO(), product.leadTimeDays ?? 0);
  const inBatch = isBatchOpen(data.batch) && data.batch.items.some((i) => i.itemId === product.id);
  let optionId = product.options.some((o) => o.id === params.get('option')) ? params.get('option') : product.options[0].id;
  let qty = minQty;

  root.innerHTML = `
    <div class="item-media">${productThumb(product, category?.icon)}</div>
    <div class="item-info">
      <p class="eyebrow">${escapeHtml(category?.name ?? 'Bake & Cook')}</p>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="lead">${escapeHtml(product.blurb ?? '')}</p>
      <ul class="item-facts" role="list">
        <li>${icon('clock')}<span>${noticeText(product.leadTimeDays)}. Order today for <strong>${formatDay(earliest)}</strong> or later.</span></li>
        ${minQty > 1 ? `<li>${icon('info')}<span>Minimum order: ${minQty}.</span></li>` : ''}
        ${product.messageAllowed ? `<li>${icon('cake')}<span>You can add a message for the cake at checkout.</span></li>` : ''}
      </ul>
      ${inBatch ? `
        <div class="notice notice--soft">${icon('calendar')}<span>Also in this week's batch, ready ${formatDay(data.batch.readyOn)}. <a href="./#batch">Order it from the batch</a>.</span></div>` : ''}

      ${product.available ? `
        <form class="item-form" data-form>
          <fieldset class="field">
            <legend class="field__label">${product.options.length > 1 ? 'Choose one' : 'Size'}</legend>
            <div class="choices">
              ${product.options.map((o) => `
                <label class="choice choice--compact">
                  <input type="radio" name="option" value="${escapeHtml(o.id)}" ${o.id === optionId ? 'checked' : ''}>
                  <span class="choice__tick choice__tick--round">${icon('check')}</span>
                  <span class="choice__title">${escapeHtml(o.label)}</span>
                  <span class="choice__price">${money(o.price)}</span>
                </label>`).join('')}
            </div>
          </fieldset>
          <div class="field">
            <span class="field__label" id="qty-label">Quantity</span>
            <div class="qty" role="group" aria-labelledby="qty-label">
              <button type="button" data-dec aria-label="One fewer">${icon('minus')}</button>
              <output aria-live="polite" data-qty>${qty}</output>
              <button type="button" data-inc aria-label="One more">${icon('plus')}</button>
            </div>
          </div>
          <p class="item-total"><span>Total</span><strong data-total></strong></p>
          <button type="submit" class="btn btn--brand btn--lg btn--block" data-submit>${icon('plus')}Add to pre-order</button>
        </form>` : `
        <div class="notice">${icon('info')}<span>${escapeHtml(product.name)} isn't available right now.</span></div>
        <a class="btn btn--whatsapp" href="${whatsappUrl(`Hello Bammie! When will ${product.name} be available again?`)}" target="_blank" rel="noopener">${icon('whatsapp')}Ask when it's back</a>`}

      <div><button type="button" class="link-btn" data-share>${icon('share')}Share this item</button></div>
    </div>`;

  root.querySelector('[data-share]').addEventListener('click', () => shareItem(product));

  const form = root.querySelector('[data-form]');
  if (!form) return;

  const update = () => {
    const option = product.options.find((o) => o.id === optionId);
    form.querySelector('[data-qty]').textContent = qty;
    form.querySelector('[data-total]').textContent = money(option.price * qty);
    form.querySelector('[data-dec]').disabled = qty <= minQty;
    form.querySelector('[data-inc]').disabled = qty >= MAX_QTY;
  };
  update();

  form.addEventListener('change', (e) => {
    if (e.target.name === 'option') {
      optionId = e.target.value;
      update();
    }
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-dec]')) qty = Math.max(minQty, qty - 1);
    else if (e.target.closest('[data-inc]')) qty = Math.min(MAX_QTY, qty + 1);
    else return;
    update();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const option = product.options.find((o) => o.id === optionId);
    addQty(STORE, product.id, qty, { option: optionId });
    toast(`Added ${qty} × ${product.name} (${option.label}) to your pre-order.`);
    qty = minQty;
    update();
  });
}

function renderMissing(title, text) {
  root.innerHTML = `
    <div class="empty">
      ${icon('cupcake')}
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(text)}</p>
      <a class="btn btn--brand" href="./">${icon('arrow-left')}Back to the menu</a>
    </div>`;
}

async function shareItem(p) {
  const url = siteUrl(`bake/item.html?id=${encodeURIComponent(p.id)}`);
  const text = `${p.name} from Bammie Bake and Cook. Pre-order it for your day.`;
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
