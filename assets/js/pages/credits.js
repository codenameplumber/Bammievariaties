// Photo credits, read from assets/img/CREDITS.md so there is one list to keep up to date.
import { initPage, escapeHtml, siteUrl } from '../ui.js';

initPage();
showCredits();

async function showCredits() {
  const list = document.querySelector('[data-credits]');
  let rows;
  try {
    const res = await fetch(siteUrl('assets/img/CREDITS.md'));
    if (!res.ok) throw new Error(res.status);
    rows = parseTable(await res.text());
  } catch {
    list.innerHTML = '<li class="muted">The credits list didn\'t load. Please refresh the page.</li>';
    return;
  }

  list.innerHTML = rows.map(([file, what, source, author, licence]) => {
    const path = file.replace(/`/g, '');
    return `
      <li class="credit">
        <img src="${escapeHtml(siteUrl(path))}" alt="" loading="lazy" width="160" height="120">
        <div>
          <p class="credit__what">${escapeHtml(what)}</p>
          <p class="credit__by">Photo by ${escapeHtml(author)} via ${links(source)} · ${links(licence)}</p>
        </div>
      </li>`;
  }).join('');
}

// Rows of the markdown table whose first cell is an image path
function parseTable(markdown) {
  return markdown.split('\n')
    .filter((line) => line.startsWith('| `assets/'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

// [text](https://…) → link; anything else is plain text
function links(cell) {
  const m = cell.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
  return m
    ? `<a href="${escapeHtml(m[2])}" target="_blank" rel="noopener">${escapeHtml(m[1])}</a>`
    : escapeHtml(cell);
}
