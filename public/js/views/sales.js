// Sales imported from Caren: revenue per day / week / month, per brand and per partner, EUR or ISK.
import { revenueChart } from '../chart.js';
import { emptyBox, kpi, onSeg, pageHeader, seg } from '../components.js';
import { brandLabel, codeKey, isPartnerSale, parseNumber, partnerByCode, revenueByPartner, revenueSeries, saleValue, shiftDate, today, totals } from '../lib.js';
import { currency, isAdmin, loadSales, state } from '../store.js';
import { esc, money, num, options, pct, shortDate } from '../util.js';

const PRESETS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'mtd', label: 'This month' },
  { value: 'lm', label: 'Last month' },
  { value: 'ytd', label: 'This year' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom…' },
];

function presetRange(p, t = today()) {
  if (p === '7d') return { from: shiftDate(t, -6), to: t };
  if (p === '30d') return { from: shiftDate(t, -29), to: t };
  if (p === '90d') return { from: shiftDate(t, -89), to: t };
  if (p === 'mtd') return { from: `${t.slice(0, 7)}-01`, to: t };
  if (p === 'lm') {
    const last = shiftDate(`${t.slice(0, 7)}-01`, -1);
    return { from: `${last.slice(0, 7)}-01`, to: last };
  }
  if (p === 'ytd') return { from: `${t.slice(0, 4)}-01-01`, to: t };
  return { from: `${shiftDate(t, -364).slice(0, 7)}-01`, to: t };
}

const autoGranularity = ({ from, to }) => {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  return days <= 45 ? 'day' : days <= 200 ? 'week' : 'month';
};

// View state survives navigation.
const v = { preset: '30d', range: presetRange('30d'), granularity: 'day', brand: '', source: 'all', showAll: false };

