// Charts for the owner tools, built to the dataviz rules: columns ≤24px with 4px
// rounded tops and square baselines, a 2px surface gap between stacked parts,
// hairline solid gridlines, compact ₦ ticks, a legend for 2+ series, a tooltip on
// hover AND keyboard focus, and a table view so no value depends on hovering.
// Labels go in with textContent, never innerHTML.
import { money } from '../ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const GAP = 2;
const PLOT_H = 190;
const M = { top: 22, right: 8, bottom: 30, left: 52 };

export function compactNaira(n) {
  if (n >= 1_000_000) return `₦${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `₦${trim(n / 1_000)}K`;
  return `₦${n}`;
}
const trim = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10).toString();

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.append(node);
  return node;
}

// Column with only the top corners rounded (data end), square at the baseline.
function topRounded(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * columns: [{ label: 'Mon 26 Oct', short: 'Mon', values: { varieties: 1200, bake: 300 } }]
 * series:  [{ id, name, color }] in stacking order (first sits on the baseline)
 * caption: describes the chart for screen readers and the table
 */
export function columnChart(container, { columns, series, caption }) {
  container.classList.add('chart');
  container.replaceChildren();

  if (series.length > 1) {
    const legend = document.createElement('div');
    legend.className = 'chart__legend';
    for (const s of series) {
      const item = document.createElement('span');
      const sw = document.createElement('span');
      sw.className = 'chart__swatch';
      sw.style.background = s.color;
      item.append(sw, document.createTextNode(s.name));
      legend.append(item);
    }
    container.append(legend);
  }

  const plot = document.createElement('div');
  plot.className = 'chart__plot';
  container.append(plot);

  const tip = document.createElement('div');
  tip.className = 'chart__tip';
  tip.hidden = true;
  plot.append(tip);

  const totalOf = (c) => series.reduce((s, x) => s + (c.values[x.id] ?? 0), 0);

  const draw = () => {
    plot.querySelector('svg')?.remove();
    const width = Math.max(280, plot.clientWidth);
    const plotW = width - M.left - M.right;
    const max = Math.max(1, ...columns.map(totalOf));
    const step = niceStep(max / 4);
    const yMax = Math.ceil(max / step) * step;
    const y = (v) => M.top + PLOT_H - (v / yMax) * PLOT_H;

    const svg = el('svg', { viewBox: `0 0 ${width} ${M.top + PLOT_H + M.bottom}`, role: 'group', 'aria-label': caption });
    plot.prepend(svg);

    for (let v = 0; v <= yMax + 1e-9; v += step) {
      el('line', { x1: M.left, x2: width - M.right, y1: y(v), y2: y(v), class: 'chart__grid' }, svg);
      const t = el('text', { x: M.left - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'chart__axis-text' }, svg);
      t.textContent = compactNaira(v);
    }

    const slot = plotW / columns.length;
    const barW = Math.max(3, Math.min(24, slot * 0.62));
    const labelEvery = columns.length <= 12 ? 1 : Math.ceil(columns.length / 8);
    const maxIndex = columns.map(totalOf).indexOf(max);

    columns.forEach((c, i) => {
      const cx = M.left + slot * (i + 0.5);
      const g = el('g', { class: 'chart__col' }, svg);

      // Stack from the baseline up; each part above the first gives up 2px as the gap.
      let base = M.top + PLOT_H;
      const parts = series.map((s) => ({ s, v: c.values[s.id] ?? 0 })).filter((p) => p.v > 0);
      parts.forEach((p, idx) => {
        const h = (p.v / yMax) * PLOT_H - (idx > 0 ? GAP : 0);
        if (h < 0.5) return;
        const top = base - (idx > 0 ? GAP : 0) - h;
        const isTop = idx === parts.length - 1;
        el('path', {
          d: isTop ? topRounded(cx - barW / 2, top, barW, h, 4) : `M${cx - barW / 2},${top}h${barW}v${h}h${-barW}Z`,
          fill: p.s.color,
          class: 'chart__seg',
        }, g);
        base = top;
      });

      // Cap labels, sparingly: the highest column and the latest one.
      if ((i === maxIndex || i === columns.length - 1) && totalOf(c) > 0) {
        const t = el('text', { x: cx, y: y(totalOf(c)) - 6, 'text-anchor': 'middle', class: 'chart__cap' }, svg);
        t.textContent = compactNaira(totalOf(c));
      }

      if (i % labelEvery === 0 || i === columns.length - 1) {
        const t = el('text', { x: cx, y: M.top + PLOT_H + 18, 'text-anchor': 'middle', class: 'chart__axis-text' }, svg);
        t.textContent = c.short;
      }

      // Hit target: the whole slot, taller and wider than the mark.
      const hit = el('rect', {
        x: M.left + slot * i, y: M.top, width: slot, height: PLOT_H,
        class: 'chart__hit', tabindex: '0',
        'aria-label': `${c.label}: ${money(totalOf(c))}${series.length > 1 ? ` (${series.map((s) => `${s.name} ${money(c.values[s.id] ?? 0)}`).join(', ')})` : ''}`,
      }, svg);
      const show = () => {
        g.classList.add('is-active');
        fillTip(c);
        tip.hidden = false;
        const left = Math.min(Math.max(cx - tip.offsetWidth / 2, 0), width - tip.offsetWidth);
        tip.style.left = `${(left / width) * 100}%`;
        tip.style.top = `${Math.max(0, y(totalOf(c)) - tip.offsetHeight - 10) * (plot.clientWidth / width)}px`;
      };
      const hide = () => {
        g.classList.remove('is-active');
        tip.hidden = true;
      };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', show);
      hit.addEventListener('blur', hide);
    });
  };

  function fillTip(c) {
    tip.replaceChildren();
    const title = document.createElement('div');
    title.className = 'chart__tip-title';
    title.textContent = c.label;
    tip.append(title);
    for (const s of series) {
      const row = document.createElement('div');
      row.className = 'chart__tip-row';
      const key = document.createElement('span');
      key.className = 'chart__tip-key';
      key.style.background = s.color;
      const value = document.createElement('strong');
      value.textContent = money(c.values[s.id] ?? 0);
      row.append(key, value, document.createTextNode(` ${s.name}`));
      tip.append(row);
    }
    if (series.length > 1) {
      const total = document.createElement('div');
      total.className = 'chart__tip-total';
      const strong = document.createElement('strong');
      strong.textContent = money(totalOf(c));
      total.append(strong, document.createTextNode(' total'));
      tip.append(total);
    }
  }

  // Table view: every value, no hovering needed.
  const details = document.createElement('details');
  details.className = 'chart-table';
  const summary = document.createElement('summary');
  summary.textContent = 'Show as table';
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';
  const cap = document.createElement('caption');
  cap.className = 'visually-hidden';
  cap.textContent = caption;
  const head = table.createTHead().insertRow();
  for (const h of ['', ...series.map((s) => s.name), ...(series.length > 1 ? ['Total'] : [])]) {
    const th = document.createElement('th');
    th.textContent = h;
    if (h) th.className = 'num';
    head.append(th);
  }
  const body = table.createTBody();
  for (const c of columns) {
    const row = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = c.label;
    row.append(th);
    for (const v of [...series.map((s) => c.values[s.id] ?? 0), ...(series.length > 1 ? [totalOf(c)] : [])]) {
      const td = row.insertCell();
      td.className = 'num';
      td.textContent = money(v);
    }
  }
  table.prepend(cap);
  scroll.append(table);
  details.append(summary, scroll);
  container.append(details);

  draw();
  // Redraw on resize; a re-render of the same container replaces the old observer.
  observers.get(container)?.disconnect();
  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  });
  observer.observe(plot);
  observers.set(container, observer);
}

const observers = new WeakMap();

/**
 * Ranked horizontal bars, one colour, value at the tip of each bar.
 * rows: [{ name, detail?, value, note? }]
 */
export function barList(container, rows, { color = '#2A7A45', format = money } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const list = document.createElement('ol');
  list.className = 'bar-list';
  for (const r of rows) {
    const li = document.createElement('li');
    li.className = 'bar-list__row';
    const name = document.createElement('div');
    name.className = 'bar-list__name';
    name.textContent = r.name;
    if (r.detail) {
      const small = document.createElement('small');
      small.textContent = ` ${r.detail}`;
      name.append(small);
    }
    const bar = document.createElement('div');
    bar.className = 'bar-list__bar';
    const fill = document.createElement('span');
    fill.className = 'bar-list__fill';
    fill.style.width = `${Math.max(1, (r.value / max) * 100) * 0.78}%`;
    fill.style.background = color;
    const value = document.createElement('span');
    value.className = 'bar-list__value';
    value.textContent = format(r.value) + (r.note ? ` · ${r.note}` : '');
    bar.append(fill, value);
    li.append(name, bar);
    list.append(li);
  }
  container.replaceChildren(list);
}
