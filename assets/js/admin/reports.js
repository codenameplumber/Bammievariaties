// Reports: one filter row (period, store) scopes everything below it. Headline
// figures against the previous period, sales over time, channels, top products,
// top customers for end-of-season gifts, a year in review, and a CSV download.
import { money, escapeHtml, toast, copyText } from '../ui.js';
import { getAdminOrders } from '../api.js';
import { todayISO, addDays, formatDay, parseISODate } from '../dates.js';
import { displayPhone } from '../customer.js';
import {
  sales, between, forStore, totals, change, dailySeries, monthlySeries, byChannel,
  topProducts, topCustomers, uniqueCustomers, startOfWeek, dayOf, SERIES, CHANNELS,
} from './stats.js';
import { columnChart, barList } from './chart.js';
import { initAdmin, deltaHtml, itemsSummary, timeOf, PAYMENT_LABEL, PAY_STATUS } from './admin-ui.js';

initAdmin();

const today = todayISO();
const year = Number(today.slice(0, 4));
const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m is 1-based

const PERIODS = {
  week: { against: 'last week', range: () => [startOfWeek(today), today], previous: ([f, t]) => [addDays(f, -7), addDays(t, -7)] },
  month: {
    against: 'last month',
    range: () => [`${today.slice(0, 8)}01`, today],
    previous: () => {
      const [y, m, d] = today.split('-').map(Number);
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const ym = `${py}-${String(pm).padStart(2, '0')}`;
      return [`${ym}-01`, `${ym}-${String(Math.min(d, daysInMonth(py, pm))).padStart(2, '0')}`];
    },
  },
  '30d': { against: 'the 30 days before', range: () => [addDays(today, -29), today], previous: () => [addDays(today, -59), addDays(today, -30)] },
  year: { against: 'this time last year', range: () => [`${year}-01-01`, today], previous: () => [`${year - 1}-01-01`, `${year - 1}${today.slice(4)}`] },
};

const all = sales(await getAdminOrders());
const filters = document.querySelector('[data-filters]');
let period;
let scope;
let current = [];

filters.addEventListener('change', render);
document.querySelector('[data-csv]').addEventListener('click', downloadCsv);
document.querySelector('[data-copy-gifts]').addEventListener('click', copyGiftList);

render();

function render() {
  // Read the filters from the page: browsers restore radio choices on reload and back.
  period = filters.querySelector('input[name="period"]:checked').value;
  scope = filters.querySelector('input[name="scope"]:checked').value;
  const p = PERIODS[period];
  const [from, to] = p.range();
  const [pFrom, pTo] = p.previous([from, to]);
  current = forStore(between(all, from, to), scope);
  const before = forStore(between(all, pFrom, pTo), scope);

  document.querySelector('[data-range-line]').textContent = `${formatDay(from)} to ${formatDay(to)}${scope === 'all' ? ', both stores' : `, ${SERIES.find((s) => s.id === scope).name} only`}`;

  renderKpis(current, before, p.against);
  renderReview(period === 'year' ? current : null);
  renderTime(from, to);
  barList(document.querySelector('[data-channels]'), byChannel(current).map((r) => ({
    name: r.name, value: r.total, note: `${r.count} orders · ${share(r.total, totals(current).total)}`,
  })));
  barList(document.querySelector('[data-products]'), topProducts(current, 8).map((r) => ({
    name: r.name, detail: r.detail, value: r.total, note: `${r.qty} sold`,
  })));
  renderCustomers();
}

function renderKpis(now, before, against) {
  const t = totals(now);
  const b = totals(before);
  const avg = (x) => (x.count ? Math.round(x.total / x.count) : 0);
  const tiles = [
    { label: 'Total sales', value: money(t.total), delta: change(t.total, b.total) },
    { label: 'Orders', value: t.count.toLocaleString('en-NG'), delta: change(t.count, b.count) },
    { label: 'Average order', value: money(avg(t)), delta: change(avg(t), avg(b)) },
    { label: 'Customers served', value: uniqueCustomers(now).toLocaleString('en-NG'), delta: change(uniqueCustomers(now), uniqueCustomers(before)), sub: 'With a phone number' },
  ];
  document.querySelector('[data-kpis]').innerHTML = tiles.map((k) => `
    <div class="tile">
      <p class="tile__label">${k.label}</p>
      <p class="tile__value">${k.value}</p>
      ${k.sub ? `<p class="tile__sub">${k.sub}</p>` : ''}
      ${deltaHtml(k.delta, against)}
    </div>`).join('');
}

