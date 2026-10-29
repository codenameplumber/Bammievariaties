// Products & prices (Varieties Store): add, edit and remove products with a photo,
// cost price and selling price; switch stock on and off. Changes show on the
// shop (in this browser until the backend is connected).
import { loadShop, saveProducts } from '../api.js';
import { siteUrl } from '../ui.js';
import { putImage, deleteImage, compressImage, hydrateImages } from '../idb.js';
import { initShell, setBadges } from './shell.js';
import { money, escapeHtml, dataTable, col, statCard, toast, confirmAction, downloadCsv, renderPills, thumbHtml, slug, uniqueId } from './common.js';

initShell();

const shop = await loadShop();
setBadges(shop.orders);
let catalogue = structuredClone(shop.varieties);
let catFilter = 'all';

const modalEl = document.getElementById('productModal');
const modal = new bootstrap.Modal(modalEl);
const form = modalEl.querySelector('[data-product-form]');
let editing = null;   // product being edited, or null for a new one
let newPhoto = null;  // compressed Blob waiting to be saved
let removePhoto = false;

const margin = (p) => (p.price ? Math.round(((p.price - (p.cost ?? 0)) / p.price) * 100) : 0);
const catName = (id) => catalogue.categories.find((c) => c.id === id)?.name ?? id;

const table = dataTable('#productsTable', {
  data: [],
  order: [[1, 'asc']],
  columns: [
    col((p) => thumbHtml(p.image), () => '', { orderable: false, responsivePriority: 4 }),
    col((p) => `<div class="cell-main">${escapeHtml(p.name)}</div><div class="cell-sub">${escapeHtml(p.unit)}${p.featured ? ' · <i class="bi bi-star-fill text-warning"></i> on home page' : ''}</div>`, (p) => `${p.name} ${p.unit}`, { responsivePriority: 1 }),
    col((p) => escapeHtml(catName(p.category)), (p) => catName(p.category)),
    col((p) => money(p.cost ?? 0), (p) => p.cost ?? 0),
    col((p) => `<span class="fw-semibold">${money(p.price)}</span>`, (p) => p.price, { responsivePriority: 2 }),
    col((p) => `<span class="${p.price - (p.cost ?? 0) < 0 ? 'text-danger' : ''}">${money(p.price - (p.cost ?? 0))}</span> <span class="cell-sub">(${margin(p)}%)</span>`, (p) => p.price - (p.cost ?? 0)),
    col((p) => `<div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" role="switch" data-stock="${escapeHtml(p.id)}" ${p.inStock ? 'checked' : ''} aria-label="${escapeHtml(p.name)} in stock"></div>`, (p) => (p.inStock ? 1 : 0), { responsivePriority: 3 }),
    col((p) => `<div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-primary" data-edit="${escapeHtml(p.id)}" aria-label="Edit ${escapeHtml(p.name)}"><i class="bi bi-pencil"></i></button><button type="button" class="btn btn-outline-danger" data-delete="${escapeHtml(p.id)}" aria-label="Delete ${escapeHtml(p.name)}"><i class="bi bi-trash"></i></button></div>`, () => '', { orderable: false, className: 'text-end', responsivePriority: 1 }),
  ],
});
table.on('draw', () => hydrateImages(document.getElementById('productsTable')));

render();

// ---- table actions ----------------------------------------------------------------
$('#productsTable').on('click', '[data-edit]', (e) => openEditor(catalogue.products.find((p) => p.id === e.currentTarget.dataset.edit)));
$('#productsTable').on('click', '[data-delete]', async (e) => {
  const p = catalogue.products.find((x) => x.id === e.currentTarget.dataset.delete);
  if (!(await confirmAction(`Delete "${p.name} (${p.unit})"? Customers won't see it any more.`, { confirmLabel: 'Delete', tone: 'danger' }))) return;
  catalogue.products = catalogue.products.filter((x) => x.id !== p.id);
  if (p.image?.startsWith('idb:')) deleteImage(p.image.slice(4)).catch(() => {});
  await persist(`Deleted ${p.name}`);
});
$('#productsTable').on('change', '[data-stock]', async (e) => {
  const p = catalogue.products.find((x) => x.id === e.target.dataset.stock);
  p.inStock = e.target.checked;
  await persist(`${p.name} is ${p.inStock ? 'in stock' : 'out of stock'}`);
});
document.querySelector('[data-add]').addEventListener('click', () => openEditor(null));
document.querySelector('[data-cat-filter]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (btn) { catFilter = btn.dataset.filter; render(); }
});
document.querySelector('[data-export]').addEventListener('click', () => downloadCsv('bammie-products.csv',
  ['Product', 'Size / pack', 'Category', 'Cost price', 'Selling price', 'Profit per item', 'Margin %', 'In stock'],
  catalogue.products.map((p) => [p.name, p.unit, catName(p.category), p.cost ?? 0, p.price, p.price - (p.cost ?? 0), margin(p), p.inStock ? 'Yes' : 'No'])));

