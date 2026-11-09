// Stacked revenue bars (Go Car Rentals + Go Campers) as plain SVG, with hover tooltip,
// legend totals and a table view.
import { bucketLabel, esc, money, num } from './util.js';

const SERIES = [
  { key: 'car', label: 'Go Car Rentals' },
  { key: 'camper', label: 'Go Campers' },
];

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

export function revenueChart(el, points, { currency, granularity, height }) {
  const sums = { car: 0, camper: 0 };
  for (const p of points) {
    sums.car += p.car;
    sums.camper += p.camper;
  }
  const labelG = granularity === 'week' ? 'day' : granularity;
  let showTable = false;

  const render = () => {
    el.innerHTML = `
      <div class="legend">
        ${SERIES.map((s) => `<span><i class="sw" style="background:var(--${s.key})"></i>${s.label}<b class="num">${money(sums[s.key], currency)}</b></span>`).join('')}
        <button type="button" class="link-btn muted" style="margin-left:auto" data-toggle>${showTable ? 'Show chart' : 'Show table'}</button>
      </div>
      ${showTable ? table() : `<div class="chart" style="${height ? `height:${height}px` : ''}"><svg role="img" aria-label="Revenue chart"></svg><div class="tooltip"></div></div>`}`;
    el.querySelector('[data-toggle]').onclick = () => {
      showTable = !showTable;
      render();
    };
    if (!showTable) draw();
  };

  const table = () => `
    <div class="table-wrap" style="max-height:340px;overflow:auto;margin-top:10px">
      <table class="num">
        <thead><tr><th>Period</th><th class="r">Bookings</th><th class="r">Cars</th><th class="r">Campers</th><th class="r">Total</th></tr></thead>
        <tbody>${points
          .map(
            (p) => `<tr${p.bookings ? '' : ' class="muted"'}><td>${bucketLabel(p.key, labelG)}</td><td class="r">${p.bookings}</td>
              <td class="r">${money(p.car, currency)}</td><td class="r">${money(p.camper, currency)}</td><td class="r"><b>${money(p.car + p.camper, currency)}</b></td></tr>`
          )
          .join('')}</tbody>
      </table>
    </div>`;

  const draw = () => {
    const box = el.querySelector('.chart');
    const svg = box.querySelector('svg');
    const tip = box.querySelector('.tooltip');
    const W = box.clientWidth || 600;
    const H = box.clientHeight || 260;
    const pad = { l: 44, r: 4, t: 8, b: 22 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const max = niceMax(Math.max(...points.map((p) => p.car + p.camper), 0));
    const n = Math.max(points.length, 1);
    const slot = iw / n;
    const bw = Math.max(2, Math.min(36, slot * 0.72));
    const y = (v) => pad.t + ih - (v / max) * ih;
    const tick = (v) => (currency === 'EUR' ? (v >= 1000 ? `€${num(v / 1000, 1)}k` : `€${num(v)}`) : v >= 1e6 ? `${num(v / 1e6, 1)}M` : `${num(v / 1000)}k`);

    let s = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      s += `<line class="${i ? 'gridline' : 'baseline'}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text class="axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${tick(v)}</text>`;
    }
    const every = Math.ceil(n / Math.max(1, Math.floor(iw / 64)));
    points.forEach((p, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const r = Math.min(4, bw / 2);
      const carH = (p.car / max) * ih;
      const camH = (p.camper / max) * ih;
      s += `<rect class="hover" data-i="${i}" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${ih}"/>`;
      // Rounded top on the top-most segment only; 2px surface gap between the two segments.
      const top = camH > 0 ? 'camper' : 'car';
      if (carH > 0) s += bar(x, y(p.car), bw, Math.max(carH - (camH > 0 ? 1 : 0), 1), top === 'car' ? r : 0, 'car');
      if (camH > 0) s += bar(x, y(p.car + p.camper), bw, Math.max(camH - 1, 1), r, 'camper');
      if (i % every === 0) s += `<text class="axis" x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${bucketLabel(p.key, labelG)}</text>`;
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;

    const show = (i) => {
      const p = points[i];
      svg.querySelectorAll('.hover').forEach((h) => h.classList.toggle('on', h.dataset.i === String(i)));
      const title = granularity === 'week' ? `Week of ${bucketLabel(p.key, 'day')}` : bucketLabel(p.key, granularity);
      tip.innerHTML = `<b>${esc(title)}</b>
        ${SERIES.map((sr) => `<div class="t"><span><i class="sw" style="background:var(--${sr.key})"></i>${sr.label}</span><span>${money(p[sr.key], currency)}</span></div>`).join('')}
        <div class="t"><span>${p.bookings} booking${p.bookings === 1 ? '' : 's'}</span><b>${money(p.car + p.camper, currency)}</b></div>`;
      const cx = pad.l + slot * i + slot / 2;
      tip.style.left = `${Math.min(Math.max(cx, 90), W - 90)}px`;
      tip.style.top = `${y(p.car + p.camper)}px`;
      tip.classList.add('show');
    };
    const hide = () => {
      tip.classList.remove('show');
      svg.querySelectorAll('.hover.on').forEach((h) => h.classList.remove('on'));
    };
    svg.onpointermove = (e) => {
      const rect = svg.getBoundingClientRect();
      // rect is in screen pixels, which differ from the chart's own while TV view scales the page
      const i = Math.floor(((e.clientX - rect.left) * (W / rect.width) - pad.l) / slot);
      if (i >= 0 && i < points.length) show(i);
      else hide();
    };
    svg.onpointerleave = hide;
  };

  render();
  // Redraw on resize (layout width changes on rotate / sidebar).
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) return ro.disconnect();
    if (!showTable) draw();
  });
  ro.observe(el);
}

