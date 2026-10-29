// Helpers shared by the admin pages: labels and badges for order states, dates,
// toasts, confirm dialogs, WhatsApp links to customers, DataTables defaults and
// CSV/PDF export.
import { money, escapeHtml, siteUrl } from '../ui.js';
import { BUSINESS, BAKE } from '../config.js';
import { normalisePhone, displayPhone } from '../customer.js';
import { formatDayLong } from '../dates.js';

export { money, escapeHtml, displayPhone };

// ---- order states ------------------------------------------------------------------
export const STATUS = {
  varieties: {
    new: ['Pending', 'warning'], confirmed: ['Confirmed', 'info'],
    completed: ['Completed', 'success'], cancelled: ['Cancelled', 'danger'],
  },
  bake: {
    requested: ['Pending', 'warning'], confirmed: ['Confirmed', 'info'], ready: ['Ready', 'primary'],
    completed: ['Completed', 'success'], cancelled: ['Cancelled', 'danger'],
  },
  request: {
    requested: ['New request', 'warning'], quoted: ['Quote sent', 'info'],
    booked: ['Booked', 'success'], declined: ['Declined', 'secondary'],
  },
};
export const PAYMENT_STATUS = { unpaid: ['Not paid', 'danger'], deposit: ['Deposit paid', 'warning'], paid: ['Paid', 'success'] };
export const PAYMENT_METHOD = {
  cash: 'Cash', transfer: 'Bank transfer', pos: 'POS',
  'pay-on-delivery': 'Pay on delivery', 'pay-on-collection': 'Pay on collection',
};
export const CHANNEL = { website: 'Website', whatsapp: 'WhatsApp', 'walk-in': 'Walk-in', tiktok: 'TikTok', call: 'Phone call' };
export const FULFILMENT = { delivery: 'Delivery', pickup: 'Pickup', 'own-rider': "Customer's rider", 'in-store': 'In the shop' };

export const kindOf = (order) => (order.type === 'request' ? 'request' : order.store);
export const isOpen = (order) => !['completed', 'cancelled', 'declined', 'booked'].includes(order.status);

export function statusBadge(order) {
  const [label, tone] = STATUS[kindOf(order)][order.status] ?? [order.status, 'secondary'];
  return `<span class="badge-soft ${tone}">${escapeHtml(label)}</span>`;
}

export function paymentBadge(order) {
  if (!order.payment) return '<span class="cell-sub">—</span>';
  const [label, tone] = PAYMENT_STATUS[order.payment.status] ?? [order.payment.status, 'secondary'];
  return `<span class="badge-soft ${tone}">${escapeHtml(label)}</span>`;
}

export const storeName = (store) => BUSINESS.stores[store].short;
export const storeDot = (store) => `<span class="store-dot ${store}" aria-hidden="true"></span>`;

export function itemsSummary(order, max = 2) {
  if (order.type === 'request') return `${order.request.eventType}, about ${order.request.guests} guests`;
  const parts = order.items.slice(0, max).map((i) => `${i.qty} × ${i.name}`);
  const more = order.items.length - parts.length;
  return parts.join(', ') + (more > 0 ? ` +${more} more` : '');
}

export const slotLabel = (slot) => BAKE.timeSlots[slot] ?? '';
export const neededText = (o) => (o.neededBy ? `${formatDayLong(o.neededBy)}${o.timeSlot ? `, ${slotLabel(o.timeSlot).split(' (')[0]}` : ''}` : '');

// ---- dates -------------------------------------------------------------------------
export function dateTime(iso) {
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}
export const dateShort = (iso) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

// ---- WhatsApp to the customer ------------------------------------------------------
export function customerWhatsapp(order, text) {
  const phone = normalisePhone(order.customer?.phone);
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null;
}

export function whatsappMessageFor(order) {
  const name = order.customer?.name?.split(' ')[0] || 'there';
  const store = BUSINESS.stores[order.store].name;
  if (order.type === 'request') {
    return order.status === 'quoted' && order.total
      ? `Hello ${name}, thank you for your request (${order.ref}) for your ${order.request.eventType.toLowerCase()}. Our quote is ${money(order.total)}. Shall we go ahead?`
      : `Hello ${name}, this is Bammie about your request ${order.ref}. `;
  }
  if (order.status === 'ready') return `Hello ${name}, your Bammie pre-order ${order.ref} is ready. `;
  if (order.status === 'completed') return `Hello ${name}, thank you for ordering from ${store}! Your order ${order.ref} is complete. We hope to see you again.`;
  if (order.payment?.status !== 'paid') return `Hello ${name}, this is ${store} about your order ${order.ref} (${money(order.total)}). `;
  return `Hello ${name}, this is ${store}. Your order ${order.ref} is confirmed. `;
}

