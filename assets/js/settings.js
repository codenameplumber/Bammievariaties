// Business settings the owner edits in Admin → Settings: the WhatsApp number
// orders go to, phone lines, bank details, location, pre-order rules and whether
// each store is taking orders. Defaults come from config.js. Phase 1 keeps the
// owner's changes in this browser; Phase 2 loads them from the backend.
import { BUSINESS, BAKE } from './config.js';
import { read, write } from './storage.js';

const KEY = 'bammie.db.settings';

export const DEFAULT_SETTINGS = {
  whatsapp: BUSINESS.whatsapp,          // international format, e.g. 2348108212867
  phones: BUSINESS.phones,              // [{ number: '0810…', network: 'MTN' }]
  email: BUSINESS.email ?? '',
  tiktok: BUSINESS.tiktok ?? '',
  address: BUSINESS.address ?? '',
  area: BUSINESS.area ?? '',
  mapUrl: BUSINESS.mapUrl ?? '',
  hours: '',                            // free text, e.g. "Mon – Sat, 8am – 8pm"
  bank: { bank: '', accountName: '', accountNumber: '' },
  depositPercent: BAKE.depositPercent ?? 0,
  occasionLeadDays: BAKE.occasionLeadDays,
  open: { varieties: true, bake: true },
};

export function getSettings() {
  const saved = read(KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    bank: { ...DEFAULT_SETTINGS.bank, ...saved.bank },
    open: { ...DEFAULT_SETTINGS.open, ...saved.open },
  };
}

export function saveSettings(patch) {
  const current = read(KEY, {});
  return write(KEY, { ...current, ...patch });
}

export const hasBankDetails = (s = getSettings()) => Boolean(s.bank.bank && s.bank.accountName && s.bank.accountNumber);