function bar(x, y, w, h, r, cls) {
  if (!r) return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  r = Math.min(r, h);
  // Path with rounded top corners only.
  return `<path class="${cls}" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z"/>`;
}

// Whole numbers that split evenly into up to 4 axis steps.
function countScale(v) {
  if (v <= 4) return { max: Math.max(v, 1), steps: Math.max(v, 1) };
  const p = 10 ** Math.floor(Math.log10(v));
  const max = [1, 2, 4, 6, 8, 10, 12, 16, 20].map((m) => m * p).find((m) => m >= v && Number.isInteger(m / 4));
  return { max: max ?? Math.ceil(v / 4) * 4, steps: 4 };
}

// Shared frame of the report charts: legend, chart / table switch, redraw when the width changes.
function chartFrame(el, { legend, aria, height, table, draw }) {
  let showTable = false;
  const paint = () => {
    el.innerHTML = `<div class="legend">${legend}<button type="button" class="link-btn muted" style="margin-left:auto" data-toggle>${showTable ? 'Show chart' : 'Show table'}</button></div>
      ${
        showTable
          ? `<div class="table-wrap" style="max-height:${height}px;overflow:auto;margin-top:10px">${table()}</div>`
          : `<div class="chart" style="height:${height}px"><svg role="img" aria-label="${esc(aria)}"></svg><div class="tooltip"></div></div>`
      }`;
    el.querySelector('[data-toggle]').onclick = () => {
      showTable = !showTable;
      paint();
    };
    if (!showTable) draw(el.querySelector('.chart'));
  };
  paint();
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) return ro.disconnect();
    if (!showTable) draw(el.querySelector('.chart'));
  });
  ro.observe(el);
}

const legendItem = (s) => `<span><i class="sw" style="background:${s.color}"></i>${esc(s.label)}</span>`;

