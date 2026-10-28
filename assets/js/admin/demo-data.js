// Made-up sales for the owner-tools prototype. Two years of believable orders are
// generated from the real catalogues (the same every time for a given day, so the
// numbers don't jump on refresh), and any sale recorded on this phone with
// "Record a sale" is added on top. No real customers or sales are in here; demo
// phone numbers start with 0000, which no real line uses.
import { read, write, remove } from '../storage.js';
import { toISODate, addDays, parseISODate } from '../dates.js';

const SALES_KEY = 'bammie.demo.sales';
const READY_KEY = 'bammie.demo.ready';
const DAYS = 730;
const AHEAD = 14; // pre-orders can be due up to two weeks out
const WEBSITE_SINCE_DAYS = 60; // the website is new, so website orders only appear recently

const REGULARS = [
  ['Mrs Adebayo', 14], ['Chidi Okeke', 9], ['Aisha Bello', 8], ['Tunde Bakare', 7], ['Ngozi Eze', 7],
  ['Mr Okafor', 6], ['Funmi Ade', 6], ['Ibrahim Musa', 5], ['Blessing John', 5], ['Kemi Lawal', 4],
  ['Emeka Obi', 4], ['Halima Sani', 4], ['Seun Ogunleye', 3], ['Uche Nwosu', 3], ['Yetunde Ajayi', 3],
  ['Mama Tobi', 3], ['Bisi Adeyemi', 2], ['Musa Danjuma', 2], ['Grace Peters', 2], ['Femi Alade', 2],
  ['Amaka Uzor', 2], ['Pastor Johnson', 2], ['Dayo Salami', 1], ['Rita Okon', 1],
].map(([name, weight], i) => ({ name, weight, phone: `0000 000 ${1001 + i}` }));

const ONE_OFF_NAMES = ['Joy', 'Ade', 'Ifeoma', 'Bola', 'Sani', 'Esther', 'Kunle', 'Chioma', 'Hauwa', 'Tobi', 'Nkechi', 'Lanre'];
const LANDMARKS = ['Near the market', 'Behind the church', 'By the estate gate', 'Main road junction', 'Off School Road'];

const VARIETIES_WEIGHT = {
  'indomie-single': 9, 'rice-derica': 7, 'plantain-chips-small': 7, 'garri-white-derica': 6,
  'evaporated-milk-tin': 5, 'honey-beans-derica': 4, 'seasoning-cubes': 4, 'table-water-pack': 4,
  'spaghetti-500g': 4, 'rice-5kg': 3, 'garri-yellow-derica': 3, 'plantain-chips-big': 3, 'potato-chips': 3,
  'sugar-1kg': 3, 'palm-oil-1l': 3, 'bar-soap-3': 3, 'indomie-carton': 2, 'cocoyam-chips': 2,
  'coconut-chips': 2, 'vegetable-oil-1l': 2, 'washing-powder-900g': 2, 'toilet-tissue-4': 2,
};
const BAKE_WEIGHT = {
  'chin-chin': 6, 'meat-pie': 6, 'puff-puff': 5, 'doughnuts': 3, 'sausage-roll': 3, 'small-chops-pack': 1,
  'loaf-cake': 3, 'cupcakes': 3, 'celebration-cake': 2, 'small-chops-tray': 1, 'jollof-tray': 1, 'fried-rice-tray': 1,
};
const VARIETIES_CHANNELS = [['walk-in', 62], ['whatsapp', 20], ['website', 10], ['tiktok', 5], ['call', 3]];
const BAKE_CHANNELS = [['whatsapp', 45], ['website', 28], ['tiktok', 15], ['call', 6], ['walk-in', 6]];
const SHOP_HOURS = [[7, 2], [8, 5], [9, 6], [10, 5], [11, 4], [12, 4], [13, 3], [14, 3], [15, 4], [16, 5], [17, 7], [18, 8], [19, 6], [20, 3]];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---- seeded randomness -------------------------------------------------------
function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let t = h >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// A weighted choice, with the running totals worked out once rather than per pick.
function picker(entries) {
  const values = [];
  const cumulative = [];
  let sum = 0;
  for (const [value, weight] of entries) {
    values.push(value);
    cumulative.push((sum += weight));
  }
  return (rand) => {
    const n = rand() * sum;
    let i = 0;
    while (cumulative[i] <= n) i++;
    return values[i];
  };
}

