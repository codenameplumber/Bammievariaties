// Calendar dates as 'YYYY-MM-DD' strings in the customer's local time (never
// toISOString, which is UTC and can be a day off in the evening).

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function daysBetween(fromISO, toISO) {
  return Math.round((parseISODate(toISO) - parseISODate(fromISO)) / 86_400_000);
}

// 'Sat, 31 Oct'
export function formatDay(iso) {
  return parseISODate(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
}

// 'Saturday, 31 October'
export function formatDayLong(iso) {
  return parseISODate(iso).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });
}

// 'Thu, 29 Oct, 6:00 pm'
export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}