// Stacked bars of counts. points: [{ label, title, [series key]: n }], series: [{ key, label, color }]
export function stackChart(el, { points, series, aria, height = 220 }) {
  const total = (p) => series.reduce((a, s) => a + (p[s.key] ?? 0), 0);
  chartFrame(el, {
    legend: series.map(legendItem).join(''),
    aria,
    height,
    table: () => `<table class="num"><thead><tr><th>Period</th>${series.map((s) => `<th class="r">${esc(s.label)}</th>`).join('')}<th class="r">Total</th></tr></thead>
      <tbody>${points.map((p) => `<tr><td>${esc(p.title)}</td>${series.map((s) => `<td class="r">${p[s.key] ?? 0}</td>`).join('')}<td class="r"><b>${total(p)}</b></td></tr>`).join('')}</tbody></table>`,
    draw: (box) => {
      const svg = box.querySelector('svg');
      const tip = box.querySelector('.tooltip');
      const W = box.clientWidth || 600;
      const H = box.clientHeight || height;
      const pad = { l: 28, r: 4, t: 8, b: 22 };
      const iw = W - pad.l - pad.r;
      const ih = H - pad.t - pad.b;
      const { max, steps } = countScale(Math.max(...points.map(total), 0));
      const slot = iw / Math.max(points.length, 1);
      const bw = Math.max(2, Math.min(36, slot * 0.66));
      const y = (v) => pad.t + ih - (v / max) * ih;
      let s = '';
      for (let i = 0; i <= steps; i++) {
        const v = (max / steps) * i;
        s += `<line class="${i ? 'gridline' : 'baseline'}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
      }
      const every = Math.ceil(points.length / Math.max(1, Math.floor(iw / 58)));
      points.forEach((p, i) => {
        const x = pad.l + slot * i + (slot - bw) / 2;
        s += `<rect class="hover" data-i="${i}" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${ih}"/>`;
        let run = 0;
        const shown = series.filter((sr) => p[sr.key]);
        shown.forEach((sr, k) => {
          const h = (p[sr.key] / max) * ih;
          const isTop = k === shown.length - 1;
          // 2px gap between segments, rounded top on the top-most one.
          const seg = bar(x, y(run + p[sr.key]), bw, Math.max(h - (isTop ? 0 : 2), 1), isTop ? Math.min(4, bw / 2) : 0, '');
          s += seg.replace('class=""', `style="fill:${sr.color}"`);
          run += p[sr.key];
        });
        if (i % every === 0) s += `<text class="axis" x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(p.label)}</text>`;
      });
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = s;
      const hide = () => {
        tip.classList.remove('show');
        svg.querySelectorAll('.hover.on').forEach((h) => h.classList.remove('on'));
      };
      svg.onpointermove = (e) => {
        const rect = svg.getBoundingClientRect();
        const i = Math.floor(((e.clientX - rect.left) * (W / rect.width) - pad.l) / slot);
        const p = points[i];
        if (!p) return hide();
        svg.querySelectorAll('.hover').forEach((h) => h.classList.toggle('on', h.dataset.i === String(i)));
        tip.innerHTML = `<b>${esc(p.title)}</b>${series.map((sr) => `<div class="t"><span><i class="sw" style="background:${sr.color}"></i>${esc(sr.label)}</span><span>${p[sr.key] ?? 0}</span></div>`).join('')}`;
        tip.style.left = `${Math.min(Math.max(pad.l + slot * i + slot / 2, 90), W - 90)}px`;
        tip.style.top = `${y(total(p))}px`;
        tip.classList.add('show');
      };
      svg.onpointerleave = hide;
    },
  });
}

