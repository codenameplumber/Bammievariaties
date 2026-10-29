// Occasion request: event, date, guests and wishes. It has no price; it saves a
// BC- request and moves on to order.html, where it goes to Bammie on WhatsApp
// and she replies with a quote.
import { BAKE } from '../config.js';
import { getSettings } from '../settings.js';
import { initPage, siteUrl, storeIsOpen } from '../ui.js';
import { placeOrder } from '../api.js';
import { loadCustomer, saveCustomer, forgetCustomer, normalisePhone, displayPhone } from '../customer.js';
import { makeRef } from '../orders.js';
import { todayISO, addDays, isISODate, formatDay } from '../dates.js';
import { showErrors, clearErrorsOnEdit } from '../form.js';
import { timeSlotChoices, occasionOptions, wantChoices } from '../bake-form.js';

const STORE = 'bake';
const form = document.querySelector('[data-request]');
const earliest = addDays(todayISO(), getSettings().occasionLeadDays);
const latest = addDays(todayISO(), 365);

initPage();

form.querySelector('[data-occasions]').insertAdjacentHTML('beforeend', occasionOptions(BAKE.occasions.filter((o) => o !== 'Weekend treat')));
form.querySelector('[data-slots]').innerHTML = timeSlotChoices();
form.querySelector('[data-wants]').innerHTML = wantChoices();
form.elements.eventDate.min = earliest;
form.elements.eventDate.max = latest;
form.querySelector('[data-date-hint]').textContent = `Earliest: ${formatDay(earliest)}. We need at least ${getSettings().occasionLeadDays} days to plan an occasion.`;

prefill(loadCustomer());
updateForFulfilment();
if (!storeIsOpen(STORE)) form.querySelector('[data-submit]').disabled = true; // paused in Settings
clearErrorsOnEdit(form);

form.addEventListener('change', (e) => {
  if (e.target.name === 'fulfilment') updateForFulfilment();
});

form.querySelector('[data-forget]').addEventListener('click', () => {
  forgetCustomer();
  for (const name of ['name', 'phone', 'address', 'area']) form.elements[name].value = '';
  form.querySelectorAll('input[name="fulfilment"]').forEach((r) => { r.checked = false; });
  form.querySelector('[data-saved-note]').hidden = true;
  updateForFulfilment();
  form.elements.name.focus();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = readForm();
  const errors = validate(values);
  showErrors(form, errors);
  if (Object.keys(errors).length) return;

  const submit = form.querySelector('[data-submit]');
  submit.disabled = true;

  const order = {
    ref: makeRef(STORE),
    type: 'request',
    store: STORE,
    channel: 'website',
    createdAt: new Date().toISOString(),
    customer: {
      name: values.name,
      phone: normalisePhone(values.phone),
      address: values.fulfilment === 'delivery' ? values.address : null,
      area: values.fulfilment === 'delivery' ? values.area : null,
    },
    items: [],
    subtotal: null, // priced by Bammie's quote
    deliveryFee: null,
    total: null,
    fulfilment: values.fulfilment,
    neededBy: values.eventDate,
    timeSlot: values.timeSlot,
    occasion: values.eventType,
    request: {
      eventType: values.eventType,
      guests: values.guests,
      wants: values.wants,
      budget: values.budget || null,
      details: values.details || null,
    },
    payment: null,
    status: 'requested',
    note: null,
  };

  try {
    await placeOrder(order);
  } catch {
    submit.disabled = false;
    showErrors(form, { form: 'Something went wrong saving your request. Please try again.' });
    return;
  }

  if (values.remember) {
    saveCustomer({
      ...loadCustomer(),
      name: values.name,
      phone: displayPhone(values.phone),
      address: values.address,
      area: values.area,
      fulfilment: values.fulfilment,
    });
  } else {
    forgetCustomer();
  }
  location.href = siteUrl(`order.html?ref=${encodeURIComponent(order.ref)}`);
});

function prefill(saved) {
  if (!saved) return;
  const f = form.elements;
  f.name.value = saved.name ?? '';
  f.phone.value = saved.phone ?? '';
  f.address.value = saved.address ?? '';
  f.area.value = saved.area ?? '';
  if (saved.fulfilment === 'delivery' || saved.fulfilment === 'pickup') {
    form.querySelector(`input[name="fulfilment"][value="${saved.fulfilment}"]`).checked = true;
  }
  form.querySelector('[data-saved-note]').hidden = !(saved.name || saved.phone);
}

function updateForFulfilment() {
  form.querySelector('[data-when="delivery"]').hidden = form.elements.fulfilment.value !== 'delivery';
}

function readForm() {
  const f = form.elements;
  return {
    eventType: f.eventType.value,
    guests: Number(f.guests.value),
    eventDate: f.eventDate.value,
    timeSlot: f.timeSlot.value,
    wants: [...form.querySelectorAll('input[name="wants"]:checked')].map((c) => c.value),
    details: f.details.value.trim(),
    budget: f.budget.value,
    name: f.name.value.trim(),
    phone: f.phone.value.trim(),
    fulfilment: f.fulfilment.value,
    address: f.address.value.trim(),
    area: f.area.value.trim(),
    remember: f.remember.checked,
  };
}

function validate(v) {
  const errors = {};
  if (!v.eventType) errors.eventType = 'Choose the occasion.';
  if (!Number.isInteger(v.guests) || v.guests < 1 || v.guests > 2000) errors.guests = 'Enter the number of guests (1 to 2,000).';
  if (!isISODate(v.eventDate)) errors.eventDate = 'Choose the date of your event.';
  else if (v.eventDate < earliest) errors.eventDate = `The earliest date we can plan for is ${formatDay(earliest)}.`;
  else if (v.eventDate > latest) errors.eventDate = 'Please choose a date within the next year.';
  if (!v.timeSlot) errors.timeSlot = 'Choose when you need it ready.';
  if (!v.wants.length && !v.details) errors.wants = "Tick at least one thing, or tell us what you'd like below.";
  if (v.name.length < 2) errors.name = 'Please enter your name.';
  if (!v.phone) errors.phone = 'Please enter your phone number.';
  else if (!normalisePhone(v.phone)) errors.phone = 'Enter a Nigerian number, e.g. 0803 123 4567.';
  if (!v.fulfilment) errors.fulfilment = 'Choose delivery or pickup.';
  if (v.fulfilment === 'delivery') {
    if (v.address.length < 5) errors.address = 'Please enter the venue address.';
    if (v.area.length < 2) errors.area = 'Please enter the area or a landmark.';
  }
  return errors;
}
