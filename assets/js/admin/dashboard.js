// Dashboard: today's sales against the same day last week (by this time), split
// the way Bammie asked for — shop walk-ins, Varieties online, Bake & Cook — plus
// the last 7 days, pre-orders due today and tomorrow, and the latest sales.
import { money, escapeHtml } from '../ui.js';
import { getAdminOrders } from '../api.js';
import { todayISO, addDays, formatDay, formatDayLong, parseISODate } from '../dates.js';
import { BAKE } from '../config.js';
import { sales, between, totals, change, dailySeries, dayOf, SERIES, CHANNELS } from './stats.js';
import { columnChart } from './chart.js';
import { initAdmin, greeting, deltaHtml, itemsSummary, timeOf, PAY_STATUS } from './admin-ui.js';

initAdmin();

const now = new Date();
const today = todayISO();
const lastWeek = addDays(today, -7);
const lastWeekName = `last ${parseISODate(lastWeek).toLocaleDateString('en-NG', { weekday: 'short' })} by this time`;
const minutesNow = now.getHours() * 60 + now.getMinutes();
const minutesOf = (o) => { const d = new Date(o.createdAt); return d.getHours() * 60 + d.getMinutes(); };

document.querySelector('[data-greeting]').textContent = `${greeting(now)}, Bammie`;
document.querySelector('[data-today]').textContent = formatDayLong(today);

const orders = sales(await getAdminOrders());
const todays = between(orders, today, today);
const lastWeeks = between(orders, lastWeek, lastWeek).filter((o) => minutesOf(o) <= minutesNow);

renderHero();
renderTiles();
renderWeek();
renderDue();
renderFeed();

function renderHero() {
  const t = totals(todays);
  const preorders = todays.filter((o) => o.store === 'bake').length;
  document.querySelector('[data-hero]').innerHTML = `
    <p class="hero-figure__label">Today's sales so far</p>
    <p class="hero-figure__value">${money(t.total)}</p>
    <div class="hero-figure__sub">
      <span>${t.count} ${t.count === 1 ? 'sale' : 'sales'}, including ${preorders} Bake &amp; Cook ${preorders === 1 ? 'pre-order' : 'pre-orders'}</span>
      ${deltaHtml(change(t.total, totals(lastWeeks).total), lastWeekName)}
    </div>`;
}

function renderTiles() {
  const groups = [
    { label: 'Varieties, in the shop', test: (o) => o.store === 'varieties' && o.channel === 'walk-in', color: SERIES[0].color, note: 'Walk-in customers' },
    { label: 'Varieties, online', test: (o) => o.store === 'varieties' && o.channel !== 'walk-in', color: SERIES[0].color, note: 'WhatsApp, TikTok, website, calls' },
    { label: 'Bake & Cook', test: (o) => o.store === 'bake', color: SERIES[1].color, note: 'Pre-orders placed today' },
  ];
  document.querySelector('[data-tiles]').innerHTML = groups.map((g) => {
    const t = totals(todays.filter(g.test));
    const before = totals(lastWeeks.filter(g.test));
    return `
      <div class="tile">
        <p class="tile__label"><span class="tile__key" style="background:${g.color}"></span>${g.label}</p>
        <p class="tile__value">${money(t.total)}</p>
        <p class="tile__sub">${t.count} ${t.count === 1 ? 'order' : 'orders'} · ${g.note}</p>
        ${deltaHtml(change(t.total, before.total), 'last week')}
      </div>`;
  }).join('');
}

function renderWeek() {
  const from = addDays(today, -6);
  const columns = dailySeries(between(orders, from, today), from, today).map((d) => ({
    label: formatDay(d.key),
    short: d.key === today ? 'Today' : parseISODate(d.key).toLocaleDateString('en-NG', { weekday: 'short' }),
    values: d.values,
  }));
  columnChart(document.querySelector('[data-week-chart]'), { columns, series: SERIES, caption: 'Sales per day for the last 7 days, by store' });
}

function renderDue() {
  const tomorrow = addDays(today, 1);
  const due = orders
    .filter((o) => o.store === 'bake' && o.status !== 'completed' && (o.neededBy === today || o.neededBy === tomorrow))
    .sort((a, b) => (a.neededBy + slotRank(a)).localeCompare(b.neededBy + slotRank(b)));
  const box = document.querySelector('[data-due]');
  if (!due.length) {
    box.innerHTML = '<p class="panel__note">Nothing due today or tomorrow.</p>';
    return;
  }
  const count = (d) => due.filter((o) => o.neededBy === d).length;
  box.innerHTML = `
    <p class="panel__note">${count(today)} due today · ${count(tomorrow)} due tomorrow</p>
    <ul class="feed" role="list">
      ${due.slice(0, 5).map((o) => `
        <li>
          <span class="feed__dot" style="background:${SERIES[1].color}"></span>
          <div class="feed__main">
            <p class="feed__title">${escapeHtml(itemsSummary(o))}</p>
            <p class="feed__meta">${o.neededBy === today ? 'Today' : 'Tomorrow'}, ${escapeHtml(BAKE.timeSlots[o.timeSlot] ?? '')} · ${escapeHtml(o.customer?.name ?? '')} · ${o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</p>
          </div>
          <span class="pill pill--${o.payment.status}">${PAY_STATUS[o.payment.status]}</span>
        </li>`).join('')}
    </ul>
    ${due.length > 5 ? `<p class="panel__note"><a href="preorders.html">See all ${due.length} in the production list</a></p>` : ''}`;
}

function renderFeed() {
  document.querySelector('[data-feed]').innerHTML = orders.slice(0, 6).map((o) => {
    const s = SERIES.find((x) => x.id === o.store);
    const when = dayOf(o) === today ? timeOf(o.createdAt) : `${formatDay(dayOf(o))}, ${timeOf(o.createdAt)}`;
    return `
      <li>
        <span class="feed__dot" style="background:${s.color}" title="${escapeHtml(s.name)}"></span>
        <div class="feed__main">
          <p class="feed__title">${escapeHtml(itemsSummary(o))}${o.recorded ? ' <span class="pill pill--neutral">Recorded here</span>' : ''}</p>
          <p class="feed__meta">${escapeHtml(when)} · ${escapeHtml(s.name)} · ${escapeHtml(CHANNELS[o.channel] ?? o.channel)} · ${escapeHtml(o.customer?.name || 'Walk-in customer')}</p>
        </div>
        <span class="feed__amount">${money(o.total)}</span>
      </li>`;
  }).join('');
}

function slotRank(o) {
  return String(Object.keys(BAKE.timeSlots).indexOf(o.timeSlot));
}
