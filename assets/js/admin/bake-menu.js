// Menu & weekly batch (Bake & Cook): menu items with photo, sizes (selling and
// cost price for each), days' notice, minimum order and availability; and the
// weekly batch Bammie posts on her WhatsApp status.
import { loadShop, saveProducts, saveWeeklyBatch } from '../api.js';
import { siteUrl } from '../ui.js';
import { putImage, deleteImage, getImage, compressImage, hydrateImages } from '../idb.js';
import { todayISO, addDays } from '../dates.js';
import { initShell, setBadges } from './shell.js';
import { money, escapeHtml, dataTable, col, toast, confirmAction, thumbHtml, slug, uniqueId } from './common.js';

initShell();

const shop = await loadShop();
setBadges(shop.orders);
let menu = structuredClone({ categories: shop.bake.categories, products: shop.bake.products });
let batch = structuredClone(shop.bake.batch ?? { id: '', title: '', blurb: '', orderBy: '', readyOn: '', items: [] });

const catName = (id) => menu.categories.find((c) => c.id === id)?.name ?? id;
const notice = (d) => (!d ? 'Same day' : d === 1 ? '1 day' : `${d} days`);

// ---- menu table -------------------------------------------------------------------
const table = dataTable('#menuTable', {
  data: [],
  order: [[1, 'asc']],
  columns: [
    col((p) => thumbHtml(p.image), () => '', { orderable: false, responsivePriority: 4 }),
    col((p) => `<div class="cell-main">${escapeHtml(p.name)}</div><div class="cell-sub">${escapeHtml(catName(p.category))}</div>`, (p) => `${p.name} ${catName(p.category)}`, { responsivePriority: 1 }),
    col((p) => p.options.map((o) => `<div>${escapeHtml(o.label)}: <strong>${money(o.price)}</strong> <span class="cell-sub">cost ${money(o.cost ?? 0)}</span></div>`).join(''),
      (p) => Math.min(...p.options.map((o) => o.price)), { responsivePriority: 2 }),
    col((p) => notice(p.leadTimeDays), (p) => p.leadTimeDays),
    col((p) => p.minQty ?? 1, (p) => p.minQty ?? 1),
    col((p) => `<div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" role="switch" data-available="${escapeHtml(p.id)}" ${p.available ? 'checked' : ''} aria-label="${escapeHtml(p.name)} available"></div>`, (p) => (p.available ? 1 : 0), { responsivePriority: 3 }),
    col((p) => `<div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-primary" data-edit="${escapeHtml(p.id)}" aria-label="Edit ${escapeHtml(p.name)}"><i class="bi bi-pencil"></i></button><button type="button" class="btn btn-outline-danger" data-delete="${escapeHtml(p.id)}" aria-label="Delete ${escapeHtml(p.name)}"><i class="bi bi-trash"></i></button></div>`, () => '', { orderable: false, className: 'text-end', responsivePriority: 1 }),
  ],
});
table.on('draw', () => hydrateImages(document.getElementById('menuTable')));
document.getElementById('menuTab').addEventListener('shown.bs.tab', () => table.columns.adjust().responsive.recalc());

function renderMenu() {
  table.clear().rows.add(menu.products).draw(false);
}

async function persistMenu(message) {
  try {
    await saveProducts('bake', menu);
    toast(message);
  } catch (err) {
    toast(err.message, 'danger');
  }
  renderMenu();
  renderBatchItems();
}

$('#menuTable').on('change', '[data-available]', async (e) => {
  const p = menu.products.find((x) => x.id === e.target.dataset.available);
  p.available = e.target.checked;
  await persistMenu(`${p.name} is ${p.available ? 'available' : 'not available'}`);
});
$('#menuTable').on('click', '[data-delete]', async (e) => {
  const p = menu.products.find((x) => x.id === e.currentTarget.dataset.delete);
  if (!(await confirmAction(`Delete "${p.name}" from the menu?`, { confirmLabel: 'Delete', tone: 'danger' }))) return;
  menu.products = menu.products.filter((x) => x.id !== p.id);
  batch.items = batch.items.filter((i) => i.itemId !== p.id);
  if (p.image?.startsWith('idb:')) deleteImage(p.image.slice(4)).catch(() => {});
  await saveWeeklyBatch(batch).catch(() => {});
  await persistMenu(`Deleted ${p.name}`);
});
$('#menuTable').on('click', '[data-edit]', (e) => openEditor(menu.products.find((p) => p.id === e.currentTarget.dataset.edit)));
document.querySelector('[data-add]').addEventListener('click', () => {
  bootstrap.Tab.getOrCreateInstance(document.getElementById('menuTab')).show();
  openEditor(null);
});