// Lines on one scale over time. series: [{ label, color, points: [{ date, value }] }]
export function lineChart(el, { series, from, to, format, dateLabel, aria, height = 220 }) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const at = (s, d) => s.points.find((p) => p.date === d)?.value;
  chartFrame(el, {
    legend: series.map(legendItem).join(''),
    aria,
    height,
    table: () => `<table class="num"><thead><tr><th>Counted on</th>${series.map((s) => `<th class="r">${esc(s.label)}</th>`).join('')}</tr></thead>
      <tbody>${dates.map((d) => `<tr><td>${esc(dateLabel(d))}</td>${series.map((s) => `<td class="r">${at(s, d) === undefined ? '–' : format(at(s, d))}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
    draw: (box) => {
      const svg = box.querySelector('svg');
      const tip = box.querySelector('.tooltip');
      const W = box.clientWidth || 600;
      const H = box.clientHeight || height;
      const longest = Math.max(...series.map((s) => s.label.length));
      const pad = { l: 44, r: 16 + longest * 6.5, t: 10, b: 22 };
      const iw = W - pad.l - pad.r;
      const ih = H - pad.t - pad.b;
      const vals = series.flatMap((s) => s.points.map((p) => p.value));
      const hi = niceMax(Math.max(...vals, 0));
      const lo = Math.min(...vals, 0) < 0 ? -niceMax(-Math.min(...vals)) : 0;
      const t0 = Date.parse(`${from}T00:00:00Z`);
      const span = Math.max(Date.parse(`${to}T00:00:00Z`) - t0, 1);
      const x = (d) => pad.l + ((Date.parse(`${d}T00:00:00Z`) - t0) / span) * iw;
      const y = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
      let s = '';
      for (let i = 0; i <= 4; i++) {
        const v = lo + ((hi - lo) / 4) * i;
        s += `<line class="${v === 0 ? 'baseline' : 'gridline'}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`;
      }
      s += `<text class="axis" x="${pad.l}" y="${H - 4}">${esc(dateLabel(from))}</text><text class="axis" x="${W - pad.r}" y="${H - 4}" text-anchor="end">${esc(dateLabel(to))}</text>`;
      // Direct labels at the line ends, nudged apart when lines finish close together.
      const ends = series.filter((l) => l.points.length).map((l) => ({ l, cy: y(l.points.at(-1).value) })).sort((a, b) => a.cy - b.cy);
      ends.forEach((e, i) => {
        if (i && e.cy - ends[i - 1].cy < 14) e.cy = ends[i - 1].cy + 14;
      });
      for (const l of series) {
        if (!l.points.length) continue;
        s += `<polyline fill="none" stroke="${l.color}" stroke-width="2" stroke-linejoin="round" points="${l.points.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')}"/>`;
        s += l.points.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.value)}" r="4" fill="${l.color}" stroke="var(--surface)" stroke-width="2"/>`).join('');
      }
      for (const e of ends) s += `<text class="axis" x="${x(e.l.points.at(-1).date) + 9}" y="${e.cy + 4}">${esc(e.l.label)}</text>`;
      s += `<line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" stroke="var(--text-3)" stroke-width="1" opacity="0"/>`;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = s;
      const cross = svg.querySelector('.cross');
      const hide = () => {
        tip.classList.remove('show');
        cross.setAttribute('opacity', 0);
      };
      svg.onpointermove = (e) => {
        if (!dates.length) return;
        const rect = svg.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (W / rect.width);
        const d = dates.reduce((best, c) => (Math.abs(x(c) - px) < Math.abs(x(best) - px) ? c : best), dates[0]);
        cross.setAttribute('x1', x(d));
        cross.setAttribute('x2', x(d));
        cross.setAttribute('opacity', 0.5);
        tip.innerHTML = `<b>${esc(dateLabel(d))}</b>${series.map((l) => `<div class="t"><span><i class="sw" style="background:${l.color}"></i>${esc(l.label)}</span><span>${at(l, d) === undefined ? '–' : format(at(l, d))}</span></div>`).join('')}`;
        tip.style.left = `${Math.min(Math.max(x(d), 90), W - 90)}px`;
        tip.style.top = `${pad.t + 20}px`;
        tip.classList.add('show');
      };
      svg.onpointerleave = hide;
    },
  });
}
