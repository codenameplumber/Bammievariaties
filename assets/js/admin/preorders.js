// Pre-orders & quotes: Bake & Cook pre-orders (by the day they're needed) and
// occasion requests, each in a DataTable with filters, opening the order popup.
import { loadShop } from '../api.js';
import { todayISO, addDays, formatDay } from '../dates.js';
import { initShell, setBadges } from './shell.js';
import { openOrderModal } from './order-modal.js';
import {
  money, escapeHtml, displayPhone, statusBadge, paymentBadge, itemsSummary, dateTime, dateShort, slotLabel, STATUS,
  PAYMENT_STATUS, dataTable, col, renderPills, statCard, downloadCsv, downloadPdf, neededText,
} from './common.js';

initShell();

let all = (await loadShop()).orders;
setBadges(all);

const today = todayISO();
const PRE_FILTERS = [
  { id: 'open', label: 'To do', test: (o) => ['requested', 'confirmed', 'ready'].includes(o.status) },
  { id: 'requested', label: 'Pending', test: (o) => o.status === 'requested' },
  { id: 'confirmed', label: 'Confirmed', test: (o) => o.status === 'confirmed' },
  { id: 'ready', label: 'Ready', test: (o) => o.status === 'ready' },
  { id: 'unpaid', label: 'Not fully paid', test: (o) => o.status !== 'cancelled' && o.payment?.status !== 'paid' },
  { id: 'completed', label: 'Completed', test: (o) => o.status === 'completed' },
  { id: 'cancelled', label: 'Cancelled', test: (o) => o.status === 'cancelled' },
  { id: 'all', label: 'All', test: () => true },
];
const REQ_FILTERS = [
  { id: 'open', label: 'To answer', test: (o) => ['requested', 'quoted'].includes(o.status) },
  { id: 'booked', label: 'Booked', test: (o) => o.status === 'booked' },
  { id: 'declined', label: 'Declined', test: (o) => o.status === 'declined' },
  { id: 'all', label: 'All', test: () => true },
];

const preOrders = () => all.filter((o) => o.store === 'bake' && o.type !== 'request');
const requests = () => all.filter((o) => o.type === 'request');
const prePills = document.querySelector('[data-pre-filter]');
const reqPills = document.querySelector('[data-req-filter]');
const from = document.querySelector('[data-from]');
const to = document.querySelector('[data-to]');
let preFilter = 'open';
let reqFilter = 'open';

const dueInRange = (o) => (!from.value || o.neededBy >= from.value) && (!to.value || o.neededBy <= to.value);
const shownPre = () => preOrders().filter(dueInRange).filter(PRE_FILTERS.find((f) => f.id === preFilter).test);
const shownReq = () => requests().filter(REQ_FILTERS.find((f) => f.id === reqFilter).test);

const dueCell = (o) => {
  const tag = o.neededBy === today ? '<span class="badge-soft danger ms-1">Today</span>'
    : o.neededBy === addDays(today, 1) ? '<span class="badge-soft warning ms-1">Tomorrow</span>' : '';
  return `<div class="cell-main">${formatDay(o.neededBy)}${tag}</div><div class="cell-sub">${escapeHtml(slotLabel(o.timeSlot))}</div>`;
};
const customerCell = (o) => `<div class="cell-main">${escapeHtml(o.customer?.name || '—')}</div><div class="cell-sub">${escapeHtml(o.customer?.phone ? displayPhone(o.customer.phone) : '')}</div>`;
const openBtn = (o) => `<button type="button" class="btn btn-sm btn-outline-primary" data-open="${escapeHtml(o.ref)}">View</button>`;

const preTable = dataTable('#preTable', {
  data: [],
  order: [[1, 'asc']],
  columns: [
    col((o) => `<div class="cell-main">${escapeHtml(o.ref)}</div><div class="cell-sub">Placed ${dateShort(o.createdAt)}</div>`, (o) => o.createdAt, { responsivePriority: 3 }),
    col(dueCell, (o) => `${o.neededBy} ${slots(o.timeSlot)}`, { responsivePriority: 1 }),
    col(customerCell, (o) => `${o.customer?.name ?? ''} ${o.customer?.phone ?? ''}`, { responsivePriority: 2 }),
    col((o) => escapeHtml(itemsSummary(o)), (o) => itemsSummary(o, 99), { orderable: false }),
    col((o) => `<span class="fw-semibold">${money(o.total)}</span>`, (o) => o.total),
    col(paymentBadge, (o) => PAYMENT_STATUS[o.payment?.status]?.[0] ?? ''),
    col(statusBadge, (o) => STATUS.bake[o.status]?.[0] ?? o.status, { responsivePriority: 2 }),
    col(openBtn, () => '', { orderable: false, className: 'text-end', responsivePriority: 1 }),
  ],
});

