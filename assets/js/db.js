// The shop's own records while there is no backend (Phase 1): the product lists
// and weekly batch as the owner has edited them, and the order book. Shop pages
// fall back to data/*.json until the owner changes something in the admin.
// Everything here lives in this browser; Phase 2 moves it to the server, and
// api.js is the only file that talks to this module.
import { read, write, remove } from './storage.js';

const KEYS = {
  varieties: 'bammie.db.products.varieties',
  bake: 'bammie.db.products.bake',
  batch: 'bammie.db.batch',
  orders: 'bammie.db.orders',
  seeded: 'bammie.db.seeded',
  settings: 'bammie.db.settings',
};

// ---- catalogues & weekly batch ------------------------------------------------
export const storedCatalogue = (store) => read(KEYS[store], null);
export const saveCatalogue = (store, data) => write(KEYS[store], data);
export const storedBatch = () => read(KEYS.batch, null);
export const saveBatch = (batch) => write(KEYS.batch, batch);

// ---- order book -----------------------------------------------------------------
export function listOrders() {
  const orders = read(KEYS.orders, []);
  return Array.isArray(orders) ? orders : [];
}

export function addOrder(order) {
  return write(KEYS.orders, [order, ...listOrders().filter((o) => o.ref !== order.ref)]);
}

export function saveOrders(orders) {
  return write(KEYS.orders, orders);
}

// Change an order and note what happened, e.g. "Payment confirmed".
export function updateOrder(ref, patch, note) {
  const orders = listOrders();
  const i = orders.findIndex((o) => o.ref === ref);
  if (i === -1) return null;
  const order = { ...orders[i], ...patch };
  if (note) order.history = [...(order.history ?? []), { at: new Date().toISOString(), note }];
  orders[i] = order;
  write(KEYS.orders, orders);
  return order;
}

export const isSeeded = () => read(KEYS.seeded, false) === true;
export const markSeeded = () => write(KEYS.seeded, true);

// Everything the admin has saved in this browser, for "Reset demo data".
export function clearShopData() {
  Object.values(KEYS).forEach(remove);
}