function render() {
  const filters = [{ id: 'all', label: 'All', test: () => true }, ...catalogue.categories.map((c) => ({ id: c.id, label: c.name, test: (p) => p.category === c.id }))];
  renderPills(document.querySelector('[data-cat-filter]'), filters, catFilter, catalogue.products);
  table.clear().rows.add(catalogue.products.filter(filters.find((f) => f.id === catFilter)?.test ?? (() => true))).draw(false);
  const products = catalogue.products;
  const out = products.filter((p) => !p.inStock).length;
  const avg = products.length ? Math.round(products.reduce((s, p) => s + margin(p), 0) / products.length) : 0;
  const low = [...products].sort((a, b) => margin(a) - margin(b))[0];
  document.querySelector('[data-stats]').innerHTML = [
    statCard({ icon: 'bi-box-seam', tone: 'green', label: 'Products', value: products.length, sub: `${catalogue.categories.length} categories` }),
    statCard({ icon: 'bi-x-octagon', tone: 'red', label: 'Out of stock', value: out, sub: 'Hidden from ordering' }),
    statCard({ icon: 'bi-percent', tone: 'gold', label: 'Average margin', value: `${avg}%`, sub: 'Selling vs cost price' }),
    statCard({ icon: 'bi-arrow-down-right', tone: 'blue', label: 'Lowest margin', value: low ? `${margin(low)}%` : '—', sub: low ? escapeHtml(`${low.name} (${low.unit})`) : '' }),
  ].join('');
}

async function persist(message) {
  try {
    await saveProducts('varieties', catalogue);
    toast(message);
  } catch (err) {
    toast(err.message, 'danger');
  }
  render();
}

// ---- editor -----------------------------------------------------------------------
const preview = form.querySelector('[data-photo-preview]');
const photoInput = form.querySelector('[data-photo]');
const removeBtn = form.querySelector('[data-photo-remove]');
const categorySelect = form.querySelector('[data-category-select]');
const newCategory = form.querySelector('[data-new-category]');

function showPhoto(src) {
  preview.innerHTML = src ? `<img src="${src}" alt="Product photo">` : '<span><i class="bi bi-camera fs-2 d-block"></i>Tap to add a photo</span>';
  removeBtn.hidden = !src;
}

async function openEditor(product) {
  editing = product;
  newPhoto = null;
  removePhoto = false;
  form.reset();
  form.classList.remove('was-validated');
  modalEl.querySelector('#productModalTitle').textContent = product ? `Edit ${product.name}` : 'Add product';
  categorySelect.innerHTML = catalogue.categories.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('') + '<option value="__new">+ New category…</option>';
  newCategory.hidden = true;
  const f = form.elements;
  f.name.value = product?.name ?? '';
  f.unit.value = product?.unit ?? '';
  f.category.value = product?.category ?? catalogue.categories[0]?.id ?? '__new';
  newCategory.hidden = f.category.value !== '__new';
  f.cost.value = product?.cost ?? '';
  f.price.value = product?.price ?? '';
  f.inStock.checked = product?.inStock ?? true;
  f.featured.checked = product?.featured ?? false;
  showPhoto(null);
  if (product?.image?.startsWith('idb:')) {
    const { getImage } = await import('../idb.js');
    const blob = await getImage(product.image.slice(4)).catch(() => null);
    showPhoto(blob ? URL.createObjectURL(blob) : null);
  } else if (product?.image) {
    showPhoto(siteUrl(product.image));
  }
  updateMargin();
  modal.show();
}

function updateMargin() {
  const cost = Number(form.elements.cost.value);
  const price = Number(form.elements.price.value);
  const hint = form.querySelector('[data-margin]');
  if (!price) { hint.textContent = ''; return; }
  const profit = price - cost;
  hint.className = `margin-hint mb-3 ${profit < 0 ? 'text-danger' : 'text-success'}`;
  hint.textContent = profit < 0
    ? `You lose ${money(-profit)} on each one. Check the prices.`
    : `You make ${money(profit)} on each one (${Math.round((profit / price) * 100)}% margin).`;
}

form.elements.cost.addEventListener('input', updateMargin);
form.elements.price.addEventListener('input', updateMargin);
categorySelect.addEventListener('change', () => {
  newCategory.hidden = categorySelect.value !== '__new';
  if (!newCategory.hidden) newCategory.focus();
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
  const f = form.elements;
  newCategory.required = f.category.value === '__new';
  newCategory.classList.toggle('is-invalid', newCategory.required && !newCategory.value.trim());
  form.classList.add('was-validated');
  if (!form.checkValidity() || (newCategory.required && !newCategory.value.trim())) return;

  let category = f.category.value;
  if (category === '__new') {
    const name = newCategory.value.trim();
    category = uniqueId(slug(name), catalogue.categories.map((c) => c.id));
    catalogue.categories.push({ id: category, name, blurb: '', icon: 'basket' });
  }

  const id = editing?.id ?? uniqueId(slug(`${f.name.value} ${f.unit.value}`), catalogue.products.map((p) => p.id));
  let image = editing?.image ?? null;
  const oldIdb = image?.startsWith('idb:') ? image.slice(4) : null;
  if (newPhoto) {
    const key = `product-${id}-${Date.now()}`;
    await putImage(key, newPhoto);
    image = `idb:${key}`;
    if (oldIdb) deleteImage(oldIdb).catch(() => {});
  } else if (removePhoto) {
    image = ''; // '' = no photo; null would be refilled with the stock photo (api.js)
    if (oldIdb) deleteImage(oldIdb).catch(() => {});
  }

  const product = {
    ...(editing ?? { store: 'varieties' }),
    id,
    name: f.name.value.trim(),
    unit: f.unit.value.trim(),
    category,
    cost: Math.round(Number(f.cost.value)),
    price: Math.round(Number(f.price.value)),
    inStock: f.inStock.checked,
    featured: f.featured.checked,
    image,
  };
  catalogue.products = editing ? catalogue.products.map((p) => (p.id === editing.id ? product : p)) : [...catalogue.products, product];
  modal.hide();
  await persist(editing ? `Saved ${product.name}` : `Added ${product.name}`);
});
