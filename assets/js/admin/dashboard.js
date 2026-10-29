// Dashboard: today's numbers, what's waiting, the last 14 days by store, pre-orders
// due today and tomorrow, this month's revenue and profit, and a table of orders
// that need Bammie's attention.
import { loadShop } from '../api.js';
import { todayISO, addDays, formatDay, formatDayLong, parseISODate } from '../dates.js';
import { initShell, setBadges } from './shell.js';
import { openOrderModal } from './order-modal.js';
import { completedSales, dayOf, dailySeries, costFinder, profitSummary, SERIES } from './stats.js';
import {
  money, escapeHtml, statusBadge, paymentBadge, storeDot, storeName, itemsSummary, dateTime,
  slotLabel, dataTable, col, statCard, kindOf,
} from './common.js';

initShell();

const shop = await loadShop();
let all = shop.orders;
const costOf = costFinder(shop);
const today = todayISO();
const hour = new Date().getHours();
setBadges(all);

document.querySelector('[data-greeting]').textContent = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, Bammie`;
document.querySelector('[data-today]').textContent = formatDayLong(today);

const needsAttention = (o) =>
  (o.type === 'request' && o.status === 'requested')
  || (o.type !== 'request' && ['new', 'requested'].includes(o.status))
  || (o.type !== 'request' && ['confirmed', 'ready'].includes(o.status) && o.payment?.status !== 'paid');

const table = dataTable('#attentionTable', {
  data: [],
  order: [[0, 'desc']],
  pageLength: 8,
  lengthChange: false,
  columns: [
    col((o) => `<div class="cell-main">${escapeHtml(o.ref)}</div><div class="cell-sub">${dateTime(o.createdAt)}</div>`, (o) => o.createdAt, { responsivePriority: 1 }),
    col((o) => `${storeDot(o.store)}${escapeHtml(kindOf(o) === 'request' ? 'Occasion request' : storeName(o.store))}`, (o) => o.store),
    col((o) => `<div class="cell-main">${escapeHtml(o.customer?.name || 'Walk-in')}</div><div class="cell-sub">${escapeHtml(itemsSummary(o))}</div>`, (o) => `${o.customer?.name ?? ''} ${itemsSummary(o, 99)}`, { responsivePriority: 3 }),
    col((o) => (o.total ? money(o.total) : '—'), (o) => o.total ?? 0, { responsivePriority: 2 }),
    col(statusBadge, (o) => o.status, { responsivePriority: 2 }),
    col(paymentBadge, (o) => o.payment?.status ?? ''),
    col((o) => `<button type="button" class="btn btn-sm btn-outline-primary" data-open="${escapeHtml(o.ref)}">View</button>`, () => '', { orderable: false, className: 'text-end', responsivePriority: 1 }),
  ],
});

$('#attentionTable').on('click', '[data-open]', (e) => {
  const order = all.find((o) => o.ref === e.currentTarget.dataset.open);
  if (order) openOrderModal(order, { onChange: (o) => { all = all.map((x) => (x.ref === o.ref ? o : x)); setBadges(all); render(); } });
});
document.querySelector('[data-due]').addEventListener('click', (e) => {
  const order = all.find((o) => o.ref === e.target.closest('[data-open]')?.dataset.open);
  if (order) openOrderModal(order, { onChange: (o) => { all = all.map((x) => (x.ref === o.ref ? o : x)); setBadges(all); render(); } });
});

let chart;
render();

function render() {
  const sales = completedSales(all);
  const todays = sales.filter((o) => dayOf(o) === today);
  const pendingStore = all.filter((o) => o.store === 'varieties' && o.status === 'new');
  const pendingBake = all.filter((o) => o.store === 'bake' && o.type !== 'request' && o.status === 'requested');
  const unpaid = all.filter((o) => o.type !== 'request' && !['cancelled', 'completed'].includes(o.status) && o.payment?.status !== 'paid');
  const sum = (list) => list.reduce((s, o) => s + o.total, 0);

  document.querySelector('[data-stats]').innerHTML = [
    statCard({ icon: 'bi-currency-exchange', tone: 'green', label: "Today's sales", value: money(sum(todays)), sub: `${todays.length} completed orders` }),
    statCard({ icon: 'bi-bag', tone: 'gold', label: 'New store orders', value: pendingStore.length, sub: `<a href="orders.html">Open store orders</a>` }),
    statCard({ icon: 'bi-calendar2-heart', tone: 'brown', label: 'New pre-orders', value: pendingBake.length, sub: `<a href="preorders.html">Open pre-orders</a>` }),
    statCard({ icon: 'bi-cash-coin', tone: 'red', label: 'Waiting for payment', value: money(sum(unpaid)), sub: `${unpaid.length} open orders` }),
  ].join('');

  const month = sales.filter((o) => dayOf(o).slice(0, 7) === today.slice(0, 7));
  const m = profitSummary(month, costOf);
  document.querySelector('[data-month]').innerHTML = [
    statCard({ icon: 'bi-graph-up', tone: 'green', label: 'Revenue this month', value: money(m.revenue), sub: `${m.count} completed orders` }),
    statCard({ icon: 'bi-basket', tone: 'blue', label: 'Cost of goods', value: money(m.cost), sub: 'From your cost prices' }),
    statCard({ icon: 'bi-piggy-bank', tone: 'gold', label: 'Profit this month', value: money(m.profit), sub: `${m.margin}% margin · <a href="reports.html">Reports</a>` }),
    statCard({ icon: 'bi-receipt', tone: 'brown', label: 'Average order', value: money(m.count ? Math.round(m.revenue / m.count) : 0), sub: `${m.items} items sold` }),
  ].join('');

  renderChart(sales);
  renderDue();
  table.clear().rows.add(all.filter(needsAttention)).draw(false);
}

function renderChart(sales) {
  const from = addDays(today, -13);
  const days = dailySeries(sales.filter((o) => dayOf(o) >= from), from, today);
  const labels = days.map((d) => (d.key === today ? 'Today' : parseISODate(d.key).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' })));
  const data = {
    labels,
    datasets: SERIES.map((s) => ({
      label: s.name,
      data: days.map((d) => d.values[s.id]),
      backgroundColor: s.color,
      borderRadius: 4,
      borderSkipped: 'bottom',
      maxBarThickness: 24,
    })),
  };
  if (chart) {
    chart.data = data;
    chart.update();
  } else {
    chart = new Chart(document.getElementById('salesChart'), {
      type: 'bar',
      data,
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: false } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.raw)}`, footer: (items) => `Total: ${money(items.reduce((s, i) => s + i.raw, 0))}` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, grid: { color: '#EEF1EF' }, ticks: { callback: (v) => (v >= 1000 ? `₦${Math.round(v / 1000)}K` : `₦${v}`) } },
        },
      },
    });
  }
  document.querySelector('[data-chart-table]').innerHTML = `
    <table class="table table-sm small mb-0"><thead><tr><th>Day</th><th class="text-end">Varieties</th><th class="text-end">Bake &amp; Cook</th><th class="text-end">Total</th></tr></thead>
    <tbody>${days.map((d) => `<tr><td>${formatDay(d.key)}</td><td class="text-end">${money(d.values.varieties)}</td><td class="text-end">${money(d.values.bake)}</td><td class="text-end">${money(d.values.varieties + d.values.bake)}</td></tr>`).join('')}</tbody></table>`;
}

