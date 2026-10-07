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
      const i = Math.floor((e.clientX - rect.left - pad.l) / slot);
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
