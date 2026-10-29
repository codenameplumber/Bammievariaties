// Store orders: every Varieties Store order (website, WhatsApp, TikTok, calls,
// walk-ins) in a DataTable. Open one to confirm it, confirm payment, complete or
// cancel it, or message the customer.
import { loadShop } from '../api.js';
import { todayISO } from '../dates.js';
import { initShell, setBadges } from './shell.js';
import { openOrderModal } from './order-modal.js';
import { dayOf } from './stats.js';
import {
  money, escapeHtml, displayPhone, statusBadge, paymentBadge, itemsSummary, dateTime, CHANNEL, STATUS,
  PAYMENT_STATUS, PAYMENT_METHOD, dataTable, col, renderPills, statCard, downloadCsv, downloadPdf,
} from './common.js';

initShell();

let all = (await loadShop()).orders;
setBadges(all);

const FILTERS = [
  { id: 'open', label: 'Open', test: (o) => o.status === 'new' || o.status === 'confirmed' },
  { id: 'new', label: 'Pending', test: (o) => o.status === 'new' },
  { id: 'unpaid', label: 'Not paid', test: (o) => o.status !== 'cancelled' && o.payment?.status !== 'paid' },
  { id: 'completed', label: 'Completed', test: (o) => o.status === 'completed' },
  { id: 'cancelled', label: 'Cancelled', test: (o) => o.status === 'cancelled' },
  { id: 'all', label: 'All', test: () => true },
];

const pills = document.querySelector('[data-status-filter]');
const from = document.querySelector('[data-from]');
const to = document.querySelector('[data-to]');
let filter = 'open';

const storeOrders = () => all.filter((o) => o.store === 'varieties' && o.type !== 'request');
const inDates = (o) => (!from.value || dayOf(o) >= from.value) && (!to.value || dayOf(o) <= to.value);
const shown = () => storeOrders().filter(inDates).filter(FILTERS.find((f) => f.id === filter).test);

const table = dataTable('#ordersTable', {
  data: [],
  order: [[0, 'desc']],
  columns: [
    col((o) => `<div class="cell-main">${escapeHtml(o.ref)}</div><div class="cell-sub">${dateTime(o.createdAt)}</div>`, (o) => o.createdAt, { responsivePriority: 1 }),
    col((o) => `<div class="cell-main">${escapeHtml(o.customer?.name || 'Walk-in customer')}</div><div class="cell-sub">${escapeHtml(o.customer?.phone ? displayPhone(o.customer.phone) : '')}</div>`,
      (o) => `${o.customer?.name ?? ''} ${o.customer?.phone ?? ''}`, { responsivePriority: 3 }),
    col((o) => escapeHtml(itemsSummary(o)), (o) => itemsSummary(o, 99), { orderable: false }),
    col((o) => `<span class="fw-semibold">${money(o.total)}</span>`, (o) => o.total, { responsivePriority: 2 }),
    col(paymentBadge, (o) => PAYMENT_STATUS[o.payment?.status]?.[0] ?? ''),
    col(statusBadge, (o) => STATUS.varieties[o.status]?.[0] ?? o.status, { responsivePriority: 2 }),
    col((o) => escapeHtml(CHANNEL[o.channel] ?? o.channel), (o) => CHANNEL[o.channel] ?? o.channel),
    col((o) => `<button type="button" class="btn btn-sm btn-outline-primary" data-open="${escapeHtml(o.ref)}">View</button>`, () => '', { orderable: false, className: 'text-end', responsivePriority: 1 }),
  ],
});

$('#ordersTable').on('click', '[data-open]', (e) => {
  const order = all.find((o) => o.ref === e.currentTarget.dataset.open);
  if (order) openOrderModal(order, { onChange: replace });
});

pills.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  render();
});
[from, to].forEach((input) => input.addEventListener('change', render));
document.querySelector('[data-clear-dates]').addEventListener('click', () => {
  from.value = '';
  to.value = '';
  render();
});
document.querySelectorAll('[data-export]').forEach((btn) => btn.addEventListener('click', () => exportRows(btn.dataset.export)));

render();

function replace(order) {
  all = all.map((o) => (o.ref === order.ref ? order : o));
  setBadges(all);
  render();
}

function render() {
  const rows = storeOrders().filter(inDates);
  renderPills(pills, FILTERS, filter, rows);
  table.clear().rows.add(shown()).draw(false);
  renderStats();
}

function renderStats() {
  const orders = storeOrders();
  const sum = (list) => list.reduce((s, o) => s + o.total, 0);
  const today = todayISO();
  const pending = orders.filter((o) => o.status === 'new');
  const unpaid = orders.filter((o) => o.status !== 'cancelled' && o.payment?.status !== 'paid');
  const doneToday = orders.filter((o) => o.status === 'completed' && dayOf(o) === today);
  const month = orders.filter((o) => o.status === 'completed' && dayOf(o).slice(0, 7) === today.slice(0, 7));
  document.querySelector('[data-stats]').innerHTML = [
    statCard({ icon: 'bi-hourglass-split', tone: 'gold', label: 'Waiting for you', value: pending.length, sub: `${money(sum(pending))} in new orders` }),
    statCard({ icon: 'bi-cash-coin', tone: 'red', label: 'Not paid yet', value: money(sum(unpaid)), sub: `${unpaid.length} orders` }),
    statCard({ icon: 'bi-check2-circle', tone: 'green', label: 'Completed today', value: money(sum(doneToday)), sub: `${doneToday.length} orders` }),
    statCard({ icon: 'bi-calendar3', tone: 'blue', label: 'This month', value: money(sum(month)), sub: `${month.length} completed orders` }),
  ].join('');
}

function exportRows(kind) {
  const rows = shown().map((o) => [
    o.ref, dateTime(o.createdAt), o.customer?.name ?? 'Walk-in', o.customer?.phone ? displayPhone(o.customer.phone) : '',
    itemsSummary(o, 99), money(o.total), PAYMENT_METHOD[o.payment?.method] ?? '', PAYMENT_STATUS[o.payment?.status]?.[0] ?? '',
    STATUS.varieties[o.status]?.[0] ?? o.status, CHANNEL[o.channel] ?? o.channel,
  ]);
  const header = ['Order', 'Placed', 'Customer', 'Phone', 'Items', 'Total', 'Paid by', 'Payment', 'Status', 'Came in by'];
  const label = FILTERS.find((f) => f.id === filter).label;
  const range = from.value || to.value ? `${from.value || '…'} to ${to.value || '…'}` : 'all dates';
  if (kind === 'csv') downloadCsv(`bammie-store-orders-${todayISO()}.csv`, header, rows);
  else downloadPdf(`bammie-store-orders-${todayISO()}.pdf`, 'Bammie Varieties Store — orders', `${label} orders, ${range}. ${rows.length} orders.`, header, rows, { landscape: true });
}
