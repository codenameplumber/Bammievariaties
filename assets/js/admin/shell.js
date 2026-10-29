// The admin frame shared by every page: a fixed sidebar on desktop, a top bar
// with a hamburger on phones that slides the same menu in. Pages mark which
// item is current with <body data-page="…">.
import { escapeHtml } from '../ui.js';

const NAV = [
  { section: 'Overview' },
  { id: 'dashboard', href: './', icon: 'bi-grid-1x2', label: 'Dashboard' },
  { id: 'record-sale', href: 'record-sale.html', icon: 'bi-plus-circle', label: 'Record a sale' },
  { section: 'Varieties Store' },
  { id: 'orders', href: 'orders.html', icon: 'bi-bag-check', label: 'Store orders', badge: 'store' },
  { id: 'products', href: 'products.html', icon: 'bi-box-seam', label: 'Products & prices' },
  { section: 'Bake & Cook' },
  { id: 'preorders', href: 'preorders.html', icon: 'bi-calendar2-heart', label: 'Pre-orders & quotes', badge: 'bake' },
  { id: 'production', href: 'production.html', icon: 'bi-list-check', label: 'Production list' },
  { id: 'bake-menu', href: 'bake-menu.html', icon: 'bi-cake2', label: 'Menu & weekly batch' },
  { section: 'Business' },
  { id: 'customers', href: 'customers.html', icon: 'bi-people', label: 'Customers' },
  { id: 'reports', href: 'reports.html', icon: 'bi-graph-up-arrow', label: 'Reports & profit' },
  { id: 'settings', href: 'settings.html', icon: 'bi-gear', label: 'Settings' },
];

export function initShell() {
  const current = document.body.dataset.page;
  const shell = document.createElement('div');
  shell.innerHTML = `
    <header class="mobile-header">
      <button type="button" class="btn btn-icon" data-menu-open aria-controls="sidebar" aria-expanded="false" aria-label="Open menu"><i class="bi bi-list"></i></button>
      <a class="admin-brand" href="./"><span class="admin-brand__name">Bammie<i class="bi bi-star-fill" aria-hidden="true"></i></span><span class="admin-brand__tag">Admin</span></a>
      <a class="btn btn-icon" href="record-sale.html" aria-label="Record a sale"><i class="bi bi-plus-lg"></i></a>
    </header>
    <div class="sidebar-overlay" data-menu-close></div>
    <aside class="sidebar" id="sidebar" aria-label="Admin menu">
      <div class="sidebar-brand">
        <a class="admin-brand" href="./"><span class="admin-brand__name">Bammie<i class="bi bi-star-fill" aria-hidden="true"></i></span><span class="admin-brand__tag">Admin</span></a>
        <button type="button" class="btn btn-icon sidebar-close" data-menu-close aria-label="Close menu"><i class="bi bi-x-lg"></i></button>
      </div>
      <nav class="sidebar-nav">
        ${NAV.map((item) => item.section
          ? `<p class="nav-section">${escapeHtml(item.section)}</p>`
          : `<a class="nav-link${item.id === current ? ' active' : ''}" href="${item.href}"${item.id === current ? ' aria-current="page"' : ''}>
               <i class="bi ${item.icon}" aria-hidden="true"></i><span>${escapeHtml(item.label)}</span>
               ${item.badge ? `<span class="badge rounded-pill" data-badge="${item.badge}" hidden></span>` : ''}
             </a>`).join('')}
      </nav>
      <div class="sidebar-foot">
        <a href="../" target="_blank" rel="noopener"><i class="bi bi-shop me-2"></i>View the shop <i class="bi bi-box-arrow-up-right small"></i></a>
        <p>Demo mode: data is saved in this browser until the backend is connected.</p>
      </div>
    </aside>`;
  document.body.prepend(...shell.children);

  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('.sidebar-overlay');

  // On short screens the menu scrolls; keep the current page's link in view.
  const nav = sidebar.querySelector('.sidebar-nav');
  const active = nav.querySelector('.nav-link.active');
  const below = active ? active.getBoundingClientRect().bottom - nav.getBoundingClientRect().bottom : 0;
  if (below > 0) nav.scrollTop = below + nav.clientHeight / 3;
  const opener = document.querySelector('[data-menu-open]');
  const setOpen = (open) => {
    sidebar.classList.toggle('show', open);
    overlay.classList.toggle('show', open);
    document.body.classList.toggle('menu-open', open);
    opener.setAttribute('aria-expanded', String(open));
    if (open) sidebar.querySelector('.nav-link')?.focus();
  };
  opener.addEventListener('click', () => setOpen(true));
  document.querySelectorAll('[data-menu-close]').forEach((el) => el.addEventListener('click', () => {
    setOpen(false);
    opener.focus();
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('show')) {
      setOpen(false);
      opener.focus();
    }
  });
}

// Red counts next to "Store orders" and "Pre-orders" for orders waiting on Bammie.
export function setBadges(orders) {
  const counts = {
    store: orders.filter((o) => o.store === 'varieties' && o.status === 'new').length,
    bake: orders.filter((o) => o.store === 'bake' && o.status === 'requested').length,
  };
  document.querySelectorAll('[data-badge]').forEach((el) => {
    const n = counts[el.dataset.badge];
    el.textContent = n;
    el.hidden = !n;
    el.setAttribute('aria-label', `${n} waiting`);
  });
}
