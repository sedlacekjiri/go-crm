// Home: the overview for you (follow-ups) and the owners (results).
import { revenueChart } from '../chart.js';
import { followUpPill, kpi, stageBadge } from '../components.js';
import {
  activityLabel,
  actuals,
  GOAL_METRICS,
  isPartnerSale,
  monthElapsed,
  monthOf,
  partnerByCode,
  revenueByPartner,
  revenueSeries,
  shiftDate,
  STAGES,
  today,
  totals,
} from '../lib.js';
import { currency, isAdmin, loadSales, state } from '../store.js';
import { dateTime, esc, money, monthLabel, num, pct } from '../util.js';

export async function render(page, { isCurrent }) {
  const t = today();
  const month = monthOf(t);
  const chartFrom = shiftDate(t, -7 * 12 + 1);
  const from = `${month}-01` < chartFrom ? `${month}-01` : chartFrom;
  const cur = currency.value;

  page.innerHTML = '<div class="loading">Loading…</div>';
  const sales = await loadSales(from, t);
  if (!isCurrent()) return;

  const byCode = partnerByCode(state.partners);
  const partnerSales = sales.filter((s) => isPartnerSale(s, byCode));
  const last30 = (s) => s.booking_date >= shiftDate(t, -29);
  const p30 = totals(partnerSales.filter(last30), cur);
  const all30 = totals(sales.filter(last30), cur);
  const count = (stage) => state.partners.filter((p) => p.stage === stage).length;
  const followUps = state.partners
    .filter((p) => p.next_follow_up && p.next_follow_up <= shiftDate(t, 7) && !['accepted', 'declined'].includes(p.stage))
    .sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up));
  const actual = actuals(month, { ...state, sales });
  const target = Object.fromEntries(state.goals.filter((g) => g.month === month).map((g) => [g.metric, g.target]));
  const elapsed = monthElapsed(month);
  const top = revenueByPartner(partnerSales, state.partners, cur).slice(0, 5);
  const byId = new Map(state.partners.map((p) => [p.id, p]));
  const recent = state.activities.slice(0, 8);
  const maxStage = Math.max(1, ...STAGES.map((s) => count(s.value)));
  const fmtGoal = (metric, v) => (metric === 'revenue_eur' ? money(v, 'EUR') : num(v));

  page.innerHTML = `
    <header class="top">
      <div>
        <h1 class="page-title">Góðan daginn</h1>
        <p class="page-sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · Reykjavík partner network</p>
      </div>
      ${isAdmin() ? '<div class="controls"><a class="btn" href="#/partners/new">+ Add partner</a></div>' : ''}
    </header>

    <div class="kpis">
      ${kpi('Active partners', count('accepted'), `${count('in_talks')} interested · ${count('new')} to visit`)}
      ${kpi('Partner revenue · 30 days', money(p30.revenue, cur), `${p30.bookings} bookings`)}
      ${kpi('Share of all sales · 30 days', pct(p30.revenue, all30.revenue), all30.revenue ? `of ${money(all30.revenue, cur)}` : 'no sales imported yet')}
      ${kpi(`Visits · ${monthLabel(month).split(' ')[0]}`, actual.visits, target.visits !== undefined ? `target ${num(target.visits)}` : 'visits + meetings')}
    </div>

    <div class="grid grid-side">
      <section class="card">
        <div class="card-head"><h2>Revenue from partners · last 12 weeks</h2><a class="link-btn" href="#/sales">Sales →</a></div>
        <div id="dashChart"></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Follow-ups</h2><span class="sub">next 7 days</span></div>
        ${
          followUps.length
            ? `<div class="list">${followUps
                .slice(0, 8)
                .map(
                  (p) => `<a class="row" href="#/partner/${p.id}">
                    <span class="name"><b>${esc(p.name)}</b><br><span class="muted small">${esc(STAGES.find((s) => s.value === p.stage)?.label)}</span></span>
                    ${followUpPill(p.next_follow_up)}</a>`
                )
                .join('')}${followUps.length > 8 ? `<p class="muted small" style="padding:6px 8px">+ ${followUps.length - 8} more</p>` : ''}</div>`
            : `<p class="empty">Nothing due. ${count('new') ? `<a class="link-btn" href="#/pipeline">${count('new')} partners not visited yet →</a>` : ''}</p>`
        }
      </section>
    </div>

    <div class="grid grid-3">
      <section class="card">
        <div class="card-head"><h2>Goals · ${esc(monthLabel(month))}</h2><a class="link-btn" href="#/goals">Open →</a></div>
        ${GOAL_METRICS.map((g) => {
          const tg = target[g.value];
          const a = actual[g.value];
          return `<div class="goal-row">
            <div class="top-line"><span>${g.label}</span><span class="num"><b>${fmtGoal(g.value, a)}</b>${tg !== undefined ? ` / ${fmtGoal(g.value, tg)}` : ''}</span></div>
            <div class="progress ${tg !== undefined && a >= tg ? 'done' : ''}">
              ${tg !== undefined ? `<i style="width:${Math.min(100, (a / (tg || 1)) * 100)}%"></i>${elapsed < 1 ? `<b style="left:calc(${elapsed * 100}% - 1px)" title="Expected by today"></b>` : ''}` : ''}
            </div></div>`;
        }).join('')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Pipeline</h2><a class="link-btn" href="#/pipeline">Open →</a></div>
        <div class="funnel">
          ${STAGES.map((s) => {
            const n = count(s.value);
            return `<div class="f"><span>${s.label}</span><span class="bar"><i style="width:${(n / maxStage) * 100}%"></i></span><span class="n num">${n}</span></div>`;
          }).join('')}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Top partners · 12 weeks</h2></div>
        ${
          top.length
            ? `<div class="list">${top
                .map(
                  (r) => `<a class="row" href="#/partner/${r.partner.id}"><span class="fill" style="width:${(r.revenue / top[0].revenue) * 100}%"></span>
                    <span class="name">${esc(r.partner.name)}</span><span class="val num">${money(r.revenue, cur)}<small>${r.bookings}×</small></span></a>`
                )
                .join('')}</div>`
            : '<p class="empty">No partner bookings yet. They show up once a partner’s affiliate code appears in imported sales.</p>'
        }
      </section>
    </div>

    <section class="card" style="margin-top:12px">
      <div class="card-head"><h2>Recent activity</h2></div>
      ${
        recent.length
          ? `<div class="table-wrap"><table><tbody>${recent
              .map((a) => {
                const p = byId.get(a.partner_id);
                return `<tr class="clickable" data-href="#/partner/${a.partner_id}">
                  <td class="nowrap muted">${dateTime(a.happened_at)}</td>
                  <td><b>${esc(activityLabel(a.type))}</b> · ${esc(p?.name ?? '–')}${a.summary ? `<span class="muted"> – ${esc(a.summary.length > 110 ? `${a.summary.slice(0, 110)}…` : a.summary)}</span>` : ''}</td>
                  <td class="r opt">${p ? stageBadge(p.stage) : ''}</td></tr>`;
              })
              .join('')}</tbody></table></div>`
          : '<p class="empty">No visits logged yet. Open a partner and tap “Log visit” after each visit.</p>'
      }
    </section>`;

  revenueChart(page.querySelector('#dashChart'), revenueSeries(partnerSales, chartFrom, t, 'week', cur), { currency: cur, granularity: 'week', height: 230 });
  page.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => (location.hash = tr.dataset.href)));
}