export async function render(page, ctx) {
  const cur = currency.value;
  page.innerHTML = `
    ${pageHeader('Sales', 'Bookings imported from Caren', isAdmin() ? '<a class="btn" href="#/sales/import">Import bookings</a>' : '')}
    <div class="toolbar">
      <select class="input" data-f="preset" aria-label="Period">${options(PRESETS, v.preset)}</select>
      ${v.preset === 'custom' ? `<input class="input" type="date" data-f="from" value="${v.range.from}" max="${v.range.to}" aria-label="From" /><input class="input" type="date" data-f="to" value="${v.range.to}" min="${v.range.from}" aria-label="To" />` : ''}
      ${seg('granularity', v.granularity, [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
      ])}
      <select class="input" data-f="brand" aria-label="Brand">${options(
        [
          { value: 'car', label: 'Go Car Rentals' },
          { value: 'camper', label: 'Go Campers' },
        ],
        v.brand,
        { empty: 'Both brands' }
      )}</select>
      <select class="input" data-f="source" aria-label="Source">${options(
        [
          { value: 'all', label: 'All bookings' },
          { value: 'partners', label: 'Via CRM partners' },
          { value: 'other', label: 'Not via partners' },
        ],
        v.source
      )}</select>
    </div>
    <div id="salesBody"><div class="loading">Loading…</div></div>`;

  const rerender = () => render(page, ctx);
  page.querySelectorAll('[data-f]').forEach((el) =>
    el.addEventListener('change', () => {
      const f = el.dataset.f;
      if (f === 'preset') {
        v.preset = el.value;
        if (v.preset !== 'custom') v.range = presetRange(v.preset);
        v.granularity = autoGranularity(v.range);
      } else if (f === 'from' || f === 'to') {
        if (el.value) v.range = { ...v.range, [f]: el.value };
        v.granularity = autoGranularity(v.range);
      } else v[f] = el.value;
      rerender();
    })
  );
  onSeg(page, 'granularity', (g) => {
    v.granularity = g;
    rerender();
  });

  const all = await loadSales(v.range.from, v.range.to);
  if (!ctx.isCurrent()) return;
  const body = page.querySelector('#salesBody');
  if (!body) return;

  if (!all.length) {
    const info = state.salesInfo;
    body.innerHTML = emptyBox(
      'No bookings in this period',
      info?.n
        ? `<p>${num(info.n)} bookings are imported in total (${shortDate(info.first)} – ${shortDate(info.last)}). Try a longer period.</p>`
        : isAdmin()
          ? '<p>Export bookings from Caren and <a class="link-btn" href="#/sales/import">import them</a>.</p>'
          : ''
    );
    return;
  }

  const byCode = partnerByCode(state.partners);
  const sales = all.filter(
    (s) => (!v.brand || (v.brand === 'camper' ? s.brand === 'camper' : s.brand !== 'camper')) && (v.source === 'all' || (v.source === 'partners') === isPartnerSale(s, byCode))
  );
  const t = totals(sales, cur);
  const pt = totals(
    sales.filter((s) => isPartnerSale(s, byCode)),
    cur
  );
  const bySource = revenueByPartner(sales, state.partners, cur);
  const list = v.showAll ? sales : sales.slice(0, 30);

  body.innerHTML = `
    <div class="kpis">
      ${kpi('Revenue', money(t.revenue, cur), `${t.bookings} bookings${t.cancelled ? ` · ${t.cancelled} cancelled` : ''}`)}
      ${kpi('Avg. booking', money(t.avgBooking, cur), t.avgDays ? `${num(t.avgDays, 1)} rental days on average` : '')}
      ${kpi('Via partners', money(pt.revenue, cur), `${pt.bookings} bookings`)}
      ${kpi('Partner share', pct(pt.revenue, t.revenue), 'of revenue')}
    </div>
    <section class="card"><div class="card-head"><h2>Revenue by booking date</h2></div><div id="salesChart"></div></section>
    <div class="grid grid-side">
      <section class="card">
        <div class="card-head"><h2>By source</h2><span class="sub">affiliate code</span></div>
        <div class="list">${bySource
          .slice(0, 25)
          .map((r) => {
            const label = r.partner
              ? `<b>${esc(r.partner.name)}</b>`
              : r.code
                ? `<span class="mono">${esc(r.code)}</span> <span class="muted small">no partner in CRM</span>`
                : '<span class="muted">Direct / no affiliate</span>';
            const tag = r.partner ? 'a' : 'div';
            return `<${tag} class="row" ${r.partner ? `href="#/partner/${r.partner.id}"` : ''}><span class="fill" style="width:${(r.revenue / (bySource[0].revenue || 1)) * 100}%"></span>
              <span class="name">${label}</span><span class="val num">${money(r.revenue, cur)}<small>${r.bookings}× · ${pct(r.revenue, t.revenue)}</small></span></${tag}>`;
          })
          .join('')}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Converter</h2><span class="sub" data-rate>${currency.rate ? `ECB ${currency.rateDate}` : ''}</span></div>
        <div id="converter"></div>
      </section>
    </div>
    <section class="card" style="margin-top:12px">
      <div class="card-head"><h2>Bookings <span class="muted">(${sales.length})</span></h2></div>
      <div class="table-wrap"><table class="num">
        <thead><tr><th>Booked</th><th>Ref</th><th class="opt">Brand</th><th class="opt">Vehicle</th><th class="opt">Pickup</th><th>Source</th><th class="r">Amount</th></tr></thead>
        <tbody>${list
          .map((s) => {
            const p = byCode.get(codeKey(s.affiliate_code));
            return `<tr class="${s.is_cancelled ? 'cancelled' : ''}">
              <td class="nowrap">${shortDate(s.booking_date)}</td><td class="mono">${esc(s.booking_ref)}</td>
              <td class="opt nowrap">${esc(brandLabel(s.brand))}</td><td class="opt">${esc(s.vehicle ?? '–')}</td>
              <td class="opt nowrap">${shortDate(s.pickup_date)}${s.rental_days ? ` <span class="muted">· ${s.rental_days}d</span>` : ''}</td>
              <td>${p ? esc(p.name) : s.affiliate_code ? esc(s.affiliate_code) : '<span class="muted">Direct</span>'}</td>
              <td class="r nowrap">${money(saleValue(s, cur), cur)}</td></tr>`;
          })
          .join('')}</tbody>
      </table></div>
      ${sales.length > 30 ? `<button class="btn secondary sm" style="margin-top:12px" data-all>${v.showAll ? 'Show less' : `Show all ${sales.length}`}</button>` : ''}
    </section>`;

  revenueChart(body.querySelector('#salesChart'), revenueSeries(sales, v.range.from, v.range.to, v.granularity, cur), { currency: cur, granularity: v.granularity });
  converter(body.querySelector('#converter'));
  body.querySelector('[data-all]')?.addEventListener('click', () => {
    v.showAll = !v.showAll;
    rerender();
  });
}

// EUR ⇄ ISK with today's ECB rate. Typing in either box updates the other.
function converter(el) {
  const rate = currency.rate;
  if (!rate) {
    el.innerHTML = '<p class="empty">Loading today’s rate…</p>';
    return;
  }
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end">
      <label class="field"><span>EUR</span><input class="input num" inputmode="decimal" data-eur value="100" /></label>
      <span class="muted" style="padding-bottom:10px">⇄</span>
      <label class="field"><span>ISK</span><input class="input num" inputmode="numeric" data-isk value="${Math.round(100 * rate)}" /></label>
    </div>
    <p class="muted small" style="margin-top:10px">1 € = ${rate.toFixed(2)} kr · 1 000 kr = ${money(1000 / rate, 'EUR')}</p>`;
  const eur = el.querySelector('[data-eur]');
  const isk = el.querySelector('[data-isk]');
  eur.addEventListener('input', () => {
    const n = parseNumber(eur.value);
    isk.value = n === null ? '' : Math.round(n * rate);
  });
  isk.addEventListener('input', () => {
    const n = parseNumber(isk.value);
    eur.value = n === null ? '' : Math.round((n / rate) * 100) / 100;
  });
}
