import { initPage, icon, escapeHtml, money, productThumb, storeIsOpen, toast } from '../ui.js';
import { getCatalogue } from '../api.js';
import { addQty, getQty, MAX_QTY } from '../cart.js';
import { isBatchOpen, noticeText } from '../lines.js';
import { formatDay, formatDateTime } from '../dates.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Set by initReveal: starts the fade-up on cards drawn after load.
let watchReveal = () => {};

initPage();
initReveal();
whenSwiperLoads(initHeroSlider);
showVarieties();
showBake();

// ---------- Hero carousel ----------

// Swiper comes from a CDN as a classic deferred script; if it's slow or blocked
// the first slide still shows on its own.
function whenSwiperLoads(fn) {
  if (window.Swiper) fn();
  else window.addEventListener('load', () => window.Swiper && fn(), { once: true });
}

function initHeroSlider() {
  const el = document.querySelector('[data-hero]');
  if (!el) return;
  const pause = el.querySelector('[data-hero-pause]');

  const swiper = new window.Swiper(el, {
    loop: true,
    speed: reduceMotion ? 0 : 800,
    effect: reduceMotion ? 'slide' : 'fade',
    fadeEffect: { crossFade: true },
    grabCursor: true,
    keyboard: { enabled: true, onlyInViewport: true },
    autoplay: reduceMotion ? false : { delay: 6000, disableOnInteraction: false, pauseOnMouseEnter: true },
    pagination: { el: el.querySelector('[data-hero-dots]'), clickable: true },
    navigation: { prevEl: el.querySelector('[data-hero-prev]'), nextEl: el.querySelector('[data-hero-next]') },
    a11y: {
      prevSlideMessage: 'Previous slide',
      nextSlideMessage: 'Next slide',
      paginationBulletMessage: 'Go to slide {{index}}',
    },
  });
  el.classList.add('is-ready');

  // Moving content needs a way to stop it.
  if (!swiper.autoplay?.running) return;
  pause.hidden = false;
  pause.addEventListener('click', () => {
    const playing = swiper.autoplay.running && !swiper.autoplay.paused;
    if (playing) swiper.autoplay.stop();
    else swiper.autoplay.start();
    pause.setAttribute('aria-label', playing ? 'Play slideshow' : 'Pause slideshow');
    pause.innerHTML = icon(playing ? 'play' : 'pause');
  });
}

// ---------- Scroll reveal ----------

function initReveal() {
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('has-reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  watchReveal = (root) => root.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => observer.observe(el));
  watchReveal(document);
}

// ---------- Varieties: popular items and chip prices ----------

async function showVarieties() {
  let data;
  try {
    data = await getCatalogue('varieties');
  } catch {
    return; // the store cards above still link to the full shop
  }
  const icons = new Map(data.categories.map((c) => [c.id, c.icon]));
  const byId = new Map(data.products.map((p) => [p.id, p]));
  const open = storeIsOpen('varieties');

  showChipPrices(data.products);

  const picks = popularPicks(data.products, 8);
  if (!picks.length) return;
  const section = document.querySelector('[data-popular]');
  const grid = section.querySelector('[data-popular-grid]');
  grid.innerHTML = picks.map((p) => card(p)).join('');
  section.hidden = false;
  watchReveal(section);

  grid.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    const el = e.target.closest('.product');
    const product = el && byId.get(el.dataset.id);
    if (!button || !product) return;
    if (button.matches('[data-add]')) {
      addQty('varieties', product.id, 1);
      toast(`${product.name} added to your cart`);
    } else if (button.matches('[data-inc]')) addQty('varieties', product.id, 1);
    else if (button.matches('[data-dec]')) addQty('varieties', product.id, -1);
    else return;
    el.querySelector('[data-actions]').innerHTML = actions(product);
    el.querySelector(button.matches('[data-dec]') && getQty('varieties', product.id) ? '[data-dec]' : '[data-inc], [data-add]')?.focus();
  });

  function card(p) {
    return `
      <article class="product reveal" data-id="${escapeHtml(p.id)}">
        ${productThumb(p, icons.get(p.category))}
        <div class="product__body">
          <h3 class="product__name"><a class="product__link" href="varieties/?item=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a></h3>
          <p class="product__unit">${escapeHtml(p.unit)}</p>
          <p class="product__price">${money(p.price)}</p>
        </div>
        <div class="product__actions" data-actions>${actions(p)}</div>
      </article>`;
  }

  function actions(p) {
    if (!open) return `<a class="btn btn--outline btn--sm btn--block" href="varieties/?item=${encodeURIComponent(p.id)}">View</a>`;
    const qty = getQty('varieties', p.id);
    const label = `${p.name} (${p.unit})`;
    if (!qty) {
      return `<button type="button" class="btn btn--brand btn--sm btn--block" data-add aria-label="Add ${escapeHtml(label)} to cart">${icon('plus')}Add</button>`;
    }
    return `
      <div class="qty" role="group" aria-label="Quantity of ${escapeHtml(label)}">
        <button type="button" data-dec aria-label="Remove one">${icon('minus')}</button>
        <output aria-live="polite">${qty}</output>
        <button type="button" data-inc aria-label="Add one more" ${qty >= MAX_QTY ? 'disabled' : ''}>${icon('plus')}</button>
      </div>`;
  }
}

