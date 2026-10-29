// Reports & profit: pick any dates (or a quick range) and a store, and see
// revenue, cost of goods, profit and margin; a day-by-day chart; product
// performance; channels and payment methods. Export to CSV or PDF.
import { loadShop } from '../api.js';
import { todayISO, addDays, formatDay, parseISODate } from '../dates.js';
import { initShell, setBadges } from './shell.js';
import { completedSales, dayOf, costFinder, profitSummary, productPerformance, groupTotals } from './stats.js';
import {
  money, escapeHtml, dataTable, col, statCard, storeDot, storeName, CHANNEL, PAYMENT_METHOD, downloadCsv, downloadPdf, itemsSummary, dateTime,
} from './common.js';

initShell();

const shop = await loadShop();
setBadges(shop.orders);
const costOf = costFinder(shop);
const sales = completedSales(shop.orders);
const today = todayISO();
const form = document.querySelector('[data-filters]');

const startOfWeek = (iso) => addDays(iso, -((parseISODate(iso).getDay() + 6) % 7));
const PRESETS = [
  { id: 'today', label: 'Today', range: () => [today, today] },
  { id: 'yesterday', label: 'Yesterday', range: () => [addDays(today, -1), addDays(today, -1)] },
  { id: 'week', label: 'This week', range: () => [startOfWeek(today), today] },
  { id: 'month', label: 'This month', range: () => [`${today.slice(0, 8)}01`, today] },
  { id: 'last-month', label: 'Last month', range: () => { const end = addDays(`${today.slice(0, 8)}01`, -1); return [`${end.slice(0, 8)}01`, end]; } },
  { id: '30', label: 'Last 30 days', range: () => [addDays(today, -29), today] },
  { id: 'year', label: 'This year', range: () => [`${today.slice(0, 4)}-01-01`, today] },
];
let preset = 'month';
let current = { from: '', to: '', store: 'all', orders: [] };
let chart;

const perfTable = dataTable('#perfTable', {
  data: [],
  order: [[3, 'desc']],
  columns: [
    col((r) => `<div class="cell-main">${escapeHtml(r.name)}</div><div class="cell-sub">${escapeHtml(r.detail)}</div>`, (r) => `${r.name} ${r.detail}`, { responsivePriority: 1 }),
    col((r) => `${storeDot(r.store)}${escapeHtml(storeName(r.store))}`, (r) => r.store),
    col((r) => r.qty.toLocaleString('en-NG'), (r) => r.qty),
    col((r) => money(r.revenue), (r) => r.revenue, { responsivePriority: 2 }),
    col((r) => money(r.cost), (r) => r.cost),
    col((r) => `<span class="fw-semibold ${r.profit < 0 ? 'text-danger' : 'text-success'}">${money(r.profit)}</span>`, (r) => r.profit, { responsivePriority: 2 }),
    col((r) => `${r.margin}%`, (r) => r.margin),
  ],
});

form.querySelector('[data-presets]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (!btn) return;
  preset = btn.dataset.preset;
  const [from, to] = PRESETS.find((p) => p.id === preset).range();
  form.elements.from.value = from;
  form.elements.to.value = to;
  run();
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  preset = null;
  run();
});
document.querySelectorAll('[data-export]').forEach((btn) => btn.addEventListener('click', () => exportReport(btn.dataset.export)));

[form.elements.from.value, form.elements.to.value] = PRESETS.find((p) => p.id === preset).range();
run();

function run() {
  let { from, to } = { from: form.elements.from.value, to: form.elements.to.value };
  if (!from || !to) return;
  if (from > to) [from, to] = [to, from];
  const store = form.elements.store.value;
  const orders = sales.filter((o) => dayOf(o) >= from && dayOf(o) <= to && (store === 'all' || o.store === store));
  current = { from, to, store, orders };

  form.querySelector('[data-presets]').innerHTML = PRESETS.map((p) =>
    `<button type="button" class="btn ${p.id === preset ? 'btn-primary' : 'btn-outline-primary'}" data-preset="${p.id}" aria-pressed="${p.id === preset}">${p.label}</button>`).join('');
  document.querySelector('[data-range-line]').textContent = `${formatDay(from)} to ${formatDay(to)} · ${store === 'all' ? 'both stores' : storeName(store)}`;

  const s = profitSummary(orders, costOf);
  document.querySelector('[data-kpis]').innerHTML = [
    statCard({ icon: 'bi-cash-stack', tone: 'green', label: 'Revenue', value: money(s.revenue), sub: `${s.count} completed orders` }),
    statCard({ icon: 'bi-basket', tone: 'blue', label: 'Cost of goods', value: money(s.cost), sub: 'From your cost prices' }),
    statCard({ icon: 'bi-piggy-bank', tone: 'gold', label: 'Profit', value: `<span class="${s.profit < 0 ? 'text-danger' : ''}">${money(s.profit)}</span>`, sub: `${s.margin}% margin` }),
    statCard({ icon: 'bi-receipt', tone: 'brown', label: 'Average order', value: money(s.count ? Math.round(s.revenue / s.count) : 0), sub: `${s.items.toLocaleString('en-NG')} items sold` }),
  ].join('');

  renderTrend(orders, from, to);
  perfTable.clear().rows.add(productPerformance(orders, costOf)).draw();
  renderGroup('[data-channels]', groupTotals(orders, (o) => o.channel), (k) => CHANNEL[k] ?? k, s.revenue);
  renderGroup('[data-payments]', groupTotals(orders, (o) => o.payment?.method ?? 'unknown'), (k) => PAYMENT_METHOD[k] ?? 'Not recorded', s.revenue);
}

