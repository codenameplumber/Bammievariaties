// Shared page helpers: links that work at any folder depth, ₦ formatting,
// icons, toasts, cart badges, and contact details filled in from the owner's
// settings (Admin → Settings).
import { BUSINESS, PREVIEW } from './config.js';
import { getSettings } from './settings.js';
import { cartCount } from './cart.js';
import { displayPhone } from './customer.js';

// Site root, worked out from this file's location, so links still work when
// GitHub Pages serves the site from /<repo-name>/.
export const ROOT = new URL('../../', import.meta.url);
export const siteUrl = (path) => new URL(path, ROOT).href;

const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
export const money = (amount) => '₦' + naira.format(amount);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function icon(name, className = '') {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="${siteUrl('assets/img/icons.svg')}#${name}"></use></svg>`;
}

// Product photo over the category's placeholder tile; if the photo is missing the
// tile shows through. Photos uploaded in the admin are "idb:<key>" (see idb.js).
export function productThumb(product, iconName = 'basket') {
  const cls = `thumb thumb--${escapeHtml(product.category)}`;
  const img = !product.image ? ''
    : product.image.startsWith('idb:')
      ? `<img data-idb-src="${escapeHtml(product.image.slice(4))}" alt="">`
      : `<img src="${siteUrl(product.image)}" alt="" loading="lazy" width="800" height="600" onerror="this.remove()">`;
  return `<div class="${cls}">${icon(iconName)}${img}</div>`;
}

export function whatsappUrl(text = '') {
  return `https://wa.me/${getSettings().whatsapp}` + (text ? `?text=${encodeURIComponent(text)}` : '');
}

export function toast(message) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.append(el);
  setTimeout(() => el.remove(), 2800);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function refreshCartBadges() {
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    const n = cartCount(el.dataset.cartCount);
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  });
  // The other store's cart icon only shows when something is in it.
  document.querySelectorAll('[data-cart-link]').forEach((el) => {
    el.hidden = cartCount(el.dataset.cartLink) === 0;
  });
}

function contactItems() {
  const s = getSettings();
  const items = [
    `<li><a href="${whatsappUrl()}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Chat on WhatsApp<br><small>${displayPhone(s.whatsapp)}</small></span></a></li>`,
    ...s.phones.filter((p) => p.number).map((p) =>
      `<li><a href="tel:${escapeHtml(p.number)}">${icon('phone')}<span>${displayPhone(p.number)}<br><small>${escapeHtml(p.network)} line</small></span></a></li>`),
  ];
  if (s.tiktok) {
    items.push(`<li><a href="https://www.tiktok.com/@${encodeURIComponent(s.tiktok)}" target="_blank" rel="noopener">${icon('tiktok')}<span>@${escapeHtml(s.tiktok)}<br><small>TikTok</small></span></a></li>`);
  }
  if (s.email) {
    items.push(`<li><a href="mailto:${escapeHtml(s.email)}">${icon('mail')}<span>${escapeHtml(s.email)}</span></a></li>`);
  }
  if (s.address) {
    items.push(`<li><span>${icon('map-pin')}<span>${escapeHtml(s.address)}${s.area ? `<br><small>${escapeHtml(s.area)}</small>` : ''}</span></span></li>`);
  }
  return items.join('');
}

// The "Visit or call us" block: address (or a directions prompt), hours, phone lines.
function renderVisit() {
  const list = document.querySelector('[data-visit-list]');
  if (!list) return;
  const s = getSettings();
  const items = [s.address
    ? `<li>${icon('map-pin')}<span><strong>${escapeHtml(s.address)}</strong>${s.area ? `<small>${escapeHtml(s.area)}</small>` : ''}</span></li>`
    : `<li>${icon('map-pin')}<span><strong>Our shop</strong><small>Call or WhatsApp us for directions</small></span></li>`];
  if (s.hours) {
    items.push(`<li>${icon('clock')}<span><strong>Opening hours</strong><small>${escapeHtml(s.hours)}</small></span></li>`);
  }
  for (const p of s.phones.filter((x) => x.number)) {
    items.push(`<li>${icon('phone')}<span><a href="tel:${escapeHtml(p.number)}">${displayPhone(p.number)}</a><small>${escapeHtml(p.network)} line</small></span></li>`);
  }
  list.innerHTML = items.join('');

  const map = document.querySelector('[data-map-link]');
  if (map && s.mapUrl) {
    map.href = s.mapUrl;
    map.target = '_blank';
    map.rel = 'noopener';
    map.hidden = false;
  }
}

export const storeIsOpen = (store) => getSettings().open[store] !== false;

// When the owner pauses a store in Settings, say so at the top of its pages.
function showStoreStatus() {
  const store = document.body.dataset.store;
  if (!store || storeIsOpen(store)) return;
  const name = BUSINESS.stores[store].name;
  const bar = document.createElement('div');
  bar.className = 'closed-bar';
  bar.innerHTML = `${icon('info')}<span>${escapeHtml(name)} isn't taking online orders right now. <a href="${whatsappUrl(`Hello Bammie! I'd like to order from ${name}.`)}" target="_blank" rel="noopener">Chat with us on WhatsApp</a>.</span>`;
  document.querySelector('main')?.prepend(bar);
}

// Admin-uploaded photos (idb:) load from IndexedDB once they're on the page.
function watchUploadedImages() {
  const hydrate = () => {
    if (document.querySelector('img[data-idb-src]')) import('./idb.js').then((m) => m.hydrateImages());
  };
  hydrate();
  new MutationObserver(hydrate).observe(document.body, { childList: true, subtree: true });
}

// Call once per page, before page-specific rendering.
export function initPage() {
  if (PREVIEW) document.querySelectorAll('[data-preview]').forEach((el) => { el.hidden = false; });

  document.querySelectorAll('[data-whatsapp]').forEach((a) => {
    a.href = whatsappUrl(a.dataset.whatsapp);
    a.target = '_blank';
    a.rel = 'noopener';
  });

  document.querySelectorAll('[data-contact-list]').forEach((el) => { el.innerHTML = contactItems(); });
  renderVisit();
  showStoreStatus();
  watchUploadedImages();
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  refreshCartBadges();
  window.addEventListener('bammie:cart', refreshCartBadges);
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('bammie.cart.')) refreshCartBadges();
  });
}
