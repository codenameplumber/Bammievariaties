import { initPage, icon, escapeHtml } from '../ui.js';
import { getCatalogue } from '../api.js';
import { isBatchOpen } from '../lines.js';
import { formatDay, formatDateTime } from '../dates.js';

initPage();
showBatchTeaser();

async function showBatchTeaser() {
  let batch;
  try {
    ({ batch } = await getCatalogue('bake'));
  } catch {
    return; // the teaser is a nice-to-have; the Bake & Cook card is still there
  }
  if (!isBatchOpen(batch)) return;
  const teaser = document.querySelector('[data-batch-teaser]');
  teaser.innerHTML = `
    <span class="tag">This week's batch</span>
    <span class="batch-teaser__text"><strong>${escapeHtml(batch.title)}</strong>: order by ${formatDateTime(batch.orderBy)}, ready ${formatDay(batch.readyOn)}.</span>
    <span class="batch-teaser__cta">Pre-order ${icon('arrow-right')}</span>`;
  teaser.hidden = false;
}
