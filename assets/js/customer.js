// Details a customer chose to have remembered on this phone. No account needed:
// the phone number is what ties a customer's orders together.
import { read, write, remove } from './storage.js';

const KEY = 'bammie.customer';

export function loadCustomer() {
  return read(KEY, null);
}

export function saveCustomer(details) {
  write(KEY, { ...details, savedAt: new Date().toISOString() });
}

export function forgetCustomer() {
  remove(KEY);
}

// Nigerian mobile numbers in any common form → '234XXXXXXXXXX', or null.
export function normalisePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (/^0[789][01]\d{8}$/.test(digits)) return '234' + digits.slice(1);
  if (/^234[789][01]\d{8}$/.test(digits)) return digits;
  if (/^[789][01]\d{8}$/.test(digits)) return '234' + digits;
  return null;
}

// '2348108212867' or '08108212867' → '0810 821 2867'
export function displayPhone(input) {
  const n = normalisePhone(input);
  if (!n) return String(input ?? '');
  const local = '0' + n.slice(3);
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
