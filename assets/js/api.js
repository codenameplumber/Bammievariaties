// The one seam between the pages and where data lives.
// Phase 1: catalogues come from /data/*.json and orders stay on the customer's
// phone (they reach Bammie through WhatsApp). Phase 2 swaps these bodies for
// calls to API_BASE; nothing else in the site has to change.
import { saveLocalOrder } from './orders.js';

const DATA = new URL('../../data/', import.meta.url);
const cache = new Map();

function getJson(file) {
  if (!cache.has(file)) {
    cache.set(file, fetch(new URL(file, DATA)).then((res) => {
      if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
      return res.json();
    }));
  }
  return cache.get(file);
}

// Varieties → { categories, products }
// Bake      → { categories, products, batch } (batch is this week's, or null)
export async function getCatalogue(store) {
  if (store === 'bake') {
    const [menu, batch] = await Promise.all([getJson('bake-menu.json'), getJson('bake-batch.json')]);
    return { ...menu, batch: batch?.items?.length ? batch : null };
  }
  return getJson('varieties-products.json');
}

export async function placeOrder(order) {
  saveLocalOrder(order);
  return { ref: order.ref };
}

// ---- Owner tools ----------------------------------------------------------------
// Phase 1: generated demo orders plus sales recorded on this phone (loaded only by
// admin pages). Phase 2: the backend's real orders, behind a login.

export async function getAdminOrders() {
  const [varieties, bake, demo] = await Promise.all([getCatalogue('varieties'), getCatalogue('bake'), import('./admin/demo-data.js')]);
  return demo.demoOrders({ varieties, bake });
}

export async function recordSale(order) {
  const demo = await import('./admin/demo-data.js');
  demo.saveDemoSale(order);
  return { ref: order.ref };
}

export async function getReadyRefs() {
  return (await import('./admin/demo-data.js')).readyRefs();
}

export async function setOrderReady(ref, ready) {
  (await import('./admin/demo-data.js')).setReady(ref, ready);
}

export async function resetDemo() {
  (await import('./admin/demo-data.js')).resetDemo();
}
