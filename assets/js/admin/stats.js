// Sums and rankings for the owner tools. Every figure is by the day an order
// was placed, so "today" means orders that came in today.
import { toISODate, addDays, parseISODate } from '../dates.js';

export const CHANNELS = {
  'walk-in': 'Walk-in',
  whatsapp: 'WhatsApp',
  website: 'Website',
  tiktok: 'TikTok',
  call: 'Phone call',
};

// Chart colours, validated for colour-blind separation (dataviz validator):
// green for Varieties, gold for Bake & Cook. Gold is light on white, so every
// chart also has a legend and a table view.
export const SERIES = [
  { id: 'varieties', name: 'Varieties Store', color: '#2A7A45' },
  { id: 'bake', name: 'Bake & Cook', color: '#D9A21B' },
];

const dayCache = new WeakMap();
export function dayOf(order) {
  let day = dayCache.get(order);
  if (!day) {
    day = toISODate(new Date(order.createdAt));
    dayCache.set(order, day);
  }
  return day;
}

export const sales = (orders) => orders.filter((o) => o.type !== 'request' && Number.isFinite(o.total));
export const between = (orders, from, to) => orders.filter((o) => { const d = dayOf(o); return d >= from && d <= to; });
export const forStore = (orders, store) => (store === 'all' ? orders : orders.filter((o) => o.store === store));

export function totals(orders) {
  return { count: orders.length, total: orders.reduce((s, o) => s + o.total, 0) };
}

// Percentage change, or null when there's nothing to compare against.
export function change(now, before) {
  return before > 0 ? Math.round(((now - before) / before) * 100) : null;
}

export function dailySeries(orders, from, to) {
  const days = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, { varieties: 0, bake: 0 });
  for (const o of orders) {
    const d = days.get(dayOf(o));
    if (d && o.store in d) d[o.store] += o.total;
  }
  return [...days].map(([key, values]) => ({ key, values }));
}

export function monthlySeries(orders, from, to) {
  const months = new Map();
  for (let d = from.slice(0, 7); d <= to.slice(0, 7); d = nextMonth(d)) months.set(d, { varieties: 0, bake: 0 });
  for (const o of orders) {
    const m = months.get(dayOf(o).slice(0, 7));
    if (m) m[o.store] += o.total;
  }
  return [...months].map(([key, values]) => ({ key, values }));
}

function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function byChannel(orders) {
  const map = new Map(Object.keys(CHANNELS).map((id) => [id, { id, name: CHANNELS[id], count: 0, total: 0 }]));
  for (const o of orders) {
    const row = map.get(o.channel);
    if (row) {
      row.count += 1;
      row.total += o.total;
    }
  }
  return [...map.values()].filter((r) => r.count).sort((a, b) => b.total - a.total);
}

export function topProducts(orders, n = 8) {
  const map = new Map();
  for (const o of orders) {
    for (const i of o.items) {
      const key = `${o.store}:${i.id}:${i.option ?? ''}`;
      const row = map.get(key) ?? { key, store: o.store, name: i.name, detail: i.unit, qty: 0, total: 0 };
      row.qty += i.qty;
      row.total += i.price * i.qty;
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

// Customers are matched by phone number; sales with no number aren't counted.
export function topCustomers(orders, n = 10) {
  const map = new Map();
  for (const o of orders) {
    const phone = o.customer?.phone;
    if (!phone) continue;
    const row = map.get(phone) ?? { phone, name: o.customer.name, count: 0, total: 0, last: o.createdAt };
    row.count += 1;
    row.total += o.total;
    if (o.createdAt > row.last) {
      row.last = o.createdAt;
      row.name = o.customer.name || row.name;
    }
    map.set(phone, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

export function uniqueCustomers(orders) {
  return new Set(orders.map((o) => o.customer?.phone).filter(Boolean)).size;
}

// Monday-start weeks, as most Nigerian businesses count them.
export function startOfWeek(iso) {
  const dow = (parseISODate(iso).getDay() + 6) % 7;
  return addDays(iso, -dow);
}
