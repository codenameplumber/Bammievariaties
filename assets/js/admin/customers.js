// Customers: everyone who ordered with a phone number, from both stores, ranked by
// what they've spent (completed orders) — the list for end-of-season gifts.
import { loadShop } from '../api.js';
import { initShell, setBadges } from './shell.js';
import { openOrderModal } from './order-modal.js';
import { completedSales } from './stats.js';
import { normalisePhone } from '../customer.js';
import {
  money, escapeHtml, displayPhone, storeDot, statusBadge, itemsSummary, dateShort, dataTable, col, statCard,
  toast, downloadCsv, kindOf, storeName,
} from './common.js';

initShell();

let all = (await loadShop()).orders;
setBadges(all);

function buildCustomers() {
  const map = new Map();
  for (const o of all) {
    const phone = o.customer?.phone;
    if (!phone) continue;
    const key = normalisePhone(phone) ?? phone.replace(/\D/g, '');
    const c = map.get(key) ?? { key, phone, name: o.customer.name, orders: [], spent: 0, count: 0, stores: new Set(), last: o.createdAt };
    c.orders.push(o);
    c.stores.add(o.store);
    if (o.type !== 'request' && o.status === 'completed') {
      c.spent += o.total;
      c.count += 1;
    }
    if (o.createdAt >= c.last) {
      c.last = o.createdAt;
      c.name = o.customer.name || c.name;
    }
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent).map((c, i) => ({ ...c, rank: i + 1 }));
}

let customers = buildCustomers();

const table = dataTable('#customersTable', {
  data: [],
  order: [[0, 'asc']],
  columns: [
    col((c) => (c.rank <= 10 ? `<span class="badge-soft warning">${c.rank}</span>` : c.rank), (c) => c.rank, { responsivePriority: 3 }),
    col((c) => `<div class="cell-main">${escapeHtml(c.name || 'No name')}</div>`, (c) => c.name ?? '', { responsivePriority: 1 }),
    col((c) => escapeHtml(displayPhone(c.phone)), (c) => c.phone),
    col((c) => c.count, (c) => c.count),
    col((c) => `<span class="fw-semibold">${money(c.spent)}</span>`, (c) => c.spent, { responsivePriority: 2 }),
    col((c) => [...c.stores].map((s) => `${storeDot(s)}${escapeHtml(storeName(s))}`).join('<br>'), (c) => [...c.stores].join(' ')),
    col((c) => dateShort(c.last), (c) => c.last),
    col((c) => {
      const wa = normalisePhone(c.phone);
      return `<div class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-primary" data-view="${escapeHtml(c.key)}">Orders</button>
        ${wa ? `<a class="btn btn-whatsapp" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="WhatsApp ${escapeHtml(c.name ?? '')}"><i class="bi bi-whatsapp"></i></a>` : ''}
      </div>`;
    }, () => '', { orderable: false, className: 'text-end', responsivePriority: 1 }),
  ],
});

const modalEl = document.getElementById('customerModal');
const modal = new bootstrap.Modal(modalEl);

$('#customersTable').on('click', '[data-view]', (e) => showCustomer(customers.find((c) => c.key === e.currentTarget.dataset.view)));
modalEl.addEventListener('click', (e) => {
  const ref = e.target.closest('[data-open]')?.dataset.open;
  const order = ref && all.find((o) => o.ref === ref);
  if (!order) return;
  modal.hide();
  openOrderModal(order, { onChange: (o) => { all = all.map((x) => (x.ref === o.ref ? o : x)); setBadges(all); customers = buildCustomers(); render(); } });
});

document.querySelector('[data-copy-gifts]').addEventListener('click', async () => {
  const lines = customers.slice(0, 10).map((c) => `${c.rank}. ${c.name || 'No name'} — ${displayPhone(c.phone)} — ${money(c.spent)} (${c.count} orders)`);
  try {
    await navigator.clipboard.writeText(`Bammie top customers\n${lines.join('\n')}`);
    toast('Top 10 copied. Paste it into your notes or WhatsApp.');
  } catch {
    toast("Couldn't copy on this device.", 'danger');
  }
});
document.querySelector('[data-export]').addEventListener('click', () => downloadCsv('bammie-customers.csv',
  ['Rank', 'Customer', 'Phone', 'Completed orders', 'Total spent', 'Stores', 'Last order'],
  customers.map((c) => [c.rank, c.name ?? '', displayPhone(c.phone), c.count, c.spent, [...c.stores].map(storeName).join(' + '), dateShort(c.last)])));

render();

function render() {
  table.clear().rows.add(customers).draw(false);
  const sales = completedSales(all);
  const named = sales.filter((o) => o.customer?.phone);
  const both = customers.filter((c) => c.stores.size > 1).length;
  const top = customers[0];
  document.querySelector('[data-stats]').innerHTML = [
    statCard({ icon: 'bi-people', tone: 'green', label: 'Customers', value: customers.length, sub: 'With a phone number' }),
    statCard({ icon: 'bi-trophy', tone: 'gold', label: 'Top customer', value: escapeHtml(top?.name ?? '—'), sub: top ? `${money(top.spent)} · ${top.count} orders` : '' }),
    statCard({ icon: 'bi-shop', tone: 'brown', label: 'Buy from both stores', value: both, sub: 'Varieties and Bake & Cook' }),
    statCard({ icon: 'bi-person-check', tone: 'blue', label: 'Sales with a number', value: `${sales.length ? Math.round((named.length / sales.length) * 100) : 0}%`, sub: 'Ask walk-ins for a number to count them' }),
  ].join('');
}

function showCustomer(c) {
  const wa = normalisePhone(c.phone);
  modalEl.querySelector('#customerModalTitle').textContent = c.name || displayPhone(c.phone);
  modalEl.querySelector('[data-customer-body]').innerHTML = `
    <div class="d-flex flex-wrap gap-3 align-items-center mb-3">
      <div><div class="text-muted small">Phone</div><div class="fw-semibold">${escapeHtml(displayPhone(c.phone))}</div></div>
      <div><div class="text-muted small">Spent</div><div class="fw-semibold">${money(c.spent)}</div></div>
      <div><div class="text-muted small">Completed orders</div><div class="fw-semibold">${c.count}</div></div>
      <div><div class="text-muted small">Rank</div><div class="fw-semibold">#${c.rank}</div></div>
      ${wa ? `<a class="btn btn-whatsapp btn-sm ms-auto" href="https://wa.me/${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>WhatsApp</a>` : ''}
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>Order</th><th>Store</th><th>Items</th><th class="text-end">Total</th><th>Status</th></tr></thead>
        <tbody>
          ${[...c.orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50).map((o) => `
            <tr>
              <td><button type="button" class="btn btn-link btn-sm p-0" data-open="${escapeHtml(o.ref)}">${escapeHtml(o.ref)}</button><div class="cell-sub">${dateShort(o.createdAt)}</div></td>
              <td>${storeDot(o.store)}${escapeHtml(kindOf(o) === 'request' ? 'Request' : storeName(o.store))}</td>
              <td class="small">${escapeHtml(itemsSummary(o))}</td>
              <td class="text-end">${o.total ? money(o.total) : '—'}</td>
              <td>${statusBadge(o)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${c.orders.length > 50 ? `<p class="small text-muted">Showing the latest 50 of ${c.orders.length} orders.</p>` : ''}`;
  modal.show();
}