const PICK = {
  hour: picker(SHOP_HOURS),
  regular: picker(REGULARS.map((r) => [r, r.weight])),
  varietiesChannel: picker(VARIETIES_CHANNELS),
  varietiesChannelEarly: picker(VARIETIES_CHANNELS.filter(([c]) => c !== 'website')),
  bakeChannel: picker(BAKE_CHANNELS),
  bakeChannelEarly: picker(BAKE_CHANNELS.filter(([c]) => c !== 'website')),
  fulfilment: picker([['delivery', 45], ['pickup', 35], ['own-rider', 20]]),
  shopPayment: picker([['cash', 45], ['transfer', 35], ['pos', 20]]),
  onlinePayment: picker([['transfer', 80], ['pay-on-delivery', 10], ['pay-on-collection', 10]]),
  slot: picker([['morning', 4], ['afternoon', 4], ['evening', 2]]),
};

// ---- generation ----------------------------------------------------------------
export function demoOrders({ varieties, bake }, now = new Date()) {
  const today = toISODate(now);

  // Calendar worked out once: ISO date, weekday and local midnight for every day used.
  const start = addDays(today, -(DAYS - 1));
  const startDate = parseISODate(start);
  const calendar = [];
  for (let i = 0; i < DAYS + AHEAD; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    calendar.push({ iso: toISODate(d), dow: d.getDay(), month: d.getMonth(), midnight: d.getTime() });
  }

  const products = {
    varieties: picker(varieties.products.map((p) => [p, VARIETIES_WEIGHT[p.id] ?? 1])),
    varietiesSchool: picker(varieties.products.map((p) => [p, (VARIETIES_WEIGHT[p.id] ?? 1) * (p.category === 'stationery' ? 4 : 1)])),
    bake: picker(bake.products.filter((p) => BAKE_WEIGHT[p.id] && p.options?.length).map((p) => [p, BAKE_WEIGHT[p.id]])),
    options: new Map(bake.products.map((p) => [p.id, picker((p.options ?? []).map((o, idx) => [o, idx === 0 ? 3 : 1]))])),
  };

  const orders = [];
  for (let i = 0; i < DAYS; i++) {
    const day = calendar[i];
    const back = DAYS - 1 - i;
    const rand = seeded(day.iso);
    const growth = 0.7 + 0.5 * (1 - back / DAYS);
    const season = day.month === 11 ? 1.4 : day.month === 3 ? 1.15 : 1;
    const early = back > WEBSITE_SINCE_DAYS;
    const ctx = {
      rand, i, day, back, today, calendar,
      ymd: day.iso.slice(2).replaceAll('-', ''),
      pickProduct: day.month === 0 || day.month === 8 ? products.varietiesSchool : products.varieties, // stationery sells when school resumes
      pickVarietiesChannel: early ? PICK.varietiesChannelEarly : PICK.varietiesChannel,
      pickBakeChannel: early ? PICK.bakeChannelEarly : PICK.bakeChannel,
      products,
    };

    const nVarieties = Math.round([6, 11, 10, 10, 12, 15, 18][day.dow] * growth * season * (0.8 + rand() * 0.4));
    for (let n = 0; n < nVarieties; n++) orders.push(varietiesOrder(ctx));

    const nBake = Math.round([1, 1, 1.5, 2, 3.5, 4, 2.5][day.dow] * growth * season * (0.6 + rand() * 0.8));
    for (let n = 0; n < nBake; n++) orders.push(bakeOrder(ctx));
  }

  const nowIso = now.toISOString();
  const shown = orders.filter((o) => o.createdAt <= nowIso);
  return [...shown, ...recordedSales()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function customerFor(ctx, regularChance) {
  if (ctx.rand() < regularChance) {
    const c = PICK.regular(ctx.rand);
    return { name: c.name, phone: c.phone };
  }
  const name = ONE_OFF_NAMES[Math.floor(ctx.rand() * ONE_OFF_NAMES.length)];
  return { name, phone: `0000 000 ${9000 + Math.floor(ctx.rand() * 999)}` };
}

// Minutes after local midnight (one local Date per day; building one per order is slow).
function at(ctx, hour) {
  return new Date(ctx.day.midnight + (hour * 60 + Math.floor(ctx.rand() * 60)) * 60_000).toISOString();
}

function ref(ctx, prefix) {
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ALPHABET[Math.floor(ctx.rand() * ALPHABET.length)];
  return `${prefix}-${ctx.ymd}-${tail}`;
}

function varietiesOrder(ctx) {
  const { rand } = ctx;
  const channel = ctx.pickVarietiesChannel(rand);
  const lineCount = 1 + Math.floor(rand() ** 1.6 * 4);
  const items = [];
  let total = 0;
  for (let n = 0; n < lineCount; n++) {
    const p = ctx.pickProduct(rand);
    const qty = Math.ceil(rand() ** 2 * 3);
    const existing = items.find((x) => x.id === p.id);
    if (existing) existing.qty += qty;
    else items.push({ id: p.id, name: p.name, unit: p.unit, price: p.price, qty });
    total += p.price * qty;
  }
  const walkIn = channel === 'walk-in';
  const fulfilment = walkIn ? 'in-store' : PICK.fulfilment(rand);

  const order = {
    ref: ref(ctx, 'BV'),
    type: 'order',
    store: 'varieties',
    channel,
    createdAt: at(ctx, PICK.hour(rand)),
    customer: walkIn && rand() > 0.2 ? { name: null, phone: null } : customerFor(ctx, walkIn ? 0.7 : 0.8),
    items,
    subtotal: total,
    deliveryFee: 0,
    total,
    fulfilment,
    payment: { method: walkIn ? PICK.shopPayment(rand) : PICK.onlinePayment(rand), status: 'paid' },
    status: 'completed',
  };
  if (fulfilment === 'delivery') order.area = LANDMARKS[Math.floor(rand() * LANDMARKS.length)];
  return order;
}

function bakeOrder(ctx) {
  const { rand, products } = ctx;
  const lineCount = rand() < 0.7 ? 1 : 2;
  const items = [];
  let lead = 0;
  let hasCake = false;
  let total = 0;
  for (let n = 0; n < lineCount; n++) {
    const p = products.bake(rand);
    const option = products.options.get(p.id)(rand);
    const qty = p.minQty > 1 ? p.minQty + Math.floor(rand() * 3) * 5 : 1 + Math.floor(rand() ** 2 * 3);
    const existing = items.find((x) => x.id === p.id && x.option === option.id);
    if (existing) existing.qty += qty;
    else items.push({ id: p.id, name: p.name, unit: option.label, option: option.id, price: option.price, qty });
    total += option.price * qty;
    lead = Math.max(lead, p.leadTimeDays ?? 0);
    hasCake ||= Boolean(p.messageAllowed);
  }

  // Due after the notice period plus a few days; nearly half land on a Saturday.
  let due = Math.min(ctx.i + lead + Math.floor(rand() * 4), ctx.calendar.length - 1);
  if (rand() < 0.45) due = Math.min(due + ((6 - ctx.calendar[due].dow + 7) % 7), ctx.calendar.length - 1);
  const neededBy = ctx.calendar[due].iso;

  const customer = customerFor(ctx, 0.7);
  const done = neededBy < ctx.today;
  const status = done ? 'completed' : ctx.back <= 1 && rand() < 0.35 ? 'requested' : 'confirmed';
  const fulfilment = rand() < 0.4 ? 'delivery' : 'pickup';

  const order = {
    ref: ref(ctx, 'BC'),
    type: 'order',
    store: 'bake',
    channel: ctx.pickBakeChannel(rand),
    createdAt: at(ctx, 8 + Math.floor(rand() * 14)),
    customer,
    items,
    subtotal: total,
    deliveryFee: 0,
    total,
    fulfilment,
    neededBy,
    timeSlot: PICK.slot(rand),
    occasion: hasCake && rand() < 0.7 ? 'Birthday' : null,
    cakeMessage: hasCake && rand() < 0.8 ? `Happy birthday, ${customer.name.split(' ').pop()}!` : null,
    payment: { method: 'transfer', status: done ? 'paid' : status === 'requested' ? 'unpaid' : rand() < 0.5 ? 'deposit' : 'paid' },
    status,
  };
  if (fulfilment === 'delivery') order.area = LANDMARKS[Math.floor(rand() * LANDMARKS.length)];
  return order;
}

// ---- things the owner does on this phone ---------------------------------------
function recordedSales() {
  const sales = read(SALES_KEY, []);
  return Array.isArray(sales) ? sales.filter((s) => s && s.ref && s.createdAt && Array.isArray(s.items)) : [];
}

export function saveDemoSale(order) {
  write(SALES_KEY, [...recordedSales(), order]);
}

export function readyRefs() {
  return new Set(read(READY_KEY, []));
}

export function setReady(orderRef, ready) {
  const refs = readyRefs();
  if (ready) refs.add(orderRef);
  else refs.delete(orderRef);
  write(READY_KEY, [...refs]);
}

export function resetDemo() {
  remove(SALES_KEY);
  remove(READY_KEY);
}
