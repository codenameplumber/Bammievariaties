// Order references, the copy of each order kept on this phone, and the
// WhatsApp message that carries an order to Bammie.
import { BUSINESS, BAKE } from './config.js';
import { read, write, remove } from './storage.js';
import { money, whatsappUrl } from './ui.js';
import { displayPhone } from './customer.js';
import { formatDayLong } from './dates.js';

const KEY = 'bammie.orders';
const KEEP = 50;

// No 0/O or 1/I, so a ref read out over the phone can't be misheard.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const FULFILMENT = {
  delivery: 'Deliver to me',
  pickup: "I'll pick it up at the shop",
  'own-rider': "I'll send my rider",
};

export const PAYMENT = {
  transfer: 'Bank transfer',
  'pay-on-collection': 'Cash or POS when collecting',
  'pay-on-delivery': 'Pay on delivery',
};

// BV-261027-4F7K: store prefix, date (YYMMDD), 4 random characters.
export function makeRef(store, date = new Date()) {
  const prefix = BUSINESS.stores[store].refPrefix;
  const ymd = [date.getFullYear() % 100, date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${prefix}-${ymd}-${tail}`;
}

export function listLocalOrders() {
  const orders = read(KEY, []);
  return Array.isArray(orders) ? orders : [];
}

export function getLocalOrder(ref) {
  return listLocalOrders().find((o) => o.ref === ref) ?? null;
}

export function saveLocalOrder(order) {
  const orders = listLocalOrders().filter((o) => o.ref !== order.ref);
  orders.unshift(order);
  write(KEY, orders.slice(0, KEEP));
}

export function clearLocalOrders() {
  remove(KEY);
}

export function markSent(ref) {
  const orders = listLocalOrders();
  const order = orders.find((o) => o.ref === ref);
  if (!order || order.sentAt) return;
  order.sentAt = new Date().toISOString();
  write(KEY, orders);
}

// 'Saturday, 31 October, Morning (8am – 12pm)', for Bake & Cook dates.
export function neededByText(order) {
  if (!order.neededBy) return null;
  return [formatDayLong(order.neededBy), BAKE.timeSlots[order.timeSlot]].filter(Boolean).join(', ');
}

export function whatsappMessage(order) {
  const lines = order.type === 'request' ? requestLines(order) : orderLines(order);
  lines.push('', `Getting it: ${FULFILMENT[order.fulfilment]}`);
  if (order.fulfilment === 'delivery') {
    lines.push(`Address: ${order.customer.address}, ${order.customer.area}`);
  }
  if (order.preferredTime) lines.push(`When: ${order.preferredTime}`);
  if (order.payment) lines.push(`Payment: ${PAYMENT[order.payment.method]}`);
  lines.push('', `Name: ${order.customer.name}`, `Phone: ${displayPhone(order.customer.phone)}`);
  if (order.note) lines.push(`Note: ${order.note}`);
  return lines.join('\n');
}

function orderLines(order) {
  const lines = [
    order.store === 'bake' ? `Hello Bammie! I'd like to place a pre-order.` : `Hello Bammie! I'd like to place an order.`,
    '',
    `Order: ${order.ref}`,
    `Store: ${BUSINESS.stores[order.store].name}`,
  ];
  if (order.neededBy) lines.push(`Needed on: ${neededByText(order)}`);
  lines.push(
    '',
    ...order.items.map((i) => `• ${i.qty} × ${i.name}${i.unit ? ` (${i.unit})` : ''}${i.batch ? ', from this week\'s batch' : ''} — ${money(i.price * i.qty)}`),
    '',
    `Subtotal: ${money(order.subtotal)}`,
  );
  if (order.fulfilment === 'delivery') lines.push('Delivery fee: please confirm');
  if (order.occasion) lines.push(`Occasion: ${order.occasion}`);
  if (order.cakeMessage) lines.push(`Message on the cake: "${order.cakeMessage}"`);
  return lines;
}

function requestLines(order) {
  const r = order.request;
  const lines = [
    `Hello Bammie! I'd like a quote for an occasion.`,
    '',
    `Request: ${order.ref}`,
    `Event: ${r.eventType}`,
    `Date: ${neededByText(order)}`,
    `Guests: about ${r.guests}`,
  ];
  if (r.wants.length) lines.push(`I'd like: ${r.wants.join(', ')}`);
  if (r.budget) lines.push(`Budget: ${r.budget}`);
  if (r.details) lines.push(`Details: ${r.details}`);
  return lines;
}

export function whatsappOrderUrl(order) {
  return whatsappUrl(whatsappMessage(order));
}
