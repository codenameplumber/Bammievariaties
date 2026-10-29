// The one seam between the pages and where data lives.
// Phase 1: product lists come from /data/*.json until the owner edits them in the
// admin, and the order book, settings and edits are kept in this browser (db.js,
// settings.js). Phase 2 swaps these bodies for calls to the backend; the pages
// don't change.
import { saveLocalOrder } from './orders.js';
import {
  storedCatalogue, saveCatalogue, storedBatch, saveBatch, listOrders, addOrder,
  updateOrder as updateStoredOrder, saveOrders, isSeeded, markSeeded, clearShopData,
} from './db.js';
import { getSettings, saveSettings as storeSettings } from './settings.js';

export { getSettings };

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
    const [menu, batch] = await Promise.all([catalogueFor('bake'), storedBatch() ?? getJson('bake-batch.json')]);
    return { ...menu, batch: batch?.items?.length ? batch : null };
  }
  return catalogueFor('varieties');
}

const FILES = { varieties: 'varieties-products.json', bake: 'bake-menu.json' };

// The owner's edited list if there is one, else the data file.
async function catalogueFor(store) {
  const stored = storedCatalogue(store);
  return stored ? withFilePhotos(stored, FILES[store]) : getJson(FILES[store]);
}

// A list saved in this browser before the product photos were added has
// `image: null`; take those from the data file. An image of '' means the owner
// removed the photo on purpose.
async function withFilePhotos(catalogue, file) {
  if (!catalogue.products?.some((p) => p.image == null)) return catalogue;
  try {
    const photos = new Map((await getJson(file)).products.map((p) => [p.id, p.image]));
    return {
      ...catalogue,
      products: catalogue.products.map((p) => (p.image == null && photos.get(p.id) ? { ...p, image: photos.get(p.id) } : p)),
    };
  } catch {
    return catalogue;
  }
}

export async function placeOrder(order) {
  saveLocalOrder(order); // the customer's "My orders"
  addOrder(order);       // the shop's order book (Phase 2: sent to the server)
  return { ref: order.ref };
}

// ---- Owner tools ------------------------------------------------------------------

// The first visit to the admin copies the product lists in (with demo cost prices)
// and adds a demo order history, so every screen has something to show. Orders
// already placed on the website in this browser are kept.
export async function loadShop() {
  if (!isSeeded()) {
    const [varietiesFile, bakeFile, batchFile, seed] = await Promise.all([
      getJson('varieties-products.json'), getJson('bake-menu.json'), getJson('bake-batch.json'), import('./admin/seed.js'),
    ]);
    const varieties = storedCatalogue('varieties') ?? seed.withDemoCosts('varieties', varietiesFile);
    const bake = storedCatalogue('bake') ?? seed.withDemoCosts('bake', bakeFile);
    saveCatalogue('varieties', varieties);
    saveCatalogue('bake', bake);
    if (!storedBatch()) saveBatch(batchFile);
    const demo = seed.demoOrderBook({ varieties, bake }, new Date());
    saveOrders([...listOrders(), ...demo].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    markSeeded();
  }
  return {
    varieties: await catalogueFor('varieties'),
    bake: { ...(await catalogueFor('bake')), batch: storedBatch() },
    orders: listOrders(),
    settings: getSettings(),
  };
}

export async function updateOrder(ref, patch, note) {
  return updateStoredOrder(ref, patch, note);
}

export async function recordSale(order) {
  if (!addOrder(order)) throw new Error('This browser is out of storage space.');
  return { ref: order.ref };
}

export async function saveProducts(store, catalogue) {
  if (!saveCatalogue(store, catalogue)) throw new Error('This browser is out of storage space.');
}

export async function saveWeeklyBatch(batch) {
  if (!saveBatch(batch)) throw new Error('This browser is out of storage space.');
}

export async function saveSettings(patch) {
  if (!storeSettings(patch)) throw new Error('This browser is out of storage space.');
}

export async function resetShop() {
  clearShopData();
  const { clearImages } = await import('./idb.js');
  await clearImages().catch(() => {});
}