function renderDue() {
  const tomorrow = addDays(today, 1);
  const due = all
    .filter((o) => o.store === 'bake' && o.type !== 'request' && ['requested', 'confirmed', 'ready'].includes(o.status) && (o.neededBy === today || o.neededBy === tomorrow))
    .sort((a, b) => a.neededBy.localeCompare(b.neededBy));
  const box = document.querySelector('[data-due]');
  if (!due.length) {
    box.innerHTML = '<p class="text-muted mb-0">Nothing due today or tomorrow.</p>';
    return;
  }
  box.innerHTML = `<ul class="list-unstyled mb-0">${due.slice(0, 6).map((o) => `
    <li class="d-flex justify-content-between gap-2 py-2 border-bottom">
      <div>
        <button type="button" class="btn btn-link p-0 fw-semibold text-start" data-open="${escapeHtml(o.ref)}">${escapeHtml(o.customer?.name || o.ref)}</button>
        <div class="cell-sub">${o.neededBy === today ? 'Today' : 'Tomorrow'}, ${escapeHtml(slotLabel(o.timeSlot).split(' (')[0])} · ${escapeHtml(itemsSummary(o))}</div>
      </div>
      <div class="text-end">${statusBadge(o)}<div class="mt-1">${paymentBadge(o)}</div></div>
    </li>`).join('')}</ul>
    ${due.length > 6 ? `<a class="small d-block mt-2" href="production.html">All ${due.length} on the production list</a>` : ''}`;
}

