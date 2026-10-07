// Home: the overview for you (follow-ups) and the owners (results).
import { revenueChart } from '../chart.js';
import { followUpPill, kpi, stageBadge } from '../components.js';
import {
  activityLabel,
  actuals,
  agenda,
  overdue,
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
import { dateTime, esc, money, monthLabel, num, pct, shortDate } from '../util.js';

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
  const day = agenda(t, state);
  const late = overdue(t, state);
  const lateCount = late.tasks.length + late.followUps.length;
  const todayItems = [
    ...day.visits.map((v) => ({ title: v.partner.name, sub: `Visit · ${v.partner.area ?? ''}`, href: `#/partner/${v.partner.id}`, done: v.done, pill: v.done ? '<span class="pill good">Visited</span>' : '<span class="pill">Visit</span>' })),
    ...day.followUps.map((p) => ({ title: p.name, sub: `Follow-up · ${STAGES.find((s) => s.value === p.stage)?.label}`, href: `#/partner/${p.id}`, done: false, pill: followUpPill(p.next_follow_up) })),
    ...day.posts.map((x) => ({ title: x.title, sub: ['Post', x.publish_time, x.channels.map((c) => c[0].toUpperCase() + c.slice(1)).join(', ')].filter(Boolean).join(' · '), href: '#/marketing', done: x.status === 'published', pill: x.status === 'published' ? '<span class="pill good">Published</span>' : '<span class="pill">Post</span>' })),
    ...day.ongoing.map((x) => ({ title: x.title, sub: `In progress · deadline ${shortDate(x.due_date)}`, href: '#/tasks', done: false, pill: '' })),
    ...day.todos.map((x) => ({ title: x.title, sub: ['To-do', x.due_time, x.partner?.name].filter(Boolean).join(' · '), href: '#/tasks', done: x.done, pill: x.done ? '<span class="pill good">Done</span>' : '' })),
  ];
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
        <div class="card-head"><h2>Today</h2><a class="link-btn" href="#/tasks">Tasks →</a></div>
        ${
          todayItems.length
            ? `<div class="list">${todayItems
                .slice(0, 8)
                .map(
                  (x) => `<a class="row" href="${x.href}"><span class="name">${x.done ? '<span class="muted">✓ </span>' : ''}<b>${esc(x.title)}</b><br><span class="muted small">${esc(x.sub)}</span></span>${x.pill}</a>`
                )
                .join('')}${todayItems.length > 8 ? `<a class="link-btn" style="padding:6px 8px" href="#/tasks">+ ${todayItems.length - 8} more</a>` : ''}</div>`
            : `<p class="empty">Nothing planned for today. ${isAdmin() ? '<a class="link-btn" href="#/tasks">Plan visits →</a>' : ''}</p>`
        }
        ${lateCount ? `<a class="pill overdue" style="margin-top:10px" href="#/tasks">⚠ ${lateCount} overdue</a>` : ''}
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