function renderTrend(orders, from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const monthly = days.length > 62;
  const keyOf = (iso) => (monthly ? iso.slice(0, 7) : iso);
  const keys = [...new Set(days.map(keyOf))];
  const rows = new Map(keys.map((k) => [k, { revenue: 0, cost: 0 }]));
  for (const o of orders) {
    const row = rows.get(keyOf(dayOf(o)));
    row.revenue += o.total;
    row.cost += o.items.reduce((sum, i) => sum + costOf(o, i) * i.qty, 0);
  }
  const label = (k) => (monthly
    ? new Date(`${k}-01T00:00:00`).toLocaleDateString('en-NG', { month: 'short', year: '2-digit' })
    : parseISODate(k).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }));
  document.querySelector('[data-trend-note]').textContent = monthly ? 'Per month' : 'Per day';
  const data = {
    labels: keys.map(label),
    datasets: [
      { type: 'bar', label: 'Revenue', data: keys.map((k) => rows.get(k).revenue), backgroundColor: '#2A7A45', borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 24, order: 2 },
      { type: 'line', label: 'Profit', data: keys.map((k) => rows.get(k).revenue - rows.get(k).cost), borderColor: '#D9A21B', backgroundColor: '#D9A21B', borderWidth: 2, pointRadius: keys.length > 40 ? 0 : 3, tension: 0.25, order: 1 },
    ],
  };
  if (chart) {
    chart.data = data;
    chart.update();
  } else {
    chart = new Chart(document.getElementById('trendChart'), {
      data,
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.raw)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: { beginAtZero: true, grid: { color: '#EEF1EF' }, ticks: { callback: (v) => (Math.abs(v) >= 1_000_000 ? `₦${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `₦${Math.round(v / 1000)}K` : `₦${v}`) } },
        },
      },
    });
  }
  document.querySelector('[data-trend-table]').innerHTML = `
    <table class="table table-sm small mb-0"><thead><tr><th>${monthly ? 'Month' : 'Day'}</th><th class="text-end">Revenue</th><th class="text-end">Cost</th><th class="text-end">Profit</th></tr></thead>
    <tbody>${keys.map((k) => { const r = rows.get(k); return `<tr><td>${label(k)}</td><td class="text-end">${money(r.revenue)}</td><td class="text-end">${money(r.cost)}</td><td class="text-end">${money(r.revenue - r.cost)}</td></tr>`; }).join('')}</tbody></table>`;
}

function renderGroup(selector, groups, name, total) {
  document.querySelector(selector).innerHTML = groups.length ? `
    <table class="table table-sm align-middle mb-0">
      <thead><tr><th></th><th class="text-end">Orders</th><th class="text-end">Revenue</th><th class="text-end">Share</th></tr></thead>
      <tbody>${groups.map((g) => `
        <tr>
          <td>${escapeHtml(name(g.key))}<div class="progress mt-1" style="height:6px" role="presentation"><div class="progress-bar" style="width:${total ? Math.round((g.total / total) * 100) : 0}%;background:#2A7A45"></div></div></td>
          <td class="text-end">${g.count}</td><td class="text-end">${money(g.total)}</td><td class="text-end">${total ? Math.round((g.total / total) * 100) : 0}%</td>
        </tr>`).join('')}</tbody>
    </table>` : '<p class="text-muted mb-0">No completed orders in these dates.</p>';
}

function exportReport(kind) {
  const { from, to, store, orders } = current;
  const s = profitSummary(orders, costOf);
  const scope = store === 'all' ? 'both stores' : storeName(store);
  if (kind === 'csv') {
    downloadCsv(`bammie-report-${from}-to-${to}.csv`,
      ['Order', 'Completed date', 'Store', 'Came in by', 'Customer', 'Items', 'Revenue', 'Cost', 'Profit', 'Paid by'],
      orders.map((o) => {
        const cost = o.items.reduce((sum, i) => sum + costOf(o, i) * i.qty, 0);
        return [o.ref, dateTime(o.createdAt), storeName(o.store), CHANNEL[o.channel] ?? o.channel, o.customer?.name ?? 'Walk-in', itemsSummary(o, 99), o.total, cost, o.total - cost, PAYMENT_METHOD[o.payment?.method] ?? ''];
      }));
    return;
  }
  const rows = productPerformance(orders, costOf).map((r) => [`${r.name} (${r.detail})`, storeName(r.store), r.qty, money(r.revenue), money(r.cost), money(r.profit), `${r.margin}%`]);
  downloadPdf(`bammie-report-${from}-to-${to}.pdf`, 'Bammie — sales and profit report', `${formatDay(from)} to ${formatDay(to)}, ${scope}`,
    ['Product', 'Store', 'Sold', 'Revenue', 'Cost', 'Profit', 'Margin'], rows,
    { summary: [`Revenue ${money(s.revenue)}   Cost of goods ${money(s.cost)}   Profit ${money(s.profit)} (${s.margin}%)`, `${s.count} completed orders, ${s.items} items sold`] });
}
