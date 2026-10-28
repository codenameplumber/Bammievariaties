// Order confirmation (order.html?ref=…), shared by both stores and by occasion
// requests. Step 2 of 2: nothing reaches Bammie until the customer sends the
// WhatsApp message.
import { BUSINESS, BAKE } from '../config.js';
import { initPage, money, icon, escapeHtml, siteUrl, toast, copyText, whatsappUrl } from '../ui.js';
import { displayPhone } from '../customer.js';
import { getLocalOrder, markSent, whatsappMessage, whatsappOrderUrl, neededByText, FULFILMENT, PAYMENT } from '../orders.js';
import { formatDateTime } from '../dates.js';

const root = document.querySelector('[data-order]');

initPage();

const ref = new URLSearchParams(location.search).get('ref');
const order = ref ? getLocalOrder(ref) : null;

if (order) {
  document.body.classList.add(`theme-${order.store}`);
  render(Boolean(order.sentAt));
} else {
  renderNotFound();
}

function render(sent) {
  const store = BUSINESS.stores[order.store];
  const firstName = order.customer.name.split(/\s+/)[0];
  const isDelivery = order.fulfilment === 'delivery';
  const isRequest = order.type === 'request';
  const isBake = order.store === 'bake';
  const noun = isRequest ? 'request' : isBake ? 'pre-order' : 'order';

  const replyWith = isRequest ? 'with a quote'
    : ['to confirm it', isDelivery && 'the delivery fee', isBake && 'any deposit'].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1');

  root.innerHTML = `
    <section class="order-hero">
      <div class="container">
        <div class="progress" aria-label="Progress">
          <span class="progress__step is-done"><span class="progress__dot">${icon('check')}</span>${isRequest ? 'Your event' : 'Order details'}</span>
          <span class="progress__line" aria-hidden="true"></span>
          <span class="progress__step ${sent ? 'is-done' : 'is-current'}"><span class="progress__dot">${sent ? icon('check') : '2'}</span>Send on WhatsApp</span>
        </div>
        <h1>${sent ? `Thank you, ${escapeHtml(firstName)}!` : `Almost done, ${escapeHtml(firstName)}!`}</h1>
        <p>${sent
          ? `Your ${noun} has gone to WhatsApp. Bammie will reply ${isRequest ? 'with a quote' : 'to confirm it'}.`
          : `Send your ${noun} to Bammie on WhatsApp to ${isRequest ? 'get a quote' : 'place it'}.`}</p>
      </div>
    </section>

    <div class="container">
      <div class="order-body">
        <div class="card send-card${sent ? ' is-sent' : ''}">
          <p class="order-ref-line">${isRequest ? 'Request' : 'Order'} <span class="order-ref">${escapeHtml(order.ref)}</span></p>
          <a class="btn btn--whatsapp btn--lg btn--block" href="${whatsappOrderUrl(order)}" target="_blank" rel="noopener" data-send>
            ${icon('whatsapp')}${sent ? 'Open WhatsApp again' : `Send ${noun} on WhatsApp`}
          </a>
          ${sent ? '' : `
            <div class="notice">${icon('info')}<span>Your ${noun} isn't ${isRequest ? 'sent' : 'placed'} until you press <strong>send</strong> in WhatsApp. Bammie will reply ${replyWith}.</span></div>`}
          <div><button type="button" class="link-btn" data-copy>${icon('copy')}Copy ${noun} text</button></div>
        </div>

        ${isRequest ? requestCard() : itemsCard(isDelivery)}

        <section class="card" aria-labelledby="details-title">
          <h2 id="details-title" class="card__title">Details</h2>
          <dl class="detail-list">
            <dt>Store</dt><dd>${escapeHtml(store.name)}</dd>
            <dt>Placed</dt><dd>${formatDateTime(order.createdAt)}</dd>
            ${order.neededBy ? `<dt>${isRequest ? 'Event' : 'Needed on'}</dt><dd>${escapeHtml(neededByText(order))}</dd>` : ''}
            ${order.occasion && !isRequest ? `<dt>Occasion</dt><dd>${escapeHtml(order.occasion)}</dd>` : ''}
            ${order.cakeMessage ? `<dt>On the cake</dt><dd>“${escapeHtml(order.cakeMessage)}”</dd>` : ''}
            <dt>Getting it</dt><dd>${escapeHtml(FULFILMENT[order.fulfilment])}</dd>
            ${isDelivery ? `<dt>Address</dt><dd>${escapeHtml(order.customer.address)}, ${escapeHtml(order.customer.area)}</dd>` : ''}
            ${order.preferredTime ? `<dt>When</dt><dd>${escapeHtml(order.preferredTime)}</dd>` : ''}
            ${order.payment ? `<dt>Payment</dt><dd>${escapeHtml(PAYMENT[order.payment.method])}</dd>` : ''}
            <dt>Name</dt><dd>${escapeHtml(order.customer.name)}</dd>
            <dt>Phone</dt><dd>${escapeHtml(displayPhone(order.customer.phone))}</dd>
            ${order.note ? `<dt>Note</dt><dd>${escapeHtml(order.note)}</dd>` : ''}
          </dl>
        </section>

        ${order.payment?.method === 'transfer' ? paymentCard() : ''}

        <div class="order-actions">
          <a class="btn btn--outline theme-varieties" href="${siteUrl('varieties/')}">${icon('basket')}Varieties Store</a>
          <a class="btn btn--outline theme-bake" href="${siteUrl('bake/')}">${icon('cupcake')}Bake &amp; Cook</a>
        </div>
        <p class="order-actions"><a class="link-btn" href="${siteUrl('my-orders.html')}">${icon('receipt')}See all your orders</a></p>
      </div>
    </div>`;

  root.querySelector('[data-send]').addEventListener('click', () => {
    if (order.sentAt) return;
    markSent(order.ref);
    order.sentAt = new Date().toISOString();
    // Let WhatsApp open first, then show the "sent" state for when they come back.
    setTimeout(() => render(true), 600);
  });

  root.querySelector('[data-copy]').addEventListener('click', async () => {
    toast(await copyText(whatsappMessage(order))
      ? 'Copied. Paste it in a WhatsApp chat with Bammie.'
      : "Couldn't copy on this device.");
  });
}

function itemsCard(isDelivery) {
  return `
    <section class="card" aria-labelledby="items-title">
      <h2 id="items-title" class="card__title">What you ordered</h2>
      <ul class="summary-items" role="list">
        ${order.items.map((i) => `<li><span>${i.qty} × ${escapeHtml(i.name)} <span class="muted">(${escapeHtml(i.unit)}${i.batch ? ", this week's batch" : ''})</span></span><span>${money(i.price * i.qty)}</span></li>`).join('')}
      </ul>
      <div class="summary">
        <div class="summary__row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
        <div class="summary__row"><span>Delivery</span><span class="muted">${isDelivery ? 'Confirmed on WhatsApp' : 'Free (no delivery)'}</span></div>
        <div class="summary__row summary__row--total"><span>${isDelivery ? 'Total before delivery' : 'Total'}</span><span>${money(order.total)}</span></div>
        ${order.deposit ? `<div class="summary__row"><span>Deposit to secure your date</span><span>${money(order.deposit)}</span></div>` : ''}
      </div>
    </section>`;
}

function requestCard() {
  const r = order.request;
  return `
    <section class="card" aria-labelledby="request-title">
      <h2 id="request-title" class="card__title">What you're planning</h2>
      <dl class="detail-list">
        <dt>Occasion</dt><dd>${escapeHtml(r.eventType)}</dd>
        <dt>Guests</dt><dd>About ${escapeHtml(r.guests)}</dd>
        ${r.wants.length ? `<dt>You'd like</dt><dd>${escapeHtml(r.wants.join(', '))}</dd>` : ''}
        ${r.budget ? `<dt>Budget</dt><dd>${escapeHtml(r.budget)}</dd>` : ''}
        ${r.details ? `<dt>Details</dt><dd>${escapeHtml(r.details)}</dd>` : ''}
      </dl>
      <p class="summary__note card__after">No payment now. Bammie will send a quote${BAKE.depositPercent ? `, and a ${BAKE.depositPercent}% deposit secures your date` : ''}.</p>
    </section>`;
}

function paymentCard() {
  const bank = BUSINESS.bank;
  const deposit = order.deposit ? ` A deposit of <strong>${money(order.deposit)}</strong> secures your date.` : '';
  return `
    <section class="card" aria-labelledby="pay-title">
      <h2 id="pay-title" class="card__title">Paying by bank transfer</h2>
      ${bank ? `
        <dl class="detail-list">
          <dt>Bank</dt><dd>${escapeHtml(bank.bank)}</dd>
          <dt>Account name</dt><dd>${escapeHtml(bank.accountName)}</dd>
          <dt>Account number</dt><dd>${escapeHtml(bank.accountNumber)}</dd>
        </dl>
        <p class="summary__note card__after">Please wait for Bammie to confirm before you pay, and use <strong>${escapeHtml(order.ref)}</strong> as the transfer note.${deposit}</p>`
      : `<p class="muted">Bammie will send the account details when she confirms on WhatsApp. Please wait for that before you pay.${deposit}</p>`}
    </section>`;
}

function renderNotFound() {
  root.innerHTML = `
    <div class="container">
      <div class="empty">
        ${icon('receipt')}
        <h1>We can't find that order</h1>
        <p>Orders are saved on the phone they were placed from. If you placed it on another phone, check there, or message us on WhatsApp.</p>
        <div class="order-actions">
          <a class="btn btn--outline" href="${siteUrl('my-orders.html')}">${icon('receipt')}My orders</a>
          <a class="btn btn--brand" href="${siteUrl('varieties/')}">${icon('basket')}Go to the Varieties Store</a>
          <a class="btn btn--outline" href="${whatsappUrl("Hello Bammie! I'm asking about my order.")}" target="_blank" rel="noopener">${icon('whatsapp')}Ask on WhatsApp</a>
        </div>
      </div>
    </div>`;
}