// Featured items first, then one from each shelf in turn, so the home page
// shows the range of the shop. Bammie Chips have their own band below.
function popularPicks(products, count) {
  const pool = products.filter((p) => p.inStock && p.category !== 'bammie-chips');
  return roundRobin(pool.filter((p) => p.featured), groupBy(pool, (p) => p.category), count);
}

// Fill `picks` up to `count` taking one from each group in turn, skipping a
// second size of something already picked ("Rice" next to "Long-grain Rice").
function roundRobin(picks, groups, count) {
  const names = picks.map((p) => p.name.toLowerCase());
  const isRepeat = (p) => {
    const name = p.name.toLowerCase();
    return names.some((n) => n.includes(name) || name.includes(n));
  };
  const queues = groups.map((g) => g.filter((p) => !picks.includes(p)));
  while (picks.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) {
      while (queue.length && isRepeat(queue[0])) queue.shift();
      if (picks.length >= count || !queue.length) continue;
      const p = queue.shift();
      picks.push(p);
      names.push(p.name.toLowerCase());
    }
  }
  return picks;
}

function groupBy(items, keyOf) {
  const groups = new Map();
  items.forEach((item) => groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]));
  return [...groups.values()];
}

// "From ₦500" under each chip tile, using the live prices
function showChipPrices(products) {
  document.querySelectorAll('[data-chip-tiles] .chip-tile').forEach((tile) => {
    const name = tile.querySelector('.chip-tile__name');
    const prices = products
      .filter((p) => p.category === 'bammie-chips' && p.inStock && p.name === name.textContent)
      .map((p) => p.price);
    if (!prices.length) return;
    name.insertAdjacentHTML('beforeend', `<span class="chip-tile__price">${prices.length > 1 ? 'from ' : ''}${money(Math.min(...prices))}</span>`);
  });
}

// ---------- Bake & Cook: menu picks and this week's batch ----------

async function showBake() {
  let data;
  try {
    data = await getCatalogue('bake');
  } catch {
    return;
  }
  showBatchTeaser(data.batch);

  const icons = new Map(data.categories.map((c) => [c.id, c.icon]));
  // One from each category in turn, so snacks, pastries, cakes and meals all show.
  const available = data.products.filter((p) => p.available);
  const picks = roundRobin([], data.categories.map((c) => available.filter((p) => p.category === c.id)), 8);
  if (!picks.length) return;

  const section = document.querySelector('[data-bake-picks]');
  section.querySelector('[data-bake-grid]').innerHTML = picks.map((p) => {
    const prices = p.options.map((o) => o.price);
    const href = `bake/item.html?id=${encodeURIComponent(p.id)}`;
    const meta = [noticeText(p.leadTimeDays), p.minQty > 1 ? `min. ${p.minQty}` : null].filter(Boolean).join(' · ');
    return `
      <article class="product reveal">
        ${productThumb(p, icons.get(p.category))}
        <div class="product__body">
          <h3 class="product__name"><a class="product__link" href="${href}">${escapeHtml(p.name)}</a></h3>
          <p class="product__unit">${p.options.length > 1 ? `${p.options.length} options` : escapeHtml(p.options[0].label)}</p>
          <p class="product__price">${prices.length > 1 ? '<span class="muted">from</span> ' : ''}${money(Math.min(...prices))}</p>
          <p class="product__meta">${icon('clock')}${escapeHtml(meta)}</p>
        </div>
        <div class="product__actions">
          <a class="btn btn--brand btn--sm btn--block" href="${href}" aria-label="Pre-order ${escapeHtml(p.name)}">Pre-order</a>
        </div>
      </article>`;
  }).join('');
  section.hidden = false;
  watchReveal(section);
}

function showBatchTeaser(batch) {
  if (!isBatchOpen(batch)) return;
  const teaser = document.querySelector('[data-batch-teaser]');
  teaser.innerHTML = `
    <span class="tag">This week's batch</span>
    <span class="batch-teaser__text"><strong>${escapeHtml(batch.title)}</strong>: order by ${formatDateTime(batch.orderBy)}, ready ${formatDay(batch.readyOn)}.</span>
    <span class="batch-teaser__cta">Pre-order ${icon('arrow-right')}</span>`;
  teaser.hidden = false;
}
