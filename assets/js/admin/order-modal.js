// The order popup: everything about one order, and the buttons Bammie uses after
// sorting it out on WhatsApp — confirm, confirm payment (or deposit), mark ready,
// mark completed, cancel, send a quote — plus a private note and the history.
import { updateOrder } from '../api.js';
import {
  money, escapeHtml, displayPhone, kindOf, statusBadge, paymentBadge, storeDot, storeName, neededText,
  dateTime, PAYMENT_METHOD, CHANNEL, FULFILMENT, customerWhatsapp, whatsappMessageFor, toast, confirmAction,
} from './common.js';

let modal;
let el;

function ensureModal() {
  if (el) return;
  el = document.createElement('div');
  el.className = 'modal fade';
  el.id = 'orderModal';
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'orderModalTitle');
  el.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-scrollable modal-fullscreen-sm-down">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h2 class="modal-title h5 mb-1" id="orderModalTitle"></h2>
            <div class="d-flex flex-wrap gap-2" data-badges></div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body" data-body></div>
      </div>
    </div>`;
  document.body.append(el);
  modal = new bootstrap.Modal(el);
}

export function openOrderModal(order, { onChange } = {}) {
  ensureModal();
  let current = order;

  const apply = async (patch, note, message) => {
    current = await updateOrder(current.ref, patch, note);
    onChange?.(current);
    render();
    toast(message ?? note);
  };

  function render() {
    const o = current;
    const kind = kindOf(o);
    el.querySelector('#orderModalTitle').innerHTML = `${storeDot(o.store)}${kind === 'request' ? 'Occasion request' : 'Order'} ${escapeHtml(o.ref)}`;
    el.querySelector('[data-badges]').innerHTML = `${statusBadge(o)} ${paymentBadge(o)} <span class="badge-soft secondary">${escapeHtml(storeName(o.store))}</span>`;
    const wa = customerWhatsapp(o, whatsappMessageFor(o));

    el.querySelector('[data-body]').innerHTML = `
      <div class="row g-4">
        <div class="col-md-5">
          <h3 class="h6 text-muted">Customer</h3>
          <p class="mb-1 fw-semibold">${escapeHtml(o.customer?.name || 'Walk-in customer')}</p>
          <p class="mb-2">${o.customer?.phone ? escapeHtml(displayPhone(o.customer.phone)) : '<span class="text-muted">No phone number</span>'}</p>
          ${wa
            ? `<a class="btn btn-whatsapp btn-sm mb-3" href="${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>WhatsApp ${escapeHtml(o.customer.name?.split(' ')[0] || 'customer')}</a>`
            : '<p class="small text-muted mb-3">No WhatsApp number to message.</p>'}
          <dl class="detail-grid">
            <dt>Placed</dt><dd>${dateTime(o.createdAt)}</dd>
            <dt>Came in by</dt><dd>${escapeHtml(CHANNEL[o.channel] ?? o.channel)}</dd>
            ${o.neededBy ? `<dt>${kind === 'request' ? 'Event' : 'Needed on'}</dt><dd>${escapeHtml(neededText(o))}</dd>` : ''}
            <dt>Getting it</dt><dd>${escapeHtml(FULFILMENT[o.fulfilment] ?? o.fulfilment ?? '—')}</dd>
            ${o.fulfilment === 'delivery' ? `<dt>Address</dt><dd>${escapeHtml([o.customer?.address, o.customer?.area ?? o.area].filter(Boolean).join(', ') || '—')}</dd>` : ''}
            ${o.preferredTime ? `<dt>When</dt><dd>${escapeHtml(o.preferredTime)}</dd>` : ''}
            ${o.occasion && kind !== 'request' ? `<dt>Occasion</dt><dd>${escapeHtml(o.occasion)}</dd>` : ''}
            ${o.cakeMessage ? `<dt>On the cake</dt><dd>“${escapeHtml(o.cakeMessage)}”</dd>` : ''}
            ${o.note ? `<dt>Their note</dt><dd>${escapeHtml(o.note)}</dd>` : ''}
          </dl>
        </div>
        <div class="col-md-7">
          ${kind === 'request' ? requestDetails(o) : itemsTable(o)}
        </div>
      </div>
      <hr class="my-4">
      <h3 class="h6">Update this ${kind === 'request' ? 'request' : 'order'}</h3>
      ${kind === 'request' ? quoteForm(o) : ''}
      <div class="action-bar mb-3" data-actions>${actionButtons(o)}</div>
      ${o.payment && o.payment.status !== 'paid' && kind !== 'request' ? `
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3 small">
          <label for="payMethod" class="text-muted">Paid by</label>
          <select class="form-select form-select-sm w-auto" id="payMethod">
            ${['transfer', 'cash', 'pos'].map((m) => `<option value="${m}" ${o.payment.method === m ? 'selected' : ''}>${PAYMENT_METHOD[m]}</option>`).join('')}
          </select>
        </div>` : ''}
      <div class="mb-3">
        <label class="form-label" for="orderNote">Private note <span class="text-muted fw-normal">(only you see this)</span></label>
        <textarea class="form-control" id="orderNote" rows="2" maxlength="400">${escapeHtml(o.adminNote ?? '')}</textarea>
        <button type="button" class="btn btn-outline-primary btn-sm mt-2" data-save-note>Save note</button>
      </div>
      <h3 class="h6">History</h3>
      <ul class="timeline">
        <li>${dateTime(o.createdAt)}: ${o.recorded ? 'Recorded in the admin' : o.channel === 'website' ? 'Placed on the website' : 'Order placed'}</li>
        ${(o.history ?? []).map((h) => `<li>${dateTime(h.at)}: ${escapeHtml(h.note)}</li>`).join('')}
      </ul>`;

    el.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => act(btn.dataset.act)));
    el.querySelector('[data-save-note]').addEventListener('click', () =>
      apply({ adminNote: el.querySelector('#orderNote').value.trim() }, null, 'Note saved'));
    el.querySelector('[data-send-quote]')?.addEventListener('click', () => {
      const amount = Math.round(Number(el.querySelector('#quoteAmount').value));
      if (!amount || amount < 0) {
        el.querySelector('#quoteAmount').classList.add('is-invalid');
        return;
      }
      apply({ total: amount, status: 'quoted' }, `Quote set at ${money(amount)}`);
    });
  }

  async function act(action) {
    const o = current;
    const method = el.querySelector('#payMethod')?.value ?? o.payment?.method;
    const now = new Date().toISOString();
    switch (action) {
      case 'confirm': return apply({ status: 'confirmed' }, kindOf(o) === 'request' ? 'Request confirmed' : 'Order confirmed');
      case 'ready': return apply({ status: 'ready' }, 'Marked as ready');
      case 'complete': return apply({ status: 'completed' }, kindOf(o) === 'bake' ? 'Collected / delivered' : 'Order completed');
      case 'booked': return apply({ status: 'booked' }, 'Booked');
      case 'decline':
        if (!(await confirmAction('Mark this request as declined?', { confirmLabel: 'Decline', tone: 'danger' }))) return;
        return apply({ status: 'declined' }, 'Request declined');
      case 'cancel':
        if (!(await confirmAction(`Cancel order ${o.ref}? It will be left out of your sales.`, { confirmLabel: 'Cancel order', tone: 'danger' }))) return;
        return apply({ status: 'cancelled' }, 'Order cancelled');
      case 'reopen': return apply({ status: kindOf(o) === 'request' ? 'requested' : 'confirmed' }, 'Reopened');
      case 'paid': return apply({ payment: { ...o.payment, method, status: 'paid', paidAt: now } }, `Payment confirmed (${PAYMENT_METHOD[method] ?? method})`);
      case 'deposit': return apply({ payment: { ...o.payment, method, status: 'deposit', depositAt: now } }, `Deposit received (${PAYMENT_METHOD[method] ?? method})`);
      case 'unpaid': return apply({ payment: { ...o.payment, status: 'unpaid' } }, 'Payment marked as not received');
      default: return undefined;
    }
  }

  render();
  modal.show();
}

function itemsTable(o) {
  return `
    <h3 class="h6 text-muted">Items</h3>
    <table class="table table-sm items-table mb-2">
      <thead><tr><th>Item</th><th class="text-end">Qty</th><th class="text-end">Amount</th></tr></thead>
      <tbody>
        ${o.items.map((i) => `<tr><td>${escapeHtml(i.name)}<div class="cell-sub">${escapeHtml(i.unit ?? '')}${i.batch ? " · this week's batch" : ''}</div></td><td class="text-end">${i.qty}</td><td class="text-end">${money(i.price * i.qty)}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><th colspan="2" class="text-end">Total</th><th class="text-end">${money(o.total)}</th></tr>
      </tfoot>
    </table>
    <p class="small mb-1"><span class="text-muted">Payment:</span> ${escapeHtml(PAYMENT_METHOD[o.payment?.method] ?? '—')}${o.deposit ? ` · deposit asked ${money(o.deposit)}` : ''}</p>
    ${o.fulfilment === 'delivery' ? '<p class="small text-muted mb-0">Delivery fee is agreed on WhatsApp and is not in this total.</p>' : ''}`;
}

function requestDetails(o) {
  const r = o.request;
  return `
    <h3 class="h6 text-muted">What they're planning</h3>
    <dl class="detail-grid mb-2">
      <dt>Occasion</dt><dd>${escapeHtml(r.eventType)}</dd>
      <dt>Guests</dt><dd>About ${escapeHtml(r.guests)}</dd>
      ${r.wants?.length ? `<dt>Would like</dt><dd>${escapeHtml(r.wants.join(', '))}</dd>` : ''}
      ${r.budget ? `<dt>Budget</dt><dd>${escapeHtml(r.budget)}</dd>` : ''}
      ${r.details ? `<dt>Details</dt><dd>${escapeHtml(r.details)}</dd>` : ''}
      <dt>Quote</dt><dd>${o.total ? money(o.total) : '<span class="text-muted">Not sent yet</span>'}</dd>
    </dl>`;
}

function quoteForm(o) {
  if (!['requested', 'quoted'].includes(o.status)) return '';
  return `
    <div class="input-group mb-3" style="max-width: 360px">
      <span class="input-group-text">₦</span>
      <input type="number" class="form-control" id="quoteAmount" min="0" step="500" placeholder="Quote amount" value="${o.total ?? ''}" aria-label="Quote amount in naira">
      <button type="button" class="btn btn-outline-primary" data-send-quote>${o.status === 'quoted' ? 'Update quote' : 'Save quote'}</button>
    </div>`;
}

function actionButtons(o) {
  const kind = kindOf(o);
  const btn = (act, label, tone, icon) => `<button type="button" class="btn btn-${tone} btn-sm" data-act="${act}"><i class="bi ${icon} me-1"></i>${label}</button>`;
  const out = [];
  const finished = ['completed', 'cancelled', 'declined'].includes(o.status);

  if (kind === 'varieties') {
    if (o.status === 'new') out.push(btn('confirm', 'Confirm order', 'outline-primary', 'bi-check2'));
    if (!finished) out.push(btn('complete', 'Mark as completed', 'primary', 'bi-check2-all'));
  } else if (kind === 'bake') {
    if (o.status === 'requested') out.push(btn('confirm', 'Confirm pre-order', 'outline-primary', 'bi-check2'));
    if (['requested', 'confirmed'].includes(o.status)) out.push(btn('ready', 'Mark as ready', 'outline-primary', 'bi-box2-heart'));
    if (!finished) out.push(btn('complete', 'Collected / delivered', 'primary', 'bi-check2-all'));
  } else {
    if (o.status === 'quoted' || o.status === 'requested') out.push(btn('booked', 'Mark as booked', 'primary', 'bi-calendar-check'));
    if (!['declined', 'booked'].includes(o.status)) out.push(btn('decline', 'Decline', 'outline-danger', 'bi-x-circle'));
  }

  if (o.payment && kind !== 'request') {
    if (o.payment.status !== 'paid') out.push(btn('paid', 'Confirm full payment', 'success', 'bi-cash-coin'));
    if (kind === 'bake' && o.payment.status === 'unpaid') out.push(btn('deposit', 'Deposit received', 'outline-success', 'bi-piggy-bank'));
    if (o.payment.status !== 'unpaid') out.push(btn('unpaid', 'Mark as not paid', 'link text-muted', 'bi-arrow-counterclockwise'));
  }
  if (kind === 'request' && o.status === 'booked' && o.payment?.status === 'unpaid') out.push(btn('deposit', 'Deposit received', 'outline-success', 'bi-piggy-bank'));

  if (!finished && kind !== 'request') out.push(btn('cancel', 'Cancel order', 'outline-danger', 'bi-x-circle'));
  if (finished) out.push(btn('reopen', 'Reopen', 'outline-secondary', 'bi-arrow-repeat'));
  return out.join('');
}
