// What the admin starts with on its first visit (Phase 1 demo): the product lists
// with demo cost prices, and an order book of made-up orders in every state —
// new, confirmed, completed, cancelled, unpaid, deposit, paid — plus a few
// occasion requests, so each screen has something to work with.
import { generateDemoOrders } from './demo-data.js';
import { todayISO, addDays } from '../dates.js';

// Demo cost prices as a share of the selling price. The owner replaces these
// with her real costs in Products / Bake menu.
const VARIETIES_COST = { foodstuffs: 0.82, provisions: 0.85, 'bammie-chips': 0.45, stationery: 0.7, household: 0.8 };
const BAKE_COST = { snacks: 0.4, pastries: 0.5, 'small-chops': 0.55, cakes: 0.5, meals: 0.6 };
const round50 = (n) => Math.max(50, Math.round(n / 50) * 50);

export function withDemoCosts(store, catalogue) {
  if (store === 'varieties') {
    return { ...catalogue, products: catalogue.products.map((p) => ({ ...p, cost: p.cost ?? round50(p.price * (VARIETIES_COST[p.category] ?? 0.8)) })) };
  }
  return {
    ...catalogue,
    products: catalogue.products.map((p) => ({
      ...p,
      options: p.options.map((o) => ({ ...o, cost: o.cost ?? round50(o.price * (BAKE_COST[p.category] ?? 0.5)) })),
    })),
  };
}

// A stable 0–1 number per order, so the same order always gets the same state.
function chance(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function demoOrderBook(catalogues, now = new Date()) {
  const recent = new Date(now.getTime() - 36 * 3_600_000).toISOString();
  const today = todayISO();

  const orders = generateDemoOrders(catalogues, now, 120).map((o) => {
    const r = chance(o.ref);
    const order = { ...o, demo: true };
    if (o.store === 'varieties') {
      if (o.channel !== 'walk-in' && o.createdAt >= recent) {
        // Recent online orders are still being handled.
        order.status = r < 0.5 ? 'new' : r < 0.8 ? 'confirmed' : 'completed';
        order.payment = { ...o.payment, status: order.status === 'completed' || (order.status === 'confirmed' && r < 0.7) ? 'paid' : 'unpaid' };
      } else if (o.channel !== 'walk-in' && r < 0.03) {
        order.status = 'cancelled';
        order.payment = { ...o.payment, status: 'unpaid' };
      }
    } else if (o.status !== 'completed' && o.neededBy === today && r < 0.4) {
      order.status = 'ready';
    } else if (o.status === 'completed' && r < 0.02) {
      order.status = 'cancelled';
      order.payment = { ...o.payment, status: 'unpaid' };
    }
    return order;
  });

  return [...orders, ...demoRequests(now, today)];
}

function demoRequests(now, today) {
  const people = [
    ['Mrs Adebayo', '0000 000 1001', 'Birthday', 40, ['Small chops', 'Celebration cake'], '₦100,000 – ₦250,000', 'Gold and white theme, 2-tier cake'],
    ['Pastor Johnson', '0000 000 1021', 'Church or mosque event', 120, ['Jollof or fried rice', 'Small chops'], 'Above ₦250,000', 'Thanksgiving service, food for 120'],
    ['Ngozi Eze', '0000 000 1005', 'Naming ceremony', 60, ['Small chops', 'Meat pie & pastries', 'Puff-puff'], '₦50,000 – ₦100,000', null],
    ['Halima Sani', '0000 000 1012', 'Office or meeting', 25, ['Meat pie & pastries', 'Chin chin & snacks'], 'Under ₦50,000', 'Snack packs for a training day'],
    ['Femi Alade', '0000 000 1020', 'Wedding', 200, ['Celebration cake', 'Small chops', 'Jollof or fried rice'], 'Not sure yet', 'Asking for a quote first'],
  ];
  const states = [
    { status: 'requested' }, { status: 'quoted', quote: 380000 }, { status: 'requested' },
    { status: 'booked', quote: 42000 }, { status: 'declined' },
  ];
  return people.map(([name, phone, eventType, guests, wants, budget, details], i) => {
    const placed = new Date(now.getTime() - (i * 2 + 1) * 86_400_000 - 3_600_000 * (i + 2));
    const ymd = placed.toISOString().slice(2, 10).replaceAll('-', '');
    return {
      ref: `BC-${ymd}-Q${i + 1}RQ`,
      type: 'request',
      store: 'bake',
      channel: i % 2 ? 'whatsapp' : 'website',
      createdAt: placed.toISOString(),
      customer: { name, phone, address: null, area: null },
      items: [],
      subtotal: null,
      deliveryFee: null,
      total: states[i].quote ?? null,
      fulfilment: i % 2 ? 'pickup' : 'delivery',
      neededBy: addDays(today, 9 + i * 5),
      timeSlot: ['morning', 'afternoon', 'evening'][i % 3],
      occasion: eventType,
      request: { eventType, guests, wants, budget, details },
      payment: { method: 'transfer', status: states[i].status === 'booked' ? 'deposit' : 'unpaid' },
      status: states[i].status,
      note: null,
      demo: true,
    };
  });
}
