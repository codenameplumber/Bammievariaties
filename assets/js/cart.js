// One cart per store: bammie.cart.varieties and bammie.cart.bake.
// A line is { id, qty } plus, for Bake & Cook, the chosen { option } and the
// { batch } it was ordered from. Names and prices always come from the live
// catalogue, so a price change never leaves a stale total in someone's cart.
import { read, write, remove } from './storage.js';

export const MAX_QTY = 99;

const keyFor = (store) => `bammie.cart.${store}`;

const sameLine = (line, id, variant) =>
  line.id === id
  && (line.option ?? null) === (variant.option ?? null)
  && (line.batch ?? null) === (variant.batch ?? null);

export function getLines(store) {
  const lines = read(keyFor(store), []);
  return Array.isArray(lines)
    ? lines.filter((l) => l && typeof l.id === 'string' && Number.isInteger(l.qty) && l.qty > 0)
    : [];
}

export function getQty(store, id, variant = {}) {
  return getLines(store).find((l) => sameLine(l, id, variant))?.qty ?? 0;
}

export function setQty(store, id, qty, variant = {}) {
  const next = Math.max(0, Math.min(MAX_QTY, Math.trunc(qty) || 0));
  const lines = getLines(store);
  const i = lines.findIndex((l) => sameLine(l, id, variant));
  if (next === 0) {
    if (i !== -1) lines.splice(i, 1);
  } else if (i === -1) {
    lines.push({ id, qty: next, ...(variant.option && { option: variant.option }), ...(variant.batch && { batch: variant.batch }) });
  } else {
    lines[i].qty = next;
  }
  write(keyFor(store), lines);
  announce(store);
  return next;
}

export function addQty(store, id, delta, variant = {}) {
  return setQty(store, id, getQty(store, id, variant) + delta, variant);
}

export function clearCart(store) {
  remove(keyFor(store));
  announce(store);
}

export function cartCount(store) {
  return getLines(store).reduce((n, l) => n + l.qty, 0);
}

function announce(store) {
  window.dispatchEvent(new CustomEvent('bammie:cart', { detail: { store } }));
}
