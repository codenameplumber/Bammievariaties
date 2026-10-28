// Turns cart lines into priced rows using the live catalogue, so the cart bar,
// cart page and checkout always agree on names, prices and what can be ordered.
import { MAX_QTY } from './cart.js';

// "2 days' notice", "1 day's notice", "Same day"
export function noticeText(days) {
  if (!days) return 'Same day';
  return days === 1 ? "1 day's notice" : `${days} days' notice`;
}

export function isBatchOpen(batch, now = new Date()) {
  return Boolean(batch?.items?.length) && new Date(batch.orderBy) > now;
}

export function batchItemFor(batch, id, option) {
  return batch?.items?.find((i) => i.itemId === id && i.option === option) ?? null;
}

// Each row: { line, product, known, name, detail, price, qty, total, icon,
//   available, problem, minQty, maxQty, leadTimeDays, readyOn, batchTitle, messageAllowed }
// known === false means the item (or option) is no longer sold and can be dropped.
export function resolveLines(store, lines, data, now = new Date()) {
  const byId = new Map(data.products.map((p) => [p.id, p]));
  const icons = new Map(data.categories.map((c) => [c.id, c.icon]));
  return lines.map((line) => {
    const product = byId.get(line.id) ?? null;
    const row = store === 'bake' ? bakeRow(line, product, data.batch, now) : varietiesRow(line, product);
    row.icon = product ? icons.get(product.category) : 'basket';
    row.total = row.price * line.qty;
    return row;
  });
}

function varietiesRow(line, product) {
  return {
    line,
    product,
    known: Boolean(product),
    name: product?.name ?? '',
    detail: product?.unit ?? '',
    price: product?.price ?? 0,
    qty: line.qty,
    available: Boolean(product?.inStock),
    problem: product && !product.inStock ? 'Out of stock right now' : null,
    minQty: 1,
    maxQty: MAX_QTY,
    leadTimeDays: null,
    readyOn: null,
    batchTitle: null,
    messageAllowed: false,
  };
}

function bakeRow(line, product, batch, now) {
  const option = product?.options.find((o) => o.id === line.option) ?? null;
  const fromBatch = Boolean(line.batch);
  const batchItem = fromBatch && batch?.id === line.batch ? batchItemFor(batch, line.id, line.option) : null;
  const batchOpen = Boolean(batchItem) && isBatchOpen(batch, now);

  let problem = null;
  if (product && !product.available) problem = 'Not available right now';
  else if (fromBatch && !batchOpen) problem = 'Orders for this batch have closed';

  return {
    line,
    product,
    known: Boolean(product && option),
    name: product?.name ?? '',
    detail: option?.label ?? '',
    price: option?.price ?? 0,
    qty: line.qty,
    available: Boolean(product && option) && !problem,
    problem,
    minQty: fromBatch ? 1 : product?.minQty ?? 1,
    maxQty: batchItem?.limit ?? MAX_QTY,
    leadTimeDays: fromBatch ? null : product?.leadTimeDays ?? 0,
    readyOn: batchOpen ? batch.readyOn : null,
    batchTitle: batchItem ? batch.title : null,
    messageAllowed: Boolean(product?.messageAllowed),
  };
}