const reqTable = dataTable('#reqTable', {
  data: [],
  order: [[1, 'asc']],
  columns: [
    col((o) => `<div class="cell-main">${escapeHtml(o.ref)}</div><div class="cell-sub">Sent ${dateShort(o.createdAt)}</div>`, (o) => o.createdAt, { responsivePriority: 3 }),
    col((o) => `<div class="cell-main">${formatDay(o.neededBy)}</div><div class="cell-sub">${escapeHtml(slotLabel(o.timeSlot))}</div>`, (o) => o.neededBy, { responsivePriority: 1 }),
    col((o) => `<div class="cell-main">${escapeHtml(o.request.eventType)}</div><div class="cell-sub">About ${escapeHtml(o.request.guests)} guests · ${escapeHtml(o.request.wants.join(', '))}</div>`,
      (o) => `${o.request.eventType} ${o.request.wants.join(' ')}`, { responsivePriority: 2 }),
    col(customerCell, (o) => `${o.customer?.name ?? ''} ${o.customer?.phone ?? ''}`),
    col((o) => escapeHtml(o.request.budget || 'Not sure'), (o) => o.request.budget ?? ''),
    col((o) => (o.total ? money(o.total) : '<span class="cell-sub">Not sent</span>'), (o) => o.total ?? 0),
    col(statusBadge, (o) => STATUS.request[o.status]?.[0] ?? o.status, { responsivePriority: 2 }),
    col(openBtn, () => '', { orderable: false, className: 'text-end', responsivePriority: 1 }),
  ],
});

function slots(slot) {
  return ['morning', 'afternoon', 'evening'].indexOf(slot);
}

$('#preTable, #reqTable').on('click', '[data-open]', (e) => {
  const order = all.find((o) => o.ref === e.currentTarget.dataset.open);
  if (order) openOrderModal(order, { onChange: replace });
});
prePills.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (btn) { preFilter = btn.dataset.filter; render(); }
});
reqPills.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (btn) { reqFilter = btn.dataset.filter; render(); }
});
[from, to].forEach((input) => input.addEventListener('change', render));
document.querySelector('[data-clear-dates]').addEventListener('click', () => { from.value = ''; to.value = ''; render(); });
// Tables in a hidden tab measure zero width; fit them when their tab opens.
document.querySelectorAll('[data-bs-toggle="tab"]').forEach((tab) => tab.addEventListener('shown.bs.tab', () => {
  preTable.columns.adjust().responsive.recalc();
  reqTable.columns.adjust().responsive.recalc();
}));
document.querySelectorAll('[data-export]').forEach((btn) => btn.addEventListener('click', () => exportRows(btn.dataset.export)));
if (location.hash === '#requests') bootstrap.Tab.getOrCreateInstance(document.getElementById('reqTab')).show();

render();

function replace(order) {
  all = all.map((o) => (o.ref === order.ref ? order : o));
  setBadges(all);
  render();
}

function render() {
  renderPills(prePills, PRE_FILTERS, preFilter, preOrders().filter(dueInRange));
  renderPills(reqPills, REQ_FILTERS, reqFilter, requests());
  preTable.clear().rows.add(shownPre()).draw(false);
  reqTable.clear().rows.add(shownReq()).draw(false);
  const pending = preOrders().filter((o) => o.status === 'requested').length;
  const newReq = requests().filter((o) => o.status === 'requested').length;
  document.querySelector('[data-count="pre"]').textContent = pending || '';
  document.querySelector('[data-count="req"]').textContent = newReq || '';
  renderStats();
}

function renderStats() {
  const pre = preOrders();
  const week = addDays(today, 6);
  const dueWeek = pre.filter((o) => ['requested', 'confirmed', 'ready'].includes(o.status) && o.neededBy >= today && o.neededBy <= week);
  const dueToday = dueWeek.filter((o) => o.neededBy === today);
  const owed = pre.filter((o) => !['cancelled', 'completed'].includes(o.status) && o.payment?.status !== 'paid');
  const owedSum = owed.reduce((s, o) => s + o.total - (o.payment?.status === 'deposit' ? (o.deposit ?? 0) : 0), 0);
  const quotes = requests().filter((o) => ['requested', 'quoted'].includes(o.status));
  document.querySelector('[data-stats]').innerHTML = [
    statCard({ icon: 'bi-hourglass-split', tone: 'gold', label: 'Pending', value: pre.filter((o) => o.status === 'requested').length, sub: 'Waiting for you to confirm' }),
    statCard({ icon: 'bi-calendar-event', tone: 'brown', label: 'Due today', value: dueToday.length, sub: `${dueWeek.length} due in the next 7 days` }),
    statCard({ icon: 'bi-cash-coin', tone: 'red', label: 'Still to be paid', value: money(owedSum), sub: `${owed.length} pre-orders` }),
    statCard({ icon: 'bi-chat-quote', tone: 'blue', label: 'Requests to answer', value: quotes.length, sub: 'Occasion quotes' }),
  ].join('');
}

function exportRows(kind) {
  const rows = shownPre().map((o) => [
    o.ref, neededText(o), o.customer?.name ?? '', o.customer?.phone ? displayPhone(o.customer.phone) : '',
    itemsSummary(o, 99), money(o.total), PAYMENT_STATUS[o.payment?.status]?.[0] ?? '', STATUS.bake[o.status]?.[0] ?? o.status,
    o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup', o.cakeMessage ?? '',
  ]);
  const header = ['Order', 'Needed on', 'Customer', 'Phone', 'Items', 'Total', 'Payment', 'Status', 'Getting it', 'Cake message'];
  if (kind === 'csv') downloadCsv(`bammie-pre-orders-${today}.csv`, header, rows);
  else downloadPdf(`bammie-pre-orders-${today}.pdf`, 'Bammie Bake & Cook — pre-orders', `${PRE_FILTERS.find((f) => f.id === preFilter).label}, ${rows.length} pre-orders. Printed ${dateTime(new Date().toISOString())}.`, header, rows, { landscape: true });
}