// ---- item editor --------------------------------------------------------------------
const modalEl = document.getElementById('itemModal');
const modal = new bootstrap.Modal(modalEl);
const form = modalEl.querySelector('[data-item-form]');
const preview = form.querySelector('[data-photo-preview]');
const photoInput = form.querySelector('[data-photo]');
const removeBtn = form.querySelector('[data-photo-remove]');
const optionsBox = form.querySelector('[data-options]');
let editing = null;
let newPhoto = null;
let removePhoto = false;

function showPhoto(src) {
  preview.innerHTML = src ? `<img src="${src}" alt="Item photo">` : '<span><i class="bi bi-camera fs-2 d-block"></i>Tap to add a photo</span>';
  removeBtn.hidden = !src;
}

function optionRow(o = {}) {
  const row = document.createElement('div');
  row.className = 'option-row';
  row.dataset.optionId = o.id ?? '';
  row.innerHTML = `
    <div class="opt-label"><label class="form-label small mb-1">Size / pack</label><input class="form-control" data-o="label" maxlength="40" placeholder="e.g. Pack of 6" value="${escapeHtml(o.label ?? '')}"></div>
    <div><label class="form-label small mb-1">Selling (₦)</label><input class="form-control" data-o="price" type="number" min="0" step="50" value="${o.price ?? ''}"></div>
    <div><label class="form-label small mb-1">Cost (₦)</label><input class="form-control" data-o="cost" type="number" min="0" step="50" value="${o.cost ?? ''}"></div>
    <button type="button" class="btn btn-outline-danger" data-remove-option aria-label="Remove this size"><i class="bi bi-x-lg"></i></button>`;
  return row;
}

async function openEditor(item) {
  editing = item;
  newPhoto = null;
  removePhoto = false;
  form.reset();
  form.classList.remove('was-validated');
  form.querySelector('[data-options-error]').hidden = true;
  modalEl.querySelector('#itemModalTitle').textContent = item ? `Edit ${item.name}` : 'Add menu item';
  form.querySelector('[data-category-select]').innerHTML = menu.categories.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  const f = form.elements;
  f.name.value = item?.name ?? '';
  f.category.value = item?.category ?? menu.categories[0]?.id;
  f.blurb.value = item?.blurb ?? '';
  f.leadTimeDays.value = item?.leadTimeDays ?? 2;
  f.minQty.value = item?.minQty ?? 1;
  f.available.checked = item?.available ?? true;
  f.messageAllowed.checked = item?.messageAllowed ?? false;
  optionsBox.replaceChildren(...(item?.options ?? [{}]).map(optionRow));
  showPhoto(null);
  if (item?.image?.startsWith('idb:')) {
    const blob = await getImage(item.image.slice(4)).catch(() => null);
    showPhoto(blob ? URL.createObjectURL(blob) : null);
  } else if (item?.image) {
    showPhoto(siteUrl(item.image));
  }
  modal.show();
}

form.querySelector('[data-add-option]').addEventListener('click', () => {
  optionsBox.append(optionRow());
  optionsBox.lastElementChild.querySelector('input').focus();
});
optionsBox.addEventListener('click', (e) => {
  if (e.target.closest('[data-remove-option]') && optionsBox.children.length > 1) e.target.closest('.option-row').remove();
});
photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  if (!file) return;
  try {
    newPhoto = await compressImage(file);
    removePhoto = false;
    showPhoto(URL.createObjectURL(newPhoto));
  } catch {
    toast("That photo couldn't be read. Try a JPG or PNG.", 'danger');
  }
});
removeBtn.addEventListener('click', () => {
  newPhoto = null;
  removePhoto = true;
  photoInput.value = '';
  showPhoto(null);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  form.classList.add('was-validated');
  const takenOptionIds = [];
  const options = [...optionsBox.querySelectorAll('.option-row')].map((row) => {
    const get = (k) => row.querySelector(`[data-o="${k}"]`).value.trim();
    const label = get('label');
    const id = row.dataset.optionId || uniqueId(slug(label), takenOptionIds);
    takenOptionIds.push(id);
    return { id, label, price: Math.round(Number(get('price'))), cost: Math.round(Number(get('cost')) || 0) };
  }).filter((o) => o.label && o.price > 0);
  const optionsOk = options.length > 0;
  form.querySelector('[data-options-error]').hidden = optionsOk;
  if (!form.checkValidity() || !optionsOk) return;

  const f = form.elements;
  const id = editing?.id ?? uniqueId(slug(f.name.value), menu.products.map((p) => p.id));
  let image = editing?.image ?? null;
  const oldIdb = image?.startsWith('idb:') ? image.slice(4) : null;
  if (newPhoto) {
    const key = `menu-${id}-${Date.now()}`;
    await putImage(key, newPhoto);
    image = `idb:${key}`;
    if (oldIdb) deleteImage(oldIdb).catch(() => {});
  } else if (removePhoto) {
    image = ''; // '' = no photo; null would be refilled with the stock photo (api.js)
    if (oldIdb) deleteImage(oldIdb).catch(() => {});
  }

  const item = {
    ...(editing ?? { store: 'bake' }),
    id,
    name: f.name.value.trim(),
    category: f.category.value,
    blurb: f.blurb.value.trim(),
    options,
    leadTimeDays: Number(f.leadTimeDays.value),
    minQty: Number(f.minQty.value),
    messageAllowed: f.messageAllowed.checked,
    available: f.available.checked,
    image,
  };
  menu.products = editing ? menu.products.map((p) => (p.id === editing.id ? item : p)) : [...menu.products, item];
  // Drop batch lines whose size no longer exists.
  batch.items = batch.items.filter((i) => i.itemId !== id || options.some((o) => o.id === i.option));
  modal.hide();
  await persistMenu(editing ? `Saved ${item.name}` : `Added ${item.name}`);
});

