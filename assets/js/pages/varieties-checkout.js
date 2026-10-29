// Varieties Store checkout: details, fulfilment (delivery / pickup / own rider),
// payment, remembered details. Saves the order and moves on to order.html,
// where the customer sends it to Bammie on WhatsApp.
import { initPage, money, icon, escapeHtml, siteUrl, storeIsOpen } from '../ui.js';
import { getCatalogue, placeOrder } from '../api.js';
import { getLines, clearCart } from '../cart.js';
import { resolveLines } from '../lines.js';
import { loadCustomer, saveCustomer, forgetCustomer, normalisePhone, displayPhone } from '../customer.js';
import { makeRef } from '../orders.js';
import { showErrors, clearErrorsOnEdit } from '../form.js';

const STORE = 'varieties';

// Which payment options make sense for each way of getting the order.
const PAYMENTS_FOR = {
  delivery: ['transfer', 'pay-on-delivery'],
  pickup: ['transfer', 'pay-on-collection'],
  'own-rider': ['transfer', 'pay-on-collection'],
};

const TIME_LABEL = {
  delivery: 'When should we deliver?',
  pickup: 'When will you come?',
  'own-rider': 'When will your rider come?',
};

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
        ${icon('cart')}
        <h2>Checkout didn't load</h2>
        <p>Check your connection and refresh the page. Your cart is still saved on this phone.</p>
      </div>`;
    return;
  }

  const items = resolveLines(STORE, getLines(STORE), data)
    .filter((r) => r.available)
    .map((r) => ({ id: r.line.id, name: r.name, unit: r.detail, price: r.price, qty: r.qty }));

  if (!items.length) {
    status.innerHTML = `
      <div class="empty">
        ${icon('cart')}
        <h2>Your cart is empty</h2>
        <p>Add a few things from the Varieties Store first.</p>
        <a class="btn btn--brand" href="./">${icon('basket')}Browse the store</a>
      </div>`;
    return;
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  status.hidden = true;
  form.hidden = false;
  if (!storeIsOpen(STORE)) form.querySelector('[data-submit]').disabled = true; // paused in Settings

  form.querySelector('[data-summary-items]').innerHTML = items
    .map((i) => `<li><span>${i.qty} × ${escapeHtml(i.name)} <span class="muted">(${escapeHtml(i.unit)})</span></span><span>${money(i.price * i.qty)}</span></li>`)
    .join('');
  form.querySelector('[data-subtotal]').textContent = money(subtotal);
  form.querySelector('[data-total]').textContent = money(subtotal);

  prefill(loadCustomer());
  updateForFulfilment();

  clearErrorsOnEdit(form);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'fulfilment') updateForFulfilment();
  });

  form.querySelector('[data-forget]').addEventListener('click', () => {
    forgetCustomer();
    form.reset();
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
      deliveryFee: null, // delivery fee is agreed on WhatsApp; null = not set yet
      total: subtotal,
      fulfilment: values.fulfilment,
      preferredTime: values.preferredTime || null,
      payment: { method: values.payment, status: 'unpaid' },
      status: 'new',
      note: values.note || null,
    };

    try {
      await placeOrder(order);
    } catch {
      submit.disabled = false;
      showErrors(form, { form: 'Something went wrong saving your order. Please try again.' });
      return;
    }

    if (values.remember) {
      saveCustomer({
        name: values.name,
        phone: displayPhone(values.phone),
        address: values.address,
        area: values.area,
        fulfilment: values.fulfilment,
        payment: values.payment,
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
    if (PAYMENTS_FOR[saved.fulfilment]) {
      form.querySelector(`input[name="fulfilment"][value="${saved.fulfilment}"]`).checked = true;
    }
    const pay = form.querySelector(`input[name="payment"][value="${CSS.escape(saved.payment ?? '')}"]`);
    if (pay) pay.checked = true;
    form.querySelector('[data-saved-note]').hidden = !(saved.name || saved.phone);
  }

  function updateForFulfilment() {
    const fulfilment = form.elements.fulfilment.value;
    const allowed = PAYMENTS_FOR[fulfilment] ?? ['transfer'];

    form.querySelector('[data-when="delivery"]').hidden = fulfilment !== 'delivery';
    form.querySelector('[data-time-label]').textContent = TIME_LABEL[fulfilment] ?? 'When do you want it?';

    form.querySelectorAll('[data-pay]').forEach((label) => {
      const ok = allowed.includes(label.dataset.pay);
      label.hidden = !ok;
      if (!ok) label.querySelector('input').checked = false;
    });

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
      fulfilment: f.fulfilment.value,
      address: f.address.value.trim(),
      area: f.area.value.trim(),
      preferredTime: f.preferredTime.value.trim(),
      payment: f.payment.value,
      note: f.note.value.trim(),
      remember: f.remember.checked,
    };
  }

  function validate(v) {
    const errors = {};
    if (v.name.length < 2) errors.name = 'Please enter your name.';
    if (!v.phone) errors.phone = 'Please enter your phone number.';
    else if (!normalisePhone(v.phone)) errors.phone = 'Enter a Nigerian number, e.g. 0803 123 4567.';
    if (!v.fulfilment) errors.fulfilment = 'Choose how you want to get your order.';
    if (v.fulfilment === 'delivery') {
      if (v.address.length < 5) errors.address = 'Please enter the delivery address.';
      if (v.area.length < 2) errors.area = 'Please enter your area or a landmark.';
    }
    if (!v.payment) errors.payment = 'Choose how you will pay.';
    return errors;
  }
}
