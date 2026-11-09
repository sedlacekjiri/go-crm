// Home for the marketing team: socials and reviews, the team's tasks, collaborations and charts.
import { lineChart, stackChart } from '../chart.js';
import { avatar, kpi, onSeg, seg } from '../components.js';
import { compactNumber, marketingDeadlines, marketingReport, reportPlaces, today } from '../lib.js';
import { api, assigneeId, state, userById } from '../store.js';
import { bucketLabel, esc, money, num, relativeDays, shortDate } from '../util.js';

const PERIODS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];
const CHANNEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
const CHANNEL_COLOR = { instagram: 'var(--ch-ig)', facebook: 'var(--ch-fb)', tiktok: 'var(--ch-tt)' };
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${num(Math.abs(n))}`;

let days = 30; // survives leaving Home and coming back

export async function renderMarketingReport(el, isCurrent) {
  let reviews = null;
  const paint = () => draw(el, reviews);
  paint();
  try {
    reviews = await api('/api/reviews');
    if (isCurrent() && el.isConnected) paint();
  } catch {
    // The Google tile just stays empty; the rest of the report doesn't need it.
  }
}

function draw(el, reviews) {
  const t = today();
  const r = marketingReport(state, days, assigneeId, t);
  const places = reportPlaces(reviews, r.from);
  const deadlines = marketingDeadlines(state, t, 14).slice(0, 6);
  const period = `last ${days} days`;

  el.innerHTML = `
    <header class="report-head"><div><h2>Marketing report</h2><p class="muted small">${esc(shortDate(r.from))} – ${esc(shortDate(t))}</p></div>${seg('report-days', days, PERIODS)}</header>

    <div class="kpis report-kpis">
      ${r.followers
        .map((f) =>
          kpi(
            `${CHANNEL[f.channel]} followers`,
            f.total === null ? '–' : compactNumber(f.total),
            f.total === null ? 'not counted yet' : `${f.gained === null ? 'no new count' : `<b>${signed(f.gained)}</b> in ${days} days`}${f.updated ? ` · counted ${esc(shortDate(f.updated))}` : ''}`
          )
        )
        .join('')}
      ${
        places.length
          ? places.map((p) => kpi('Google rating', `★ ${Number(p.rating).toFixed(1)}`, `${num(p.total)} reviews${p.gained !== null ? ` · <b>${signed(p.gained)}</b> in ${days} days` : ''} · ${esc(p.name)}`)).join('')
          : kpi('Google rating', '–', reviews ? 'no listing tracked yet' : 'loading…')
      }
      ${kpi('Collaborations', r.collabs.total, `${r.collabs.delivered} delivered · ${period}`)}
      ${kpi('Their audience', compactNumber(r.collabs.reach), 'followers of those collaborators')}
      ${kpi('Marketing tasks done', r.taskTotals.done, `${r.taskTotals.open} open${r.taskTotals.overdue ? ` · <b class="late">${r.taskTotals.overdue} overdue</b>` : ''}`)}
    </div>

    <div class="grid">
      <section class="card"><div class="card-head"><h2>Posts published <span class="muted">· per ${r.daily ? 'day' : 'week'}</span></h2><span class="sub">${r.posts.total} in total</span></div><div data-chart="posts"></div></section>
      <section class="card"><div class="card-head"><h2>Followers gained <span class="muted">· ${period}</span></h2><a class="link-btn" href="#/marketing">Marketing →</a></div><div data-chart="followers"></div></section>
      <section class="card"><div class="card-head"><h2>Tasks by person <span class="muted">· done in the ${period}</span></h2><a class="link-btn" href="#/tasks">Tasks →</a></div>${teamBars(r.team)}</section>
      <section class="card"><div class="card-head"><h2>Collaborations <span class="muted">· by month of the trip</span></h2><a class="link-btn" href="#/collaborators">Open →</a></div><div data-chart="collabs"></div></section>
      <section class="card"><div class="card-head"><h2>Waiting for content${r.collabs.waiting.length ? ` <span class="muted">· ${r.collabs.waiting.length} finished trips</span>` : ''}</h2>${r.collabs.refundsDue ? `<span class="sub">${r.collabs.refundsDue} refund${r.collabs.refundsDue > 1 ? 's' : ''} to pay · ${money(r.collabs.refundsEur, 'EUR')}</span>` : ''}</div>
        ${
          r.collabs.waiting.length
            ? `<div class="list">${r.collabs.waiting
                .slice(0, 6)
                .map((c) => `<a class="row" href="#/collaborators"><span class="name"><b>${esc(c.name)}</b><br><span class="muted small">${esc([c.vehicle, `returned ${shortDate(c.dropoff_date)}`].filter(Boolean).join(' · '))}</span></span></a>`)
                .join('')}</div>${r.collabs.waiting.length > 6 ? `<a class="link-btn" href="#/collaborators">+ ${r.collabs.waiting.length - 6} more →</a>` : ''}`
            : '<p class="empty">Nothing overdue: every finished trip has delivered its content.</p>'
        }
      </section>
      <section class="card"><div class="card-head"><h2>Next deadlines <span class="muted">· 14 days</span></h2></div>
        ${
          deadlines.length
            ? `<div class="list">${deadlines
                .map((d) => `<a class="row" href="${d.kind === 'post' ? '#/marketing' : '#/tasks'}"><span class="name"><b>${esc(d.title)}</b><br><span class="muted small">${d.kind === 'post' ? 'Post' : 'Task'} · ${esc(shortDate(d.date))}</span></span><span class="pill ${d.date < t ? 'overdue' : d.date === t ? 'today' : ''}">${esc(relativeDays(d.date))}</span></a>`)
                .join('')}</div>`
            : '<p class="empty">No deadlines in the next 14 days.</p>'
        }
      </section>
    </div>`;

  onSeg(el, 'report-days', (v) => {
    days = Number(v);
    draw(el, reviews);
  });

  stackChart(el.querySelector('[data-chart="posts"]'), {
    aria: `Posts published per ${r.daily ? 'day' : 'week'}, by brand`,
    series: [
      { key: 'car', label: 'Go Car Rentals', color: 'var(--car)' },
      { key: 'camper', label: 'Go Campers', color: 'var(--camper)' },
      { key: 'both', label: 'Both', color: 'var(--text-3)' },
    ],
    points: r.posts.buckets.map((b) => ({ ...b, label: bucketLabel(b.key, 'day'), title: r.daily ? shortDate(b.key) : `Week of ${shortDate(b.key)}` })),
  });

  const followersEl = el.querySelector('[data-chart="followers"]');
  const series = r.gains.filter((g) => g.points.length).map((g) => ({ label: CHANNEL[g.channel], color: CHANNEL_COLOR[g.channel], points: g.points }));
  if (series.length) {
    lineChart(followersEl, { aria: 'Followers gained per channel', series, from: r.from, to: t, format: (v) => signed(v).replace('±0', '0'), dateLabel: shortDate });
  } else {
    followersEl.innerHTML = `<p class="empty">No follower counts in the ${period}. Add one under <a class="link-btn" href="#/marketing">Marketing → Update followers</a>.</p>`;
  }

  stackChart(el.querySelector('[data-chart="collabs"]'), {
    aria: 'Collaborations per month, content delivered or not yet',
    series: [
      { key: 'delivered', label: 'Content delivered', color: 'var(--good)' },
      { key: 'waiting', label: 'Not delivered yet', color: 'var(--text-3)' },
    ],
    points: r.collabs.months.map((m) => ({ ...m, label: bucketLabel(m.key, 'month'), title: bucketLabel(m.key, 'month') })),
  });
}

// One row per person: numbers in words next to the bar, so color isn't the only signal.
function teamBars(team) {
  if (!team.length) return '<p class="empty">No marketing tasks in this period.</p>';
  const max = Math.max(...team.map((p) => p.done + p.open + p.overdue), 1);
  const seg_ = (n, cls, label) => (n ? `<i class="${cls}" style="flex:${n}" title="${n} ${label}"></i>` : '');
  return `<div class="legend"><span><i class="sw" style="background:var(--good)"></i>✓ Done</span><span><i class="sw" style="background:var(--text-3)"></i>Open</span><span><i class="sw" style="background:var(--bad)"></i>⚠ Overdue</span></div>
    <div class="team-bars">${team
      .map((p) => {
        const u = p.id ? userById(p.id) : null;
        const n = p.done + p.open + p.overdue;
        return `<div class="team-row">
          <span class="who">${u ? avatar(u, 24) : ''}<b>${esc(u ? u.name.split(' ')[0] : 'Unassigned')}</b></span>
          <span class="track"><span class="fill" style="width:${(n / max) * 100}%">${seg_(p.done, 'd', 'done')}${seg_(p.open, 'o', 'open')}${seg_(p.overdue, 'l', 'overdue')}</span></span>
          <span class="nums muted small">${p.done} done · ${p.open} open${p.overdue ? ` · <b class="late">${p.overdue} overdue</b>` : ''}</span>
        </div>`;
      })
      .join('')}</div>`;
}
