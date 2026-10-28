// Shared page helpers: links that work at any folder depth, ₦ formatting,
// icons, toasts, cart badges, and contact details filled in from config.js.
import { BUSINESS, PREVIEW } from './config.js';
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

// Product photo, or the category's placeholder tile until real photos arrive.
export function productThumb(product, iconName = 'basket') {
  const cls = `thumb thumb--${escapeHtml(product.category)}`;
  return product.image
    ? `<div class="${cls}"><img src="${siteUrl(product.image)}" alt="" loading="lazy" width="400" height="300"></div>`
    : `<div class="${cls}">${icon(iconName)}</div>`;
}

export function whatsappUrl(text = '') {
  return `https://wa.me/${BUSINESS.whatsapp}` + (text ? `?text=${encodeURIComponent(text)}` : '');
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
  const items = [
    `<li><a href="${whatsappUrl()}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Chat on WhatsApp<br><small>${displayPhone(BUSINESS.whatsapp)}</small></span></a></li>`,
    ...BUSINESS.phones.map((p) =>
      `<li><a href="tel:${p.number}">${icon('phone')}<span>${displayPhone(p.number)}<br><small>${escapeHtml(p.network)} line</small></span></a></li>`),
  ];
  if (BUSINESS.tiktok) {
    items.push(`<li><a href="https://www.tiktok.com/@${encodeURIComponent(BUSINESS.tiktok)}" target="_blank" rel="noopener">${icon('tiktok')}<span>@${escapeHtml(BUSINESS.tiktok)}<br><small>TikTok</small></span></a></li>`);
  }
  if (BUSINESS.email) {
    items.push(`<li><a href="mailto:${escapeHtml(BUSINESS.email)}">${icon('mail')}<span>${escapeHtml(BUSINESS.email)}</span></a></li>`);
  }
  if (BUSINESS.address) {
    items.push(`<li><span>${icon('map-pin')}<span>${escapeHtml(BUSINESS.address)}${BUSINESS.area ? `<br><small>${escapeHtml(BUSINESS.area)}</small>` : ''}</span></span></li>`);
  }
  return items.join('');
}

// The "Visit or call us" block: address (or a directions prompt), hours, phone lines.
function renderVisit() {
  const list = document.querySelector('[data-visit-list]');
  if (!list) return;
  const items = [BUSINESS.address
    ? `<li>${icon('map-pin')}<span><strong>${escapeHtml(BUSINESS.address)}</strong>${BUSINESS.area ? `<small>${escapeHtml(BUSINESS.area)}</small>` : ''}</span></li>`
    : `<li>${icon('map-pin')}<span><strong>Our shop</strong><small>Call or WhatsApp us for directions</small></span></li>`];
  if (BUSINESS.hours?.length) {
    const rows = BUSINESS.hours.map((h) => `${escapeHtml(h.days)}: ${escapeHtml(h.time)}`).join('<br>');
    items.push(`<li>${icon('clock')}<span><strong>Opening hours</strong><small>${rows}</small></span></li>`);
  }
  for (const p of BUSINESS.phones) {
    items.push(`<li>${icon('phone')}<span><a href="tel:${p.number}">${displayPhone(p.number)}</a><small>${escapeHtml(p.network)} line</small></span></li>`);
  }
  list.innerHTML = items.join('');

  const map = document.querySelector('[data-map-link]');
  if (map && BUSINESS.mapUrl) {
    map.href = BUSINESS.mapUrl;
    map.target = '_blank';
    map.rel = 'noopener';
    map.hidden = false;
  }
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
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  refreshCartBadges();
  window.addEventListener('bammie:cart', refreshCartBadges);
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('bammie.cart.')) refreshCartBadges();
  });
}
