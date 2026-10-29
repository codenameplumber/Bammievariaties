// Bake & Cook checkout: one date for the whole pre-order. The earliest date is
// set by the item that needs the most notice; batch items fix the date to the
// batch's ready day. Saves the order and moves on to order.html → WhatsApp.
import { BAKE } from '../config.js';
import { getSettings } from '../settings.js';
import { initPage, money, icon, escapeHtml, siteUrl, storeIsOpen } from '../ui.js';
import { getCatalogue, placeOrder } from '../api.js';
import { getLines, clearCart } from '../cart.js';
import { resolveLines, noticeText } from '../lines.js';
import { loadCustomer, saveCustomer, forgetCustomer, normalisePhone, displayPhone } from '../customer.js';
import { makeRef } from '../orders.js';
import { todayISO, addDays, isISODate, formatDay, formatDayLong } from '../dates.js';
import { showErrors, clearErrorsOnEdit } from '../form.js';
import { timeSlotChoices, occasionOptions } from '../bake-form.js';

const STORE = 'bake';
const MAX_DAYS_AHEAD = 90;

const form = document.querySelector('[data-checkout]');
const status = document.querySelector('[data-status]');

initPage();
main();

async function main() {
  let data;
  try {
    data = await getCatalogue(STORE);
  } catch {
    status.innerHTML = `
      <div class="empty">
        ${icon('cupcake')}
        <h2>Checkout didn't load</h2>
        <p>Check your connection and refresh the page. Your pre-order is still saved on this phone.</p>
      </div>`;
    return;
  }

  const rows = resolveLines(STORE, getLines(STORE), data).filter((r) => r.available);
  if (!rows.length) {
    status.innerHTML = `
      <div class="empty">
        ${icon('cupcake')}
        <h2>Your pre-order is empty</h2>
        <p>Choose treats from this week's batch or the menu first.</p>
        <a class="btn btn--brand" href="./">${icon('cupcake')}See the menu</a>
      </div>`;
    return;
  }

  const items = rows.map((r) => ({
    id: r.line.id,
    name: r.name,
    unit: r.detail,
    option: r.line.option,
    ...(r.line.batch && { batch: r.line.batch }),
    price: r.price,
    qty: r.qty,
  }));
  const subtotal = rows.reduce((sum, r) => sum + r.total, 0);
  const deposit = getSettings().depositPercent ? Math.round((subtotal * getSettings().depositPercent) / 100) : null;

  // Date rules
  const today = todayISO();
  const menuRows = rows.filter((r) => !r.line.batch);
  const slowest = menuRows.reduce((a, r) => (!a || r.leadTimeDays > a.leadTimeDays ? r : a), null);
  const earliest = addDays(today, slowest?.leadTimeDays ?? 0);
  const latest = addDays(today, MAX_DAYS_AHEAD);
  const batchDate = rows.find((r) => r.readyOn)?.readyOn ?? null;
  const conflict = batchDate && earliest > batchDate;

  status.hidden = true;
  form.hidden = false;
  if (!storeIsOpen(STORE)) form.querySelector('[data-submit]').disabled = true; // paused in Settings

  form.querySelector('[data-summary-items]').innerHTML = rows
    .map((r) => `<li><span>${r.qty} × ${escapeHtml(r.name)} <span class="muted">(${escapeHtml(r.detail)})</span></span><span>${money(r.total)}</span></li>`)
    .join('');
  form.querySelector('[data-subtotal]').textContent = money(subtotal);
  form.querySelector('[data-total]').textContent = money(subtotal);
  form.querySelector('[data-pay-note]').innerHTML = `${icon('info')}<span>Pay by bank transfer after Bammie confirms your pre-order.${deposit ? ` A ${getSettings().depositPercent}% deposit (${money(deposit)}) secures your date.` : ''}</span>`;

  form.querySelector('[data-slots]').innerHTML = timeSlotChoices();
  form.querySelector('[data-occasions]').insertAdjacentHTML('beforeend', occasionOptions());
  form.querySelector('[data-cake-message]').hidden = !rows.some((r) => r.messageAllowed);

  const dateInput = form.elements.neededBy;
  if (batchDate) {
    form.querySelector('[data-date-picker]').hidden = true;
    dateInput.value = batchDate;
    const batchNote = form.querySelector('[data-batch-date]');
    batchNote.hidden = false;
    batchNote.innerHTML = `${icon('calendar')}<span>Your batch items will be ready on <strong>${formatDayLong(batchDate)}</strong>, so everything in this pre-order comes that day.</span>`;
  } else {
    dateInput.min = earliest;
    dateInput.max = latest;
    form.querySelector('[data-date-hint]').textContent = slowest?.leadTimeDays
      ? `Earliest: ${formatDay(earliest)}. ${slowest.name} needs ${noticeText(slowest.leadTimeDays)}.`
      : `Earliest: ${formatDay(earliest)}.`;
  }

  if (conflict) {
    const box = form.querySelector('[data-date-conflict]');
    box.hidden = false;
    box.innerHTML = `${icon('info')}<span>${escapeHtml(slowest.name)} needs ${noticeText(slowest.leadTimeDays)}, so it can't be ready with the batch on ${formatDay(batchDate)}. Remove it or the batch items, and order them separately. <a href="cart.html">Edit your pre-order</a></span>`;
    form.querySelector('[data-submit]').disabled = true;
  }

  prefill(loadCustomer());
  updateForFulfilment();
  clearErrorsOnEdit(form);

  form.addEventListener('change', (e) => {
    if (e.target.name === 'fulfilment') updateForFulfilment();
  });

  form.querySelector('[data-forget]').addEventListener('click', () => {
    forgetCustomer();
    form.reset();
    if (batchDate) dateInput.value = batchDate;
    form.querySelector('[data-saved-note]').hidden = true;
    updateForFulfilment();
    form.elements.name.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (conflict) return;
    const values = readForm();
    const errors = validate(values);
    showErrors(form, errors);
    if (Object.keys(errors).length) return;

    const submit = form.querySelector('[data-submit]');
    submit.disabled = true;

    const order = {
      ref: makeRef(STORE),
      type: 'order',
      store: STORE,
      channel: 'website',
      createdAt: new Date().toISOString(),
      customer: {
        name: values.name,
        phone: normalisePhone(values.phone),
        address: values.fulfilment === 'delivery' ? values.address : null,
        area: values.fulfilment === 'delivery' ? values.area : null,
      },
      items,
      subtotal,
      deliveryFee: null,
      total: subtotal,
      deposit,
      fulfilment: values.fulfilment,
      neededBy: values.neededBy,
      timeSlot: values.timeSlot,
      occasion: values.occasion || null,
      cakeMessage: values.cakeMessage || null,
      payment: { method: 'transfer', status: 'unpaid' },
      status: 'requested',
      note: values.note || null,
    };

    try {
      await placeOrder(order);
    } catch {
      submit.disabled = false;
      showErrors(form, { form: 'Something went wrong saving your pre-order. Please try again.' });
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
    clearCart(STORE);
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
    const fulfilment = form.elements.fulfilment.value;
    form.querySelector('[data-when="delivery"]').hidden = fulfilment !== 'delivery';
    form.querySelector('[data-delivery-fee]').textContent =
      fulfilment === 'delivery' ? 'Confirmed on WhatsApp'
        : fulfilment ? 'Free (no delivery)'
          : 'Depends on your choice';
  }

  function readForm() {
    const f = form.elements;
    return {
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      neededBy: batchDate ?? f.neededBy.value,
      timeSlot: f.timeSlot.value,
      occasion: f.occasion.value,
      cakeMessage: f.cakeMessage.value.trim(),
      fulfilment: f.fulfilment.value,
      address: f.address.value.trim(),
      area: f.area.value.trim(),
      note: f.note.value.trim(),
      remember: f.remember.checked,
    };
  }

  function validate(v) {
    const errors = {};
    if (v.name.length < 2) errors.name = 'Please enter your name.';
    if (!v.phone) errors.phone = 'Please enter your phone number.';
    else if (!normalisePhone(v.phone)) errors.phone = 'Enter a Nigerian number, e.g. 0803 123 4567.';
    if (!batchDate) {
      if (!isISODate(v.neededBy)) errors.neededBy = 'Choose the day you need it.';
      else if (v.neededBy < earliest) errors.neededBy = `The earliest we can have it ready is ${formatDay(earliest)}.`;
      else if (v.neededBy > latest) errors.neededBy = 'Please choose a day within the next 3 months.';
    }
    if (!v.timeSlot) errors.timeSlot = 'Choose a time of day.';
    if (!v.fulfilment) errors.fulfilment = 'Choose how you want to get your pre-order.';
    if (v.fulfilment === 'delivery') {
      if (v.address.length < 5) errors.address = 'Please enter the delivery address.';
      if (v.area.length < 2) errors.area = 'Please enter your area or a landmark.';
    }
    return errors;
  }
}
