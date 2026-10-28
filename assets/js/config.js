// Business details used across the site. Anything still null is being collected
// from Bammie (PROJECT_MAP.md §10); pages leave out whatever is missing.

export const BUSINESS = {
  stores: {
    varieties: { name: 'Bammie Varieties Store', short: 'Varieties Store', refPrefix: 'BV' },
    bake: { name: 'Bammie Bake and Cook', short: 'Bake & Cook', refPrefix: 'BC' },
  },
  phones: [
    { number: '09155269214', network: 'Glo' },
    { number: '08108212867', network: 'MTN' },
  ],
  // TODO(confirm with Bammie): which line is WhatsApp Business. MTN is assumed for now.
  whatsapp: '2348108212867',
  email: null,
  address: null,   // e.g. '12 Market Road'
  area: null,      // e.g. 'Ikeja, Lagos'
  mapUrl: null,    // Google Maps share link
  hours: null,     // e.g. [{ days: 'Mon – Sat', time: '8am – 8pm' }]
  tiktok: null,    // handle without the @
  bank: null,      // { bank: '…', accountName: '…', accountNumber: '…' }
};

// Bake & Cook pre-order rules. TODO(confirm with Bammie): deposit, slots, notice for occasions.
export const BAKE = {
  depositPercent: null,   // e.g. 50 → the order page asks for a 50% deposit to confirm
  occasionLeadDays: 3,    // earliest event date for an occasion request, counted from today
  timeSlots: {
    morning: 'Morning (8am – 12pm)',
    afternoon: 'Afternoon (12pm – 4pm)',
    evening: 'Evening (4pm – 7pm)',
  },
  occasions: ['Weekend treat', 'Birthday', 'Wedding', 'Naming ceremony', 'Church or mosque event', 'Office or meeting', 'Party', 'Other'],
};

// Shows the "sample prices" bar until Bammie's real catalogue is in.
export const PREVIEW = true;

// Phase 2: the backend URL. While null, api.js reads /data/*.json and keeps orders
// on the customer's phone, and orders reach Bammie through WhatsApp.
export const API_BASE = null;