function renderReview(orders) {
  const box = document.querySelector('[data-review]');
  box.hidden = !orders;
  if (!orders) return;
  document.querySelector('[data-review-title]').textContent = `${year} in review`;

  const months = monthlySeries(orders, `${year}-01-01`, today).map((m) => ({ ...m, total: m.values.varieties + m.values.bake }));
  const best = months.reduce((a, m) => (m.total > a.total ? m : a), months[0]);
  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const o of orders) byWeekday[parseISODate(dayOf(o)).getDay()] += o.total;
  const busiest = byWeekday.indexOf(Math.max(...byWeekday));
  const weekday = new Date(2026, 0, 4 + busiest).toLocaleDateString('en-NG', { weekday: 'long' }); // 4 Jan 2026 is a Sunday
  const product = topProducts(orders, 1)[0];
  const customer = topCustomers(orders, 1)[0];
  const preorders = orders.filter((o) => o.store === 'bake').length;

  const tiles = [
    { label: 'Best month', value: monthName(best.key), sub: money(best.total) },
    { label: 'Busiest day of the week', value: weekday, sub: `${money(byWeekday[busiest])} this year` },
    { label: 'Top product', value: product ? `${product.name}` : '—', sub: product ? `${product.detail} · ${product.qty.toLocaleString('en-NG')} sold` : '' },
    { label: 'Most loyal customer', value: customer?.name ?? '—', sub: customer ? `${customer.count} orders · ${money(customer.total)}` : '' },
    { label: 'Customers served', value: uniqueCustomers(orders).toLocaleString('en-NG'), sub: 'With a phone number' },
    { label: 'Bake & Cook pre-orders', value: preorders.toLocaleString('en-NG'), sub: 'Placed this year' },
  ];
  document.querySelector('[data-review-tiles]').innerHTML = tiles.map((k) => `
    <div class="tile">
      <p class="tile__label">${k.label}</p>
      <p class="tile__value">${escapeHtml(k.value)}</p>
      <p class="tile__sub">${escapeHtml(k.sub)}</p>
    </div>`).join('');
}

function renderTime(from, to) {
  const series = scope === 'all' ? SERIES : SERIES.filter((s) => s.id === scope);
  const monthly = period === 'year';
  const rows = monthly ? monthlySeries(current, from, to) : dailySeries(current, from, to);
  const columns = rows.map((r) => ({
    label: monthly ? monthName(r.key) : formatDay(r.key),
    short: monthly ? monthName(r.key, 'short') : period === 'week' ? parseISODate(r.key).toLocaleDateString('en-NG', { weekday: 'short' }) : String(Number(r.key.slice(8))),
    values: r.values,
  }));
  document.querySelector('[data-time-note]').textContent = monthly ? 'Per month' : 'Per day';
  columnChart(document.querySelector('[data-time-chart]'), {
    columns,
    series,
    caption: `Sales ${monthly ? 'per month' : 'per day'}, ${formatDay(from)} to ${formatDay(to)}`,
  });
}

function renderCustomers() {
  const rows = topCustomers(current, 10);
  const box = document.querySelector('[data-customers]');
  document.querySelector('[data-copy-gifts]').hidden = !rows.length;
  if (!rows.length) {
    box.innerHTML = '<p class="panel__note">No customers with a phone number in this period.</p>';
    return;
  }
  box.innerHTML = `
    <table class="data-table">
      <caption class="visually-hidden">Top customers by money spent</caption>
      <thead><tr><th class="num">#</th><th>Customer</th><th>Phone</th><th class="num">Orders</th><th class="num">Spent</th><th>Last order</th></tr></thead>
      <tbody>
        ${rows.map((c, i) => `
          <tr>
            <td class="num">${i + 1}</td>
            <th scope="row">${escapeHtml(c.name || 'No name')}</th>
            <td>${escapeHtml(displayPhone(c.phone))}</td>
            <td class="num">${c.count}</td>
            <td class="num">${money(c.total)}</td>
            <td>${formatDay(dayOf({ createdAt: c.last }))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function copyGiftList() {
  const lines = topCustomers(current, 10).map((c, i) => `${i + 1}. ${c.name || 'No name'} — ${displayPhone(c.phone)} — ${money(c.total)} (${c.count} orders)`);
  toast(await copyText(lines.join('\n')) ? 'Gift list copied.' : "Couldn't copy on this device.");
}

function downloadCsv() {
  const [from, to] = PERIODS[period].range();
  const header = ['Ref', 'Date', 'Time', 'Store', 'Channel', 'Customer', 'Phone', 'Items', 'Total (NGN)', 'Paid by', 'Payment', 'Needed on', 'Status'];
  const rows = [...current].reverse().map((o) => [
    o.ref, dayOf(o), timeOf(o.createdAt), SERIES.find((s) => s.id === o.store).name, CHANNELS[o.channel] ?? o.channel,
    o.customer?.name ?? '', o.customer?.phone ? displayPhone(o.customer.phone) : '', itemsSummary(o, 99), o.total,
    PAYMENT_LABEL[o.payment.method] ?? o.payment.method, PAY_STATUS[o.payment.status] ?? o.payment.status, o.neededBy ?? '', o.status,
  ]);
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `bammie-orders-${from}-to-${to}${scope === 'all' ? '' : `-${scope}`}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Quote cells for spreadsheets; a leading = + - @ is neutralised so a name can't run as a formula.
function cell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function share(part, whole) {
  return whole ? `${Math.round((part / whole) * 100)}%` : '0%';
}

function monthName(ym, style = 'long') {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-NG', style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' });
}