// ---- feedback -------------------------------------------------------------------------
export function toast(message, tone = 'success') {
  let region = document.getElementById('toastRegion');
  if (!region) {
    region = Object.assign(document.createElement('div'), { id: 'toastRegion', className: 'toast-container position-fixed bottom-0 end-0 p-3' });
    region.style.zIndex = 1090;
    document.body.append(region);
  }
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${tone} border-0`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  el.querySelector('.toast-body').textContent = message;
  region.append(el);
  const t = new bootstrap.Toast(el, { delay: 3200 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
}

// A Bootstrap confirm dialog that resolves true/false.
export function confirmAction(message, { confirmLabel = 'Yes, continue', tone = 'primary' } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal fade" tabindex="-1" aria-modal="true" role="dialog">
        <div class="modal-dialog modal-dialog-centered modal-sm">
          <div class="modal-content">
            <div class="modal-body p-4"><p class="mb-0" data-msg></p></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-${tone}" data-ok>${escapeHtml(confirmLabel)}</button>
            </div>
          </div>
        </div>
      </div>`;
    const el = wrap.firstElementChild;
    el.querySelector('[data-msg]').textContent = message;
    document.body.append(el);
    const modal = new bootstrap.Modal(el);
    let answer = false;
    el.querySelector('[data-ok]').addEventListener('click', () => { answer = true; modal.hide(); });
    el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(answer); });
    modal.show();
  });
}

// ---- DataTables ---------------------------------------------------------------------
export function dataTable(selector, options) {
  return $(selector).DataTable({
    responsive: true,
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    autoWidth: false,
    language: {
      search: '',
      searchPlaceholder: 'Search…',
      emptyTable: 'Nothing here yet',
      zeroRecords: 'No matches',
      info: '_START_–_END_ of _TOTAL_',
      infoEmpty: '0 of 0',
      infoFiltered: '(from _MAX_)',
      lengthMenu: 'Show _MENU_',
      paginate: { previous: '‹', next: '›' },
    },
    ...options,
  });
}

// "Meat Pie 6" → "meat-pie-6", made unique against ids already in use.
export function slug(text) {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item';
}
export function uniqueId(base, taken) {
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

// Small product photo for tables: a bundled file, an uploaded photo (idb:), or a blank.
export function thumbHtml(image) {
  if (!image) return '<span class="thumb-sm empty"><i class="bi bi-image" aria-hidden="true"></i></span>';
  return image.startsWith('idb:')
    ? `<img class="thumb-sm" data-idb-src="${escapeHtml(image.slice(4))}" alt="">`
    : `<img class="thumb-sm" src="${siteUrl(image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
}

// A column that shows HTML but sorts and searches on a plain value.
export const col = (display, value = display, extra = {}) => ({
  data: null,
  render: (_d, type, row) => (type === 'display' ? display(row) : value(row)),
  ...extra,
});

// Filter buttons with counts, e.g. "Pending (3)".
export function renderPills(container, filters, active, rows) {
  container.innerHTML = filters.map((f) => {
    const n = rows.filter(f.test).length;
    return `<button type="button" class="btn ${f.id === active ? 'btn-primary' : 'btn-outline-primary'}" data-filter="${f.id}" aria-pressed="${f.id === active}">${escapeHtml(f.label)}<span class="count">${n}</span></button>`;
  }).join('');
}

export function statCard({ icon, tone, label, value, sub }) {
  return `
    <div class="col-6 col-xl-3">
      <div class="stat-card">
        <div class="stat-icon ${tone}"><i class="bi ${icon}" aria-hidden="true"></i></div>
        <p class="stat-label">${escapeHtml(label)}</p>
        <p class="stat-value">${value}</p>
        ${sub ? `<p class="stat-sub">${sub}</p>` : ''}
      </div>
    </div>`;
}

// ---- exports ---------------------------------------------------------------------------
export function downloadCsv(filename, header, rows) {
  const cell = (value) => {
    let s = String(value ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // keep spreadsheets from running a cell as a formula
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// PDF with a title block and a table (jsPDF + autotable, loaded on the page).
export function downloadPdf(filename, title, subtitle, header, rows, { landscape = false, summary = [] } = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(subtitle, 14, 25);
  let y = 31;
  for (const line of summary) {
    doc.text(line, 14, y);
    y += 5;
  }
  // The PDF fonts have no ₦ sign, so amounts print as "N12,500".
  const clean = (v) => String(v ?? '').replaceAll('₦', 'N').replaceAll('×', 'x').replaceAll('–', '-');
  doc.autoTable({
    head: [header.map(clean)],
    body: rows.map((r) => r.map(clean)),
    startY: y + 2,
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 86, 49] },
    alternateRowStyles: { fillColor: [246, 248, 247] },
  });
  doc.save(filename);
}