// ---- weekly batch -------------------------------------------------------------------
const batchForm = document.querySelector('[data-batch-form]');
const batchItems = batchForm.querySelector('[data-batch-items]');

function sizeChoices(selected) {
  return menu.products.filter((p) => p.available).flatMap((p) => p.options.map((o) => {
    const value = `${p.id}::${o.id}`;
    return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(`${p.name} — ${o.label} (${money(o.price)})`)}</option>`;
  })).join('');
}

function batchRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'row g-2 align-items-end mb-2';
  row.innerHTML = `
    <div class="col-12 col-md-8"><label class="form-label small mb-1">Item and size</label><select class="form-select" data-b="item">${sizeChoices(item.itemId ? `${item.itemId}::${item.option}` : '')}</select></div>
    <div class="col-8 col-md-3"><label class="form-label small mb-1">How many in the batch</label><input class="form-control" data-b="limit" type="number" min="1" max="999" value="${item.limit ?? 20}"></div>
    <div class="col-4 col-md-1"><button type="button" class="btn btn-outline-danger w-100" data-remove-batch aria-label="Remove from batch"><i class="bi bi-x-lg"></i></button></div>`;
  return row;
}

function renderBatchItems() {
  batchItems.replaceChildren(...batch.items.map(batchRow));
  if (!batch.items.length) batchItems.innerHTML = '<p class="text-muted small">No items in this week\'s batch.</p>';
}

function fillBatch() {
  const f = batchForm.elements;
  f.title.value = batch.title ?? '';
  f.blurb.value = batch.blurb ?? '';
  f.orderBy.value = batch.orderBy ? toLocalInput(batch.orderBy) : '';
  f.readyOn.value = batch.readyOn ?? '';
  renderBatchItems();
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

batchForm.querySelector('[data-add-batch-item]').addEventListener('click', () => {
  if (!batchItems.querySelector('.row')) batchItems.innerHTML = '';
  batchItems.append(batchRow());
});
batchItems.addEventListener('click', (e) => {
  if (e.target.closest('[data-remove-batch]')) e.target.closest('.row').remove();
});
batchForm.querySelector('[data-clear-batch]').addEventListener('click', async () => {
  if (!(await confirmAction('Remove this week\'s batch from the shop?', { confirmLabel: 'Remove batch', tone: 'danger' }))) return;
  batch = { ...batch, items: [] };
  await saveWeeklyBatch(batch);
  fillBatch();
  toast('No batch this week');
});

batchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = batchForm.elements;
  const items = [...batchItems.querySelectorAll('.row')].map((row) => {
    const [itemId, option] = row.querySelector('[data-b="item"]').value.split('::');
    return { itemId, option, limit: Math.max(1, Math.round(Number(row.querySelector('[data-b="limit"]').value) || 1)) };
  }).filter((i) => i.itemId);
  f.orderBy.required = items.length > 0;
  f.readyOn.required = items.length > 0;
  const orderDay = f.orderBy.value.slice(0, 10);
  f.readyOn.setCustomValidity(f.readyOn.value && orderDay && f.readyOn.value < orderDay ? 'before' : '');
  batchForm.classList.add('was-validated');
  if (!batchForm.checkValidity()) return;
  batch = {
    id: `batch-${f.readyOn.value || todayISO()}`,
    title: f.title.value.trim() || 'This week\'s batch',
    blurb: f.blurb.value.trim(),
    orderBy: f.orderBy.value ? new Date(f.orderBy.value).toISOString() : '',
    readyOn: f.readyOn.value,
    items,
  };
  try {
    await saveWeeklyBatch(batch);
    toast(items.length ? 'Batch saved. It\'s on the shop now.' : 'Saved with no items');
  } catch (err) {
    toast(err.message, 'danger');
  }
});

renderMenu();
fillBatch();
// No batch yet: suggest the coming Saturday.
if (!batch.readyOn) batchForm.elements.readyOn.value = addDays(todayISO(), (6 - new Date().getDay() + 7) % 7 || 7);
