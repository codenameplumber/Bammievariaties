// Settings: whether each store is taking orders, the WhatsApp number orders go to,
// phone lines, bank account, shop location and hours, pre-order rules, and a
// demo-data reset. The website reads these straight away (in this browser until
// the backend is connected).
import { getSettings, saveSettings, resetShop, loadShop } from '../api.js';
import { normalisePhone, displayPhone } from '../customer.js';
import { initShell, setBadges } from './shell.js';
import { toast, confirmAction, escapeHtml } from './common.js';

initShell();
setBadges((await loadShop()).orders);

const BANKS = [
  'Access Bank', 'Ecobank', 'Fidelity Bank', 'First Bank', 'FCMB', 'GTBank', 'Jaiz Bank', 'Keystone Bank', 'Kuda',
  'Moniepoint', 'Opay', 'PalmPay', 'Polaris Bank', 'Providus Bank', 'Stanbic IBTC', 'Sterling Bank', 'Union Bank',
  'UBA', 'Unity Bank', 'Wema Bank', 'Zenith Bank',
];
const NETWORKS = ['MTN', 'Glo', 'Airtel', '9mobile'];

const forms = Object.fromEntries([...document.querySelectorAll('[data-form]')].map((f) => [f.dataset.form, f]));
document.querySelectorAll('[data-networks]').forEach((s) => { s.innerHTML = NETWORKS.map((n) => `<option>${n}</option>`).join(''); });
document.querySelector('[data-banks]').innerHTML = '<option value="">Choose your bank…</option>' + BANKS.map((b) => `<option>${escapeHtml(b)}</option>`).join('');

fill();

function fill() {
  const s = getSettings();
  forms.status.elements.openVarieties.checked = s.open.varieties;
  forms.status.elements.openBake.checked = s.open.bake;

  const c = forms.contact.elements;
  c.whatsapp.value = displayPhone(s.whatsapp);
  const [p1 = {}, p2 = {}] = s.phones;
  c.phone1.value = p1.number ? displayPhone(p1.number) : '';
  c.net1.value = p1.network ?? 'MTN';
  c.phone2.value = p2.number ? displayPhone(p2.number) : '';
  c.net2.value = p2.network ?? 'Glo';
  c.email.value = s.email ?? '';
  c.tiktok.value = s.tiktok ?? '';
  updateTestLink();

  const b = forms.bank.elements;
  if (s.bank.bank && !BANKS.includes(s.bank.bank)) b.bank.insertAdjacentHTML('beforeend', `<option>${escapeHtml(s.bank.bank)}</option>`);
  b.bank.value = s.bank.bank ?? '';
  b.accountName.value = s.bank.accountName ?? '';
  b.accountNumber.value = s.bank.accountNumber ?? '';

  const sh = forms.shop.elements;
  sh.address.value = s.address ?? '';
  sh.area.value = s.area ?? '';
  sh.hours.value = s.hours ?? '';
  sh.mapUrl.value = s.mapUrl ?? '';

  const r = forms.rules.elements;
  r.depositPercent.value = s.depositPercent ?? 0;
  r.occasionLeadDays.value = s.occasionLeadDays ?? 3;
}

function updateTestLink() {
  const n = normalisePhone(forms.contact.elements.whatsapp.value);
  const link = document.querySelector('[data-test-wa]');
  link.href = n ? `https://wa.me/${n}?text=${encodeURIComponent('Test from the Bammie website settings')}` : '#';
  link.classList.toggle('disabled', !n);
}
forms.contact.elements.whatsapp.addEventListener('input', updateTestLink);

async function save(form, patch, message) {
  try {
    await saveSettings(patch);
    form.classList.remove('was-validated');
    toast(message);
  } catch (err) {
    toast(err.message, 'danger');
  }
}

forms.status.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = forms.status.elements;
  save(forms.status, { open: { varieties: f.openVarieties.checked, bake: f.openBake.checked } },
    `${f.openVarieties.checked ? 'Varieties Store open' : 'Varieties Store paused'} · ${f.openBake.checked ? 'Bake & Cook open' : 'Bake & Cook paused'}`);
});

forms.contact.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = forms.contact.elements;
  const wa = normalisePhone(f.whatsapp.value);
  const optionalPhone = (input) => {
    const ok = !input.value.trim() || Boolean(normalisePhone(input.value));
    input.setCustomValidity(ok ? '' : 'invalid');
    return ok;
  };
  f.whatsapp.setCustomValidity(wa ? '' : 'invalid');
  optionalPhone(f.phone1);
  optionalPhone(f.phone2);
  forms.contact.classList.add('was-validated');
  if (!forms.contact.checkValidity()) return;
  const phones = [[f.phone1, f.net1], [f.phone2, f.net2]]
    .filter(([p]) => p.value.trim())
    .map(([p, n]) => ({ number: '0' + normalisePhone(p.value).slice(3), network: n.value }));
  save(forms.contact, { whatsapp: wa, phones, email: f.email.value.trim(), tiktok: f.tiktok.value.trim().replace(/^@/, '') },
    `Saved. Orders now go to ${displayPhone(wa)} on WhatsApp.`);
});

forms.bank.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = forms.bank.elements;
  const number = f.accountNumber.value.replace(/\D/g, '');
  f.accountNumber.value = number;
  f.accountNumber.setCustomValidity(!number || number.length === 10 ? '' : 'invalid');
  forms.bank.classList.add('was-validated');
  if (!forms.bank.checkValidity()) return;
  save(forms.bank, { bank: { bank: f.bank.value, accountName: f.accountName.value.trim(), accountNumber: number } },
    number ? 'Bank details saved. Customers paying by transfer will see them.' : 'Bank details cleared.');
});

forms.shop.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = forms.shop.elements;
  forms.shop.classList.add('was-validated');
  if (!forms.shop.checkValidity()) return;
  save(forms.shop, { address: f.address.value.trim(), area: f.area.value.trim(), hours: f.hours.value.trim(), mapUrl: f.mapUrl.value.trim() }, 'Shop details saved.');
});

forms.rules.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = forms.rules.elements;
  forms.rules.classList.add('was-validated');
  if (!forms.rules.checkValidity()) return;
  save(forms.rules, { depositPercent: Number(f.depositPercent.value) || 0, occasionLeadDays: Number(f.occasionLeadDays.value) || 0 }, 'Pre-order rules saved.');
});

document.querySelector('[data-reset]').addEventListener('click', async () => {
  if (!(await confirmAction('Reset the demo? Your product edits, uploaded photos, recorded sales and orders in this browser will be removed. Settings stay.', { confirmLabel: 'Reset demo data', tone: 'danger' }))) return;
  const settings = getSettings();
  await resetShop();
  await saveSettings(settings);
  await loadShop();
  toast('Demo data reset.');
});
