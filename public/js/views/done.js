// Tasks → Done: everything you've ticked off, grouped by day, with search and an undo.
import { categoryTag, kpi, onSeg, seg } from '../components.js';
import { groupDone, shiftDate, subtaskProgress, today, weekDays } from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { esc, toast } from '../util.js';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All' },
];
const v = { period: '30', q: '' };

const dayTitle = (d) => {
  const t = today();
  const name = new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  if (d === t) return `Today · ${name}`;
  if (d === shiftDate(t, -1)) return `Yesterday · ${name}`;
  return name;
};

export async function renderDone(el, category, ctx) {
  el.innerHTML = '<div class="loading">Loading…</div>';
  const t = today();
  let all;
  try {
    all = await api(`/api/tasks?done=1${v.period === 'all' ? '' : `&from=${shiftDate(t, -Number(v.period) + 1)}`}`);
  } catch (err) {
    el.innerHTML = `<div class="banner error-banner">${esc(err.message)}</div>`;
    return;
  }
  if (!ctx.isCurrent()) return;
  const byId = new Map(state.partners.map((p) => [p.id, p]));
  const q = v.q.trim().toLowerCase();
  const list = all
    .map((x) => ({ ...x, partner: byId.get(x.partner_id) ?? null }))
    .filter((x) => !category || (x.category || 'sales') === category)
    .filter((x) => !q || [x.title, x.notes, x.partner?.name, ...(x.subtasks ?? []).map((s) => s.title)].some((s) => s && s.toLowerCase().includes(q)));
  const groups = groupDone(list);
  const week = weekDays(t);
  const doneDay = (x) => (x.done_at ? today(new Date(x.done_at)) : x.due_date);
  const thisWeek = list.filter((x) => doneDay(x) >= week[0]).length;
  const visits = list.filter((x) => x.type === 'visit').length;
  const onTime = list.filter((x) => doneDay(x) <= x.due_date).length;

  el.innerHTML = `
    <div class="kpis">
      ${kpi('Done this week', thisWeek, 'since Monday')}
      ${kpi(`Done · ${PERIODS.find((p) => p.value === v.period).label.toLowerCase()}`, list.length, `${list.length - visits} task${list.length - visits === 1 ? '' : 's'} · ${visits} hotel visit${visits === 1 ? '' : 's'}`)}
      ${kpi('On time', list.length ? `${Math.round((onTime / list.length) * 100)} %` : '–', 'done by the deadline')}
      ${kpi('Subtasks ticked', list.reduce((s, x) => s + subtaskProgress(x).done, 0), 'inside these tasks')}
    </div>
    <div class="toolbar">
      <input class="input grow" type="search" placeholder="Search done tasks…" value="${esc(v.q)}" data-q />
      ${seg('period', v.period, PERIODS)}
    </div>
    ${
      groups.length
        ? groups
            .map(
              (g) => `<section class="card done-day">
            <div class="card-head"><h2>${esc(dayTitle(g.day))}</h2><span class="sub">${g.items.length} done</span></div>
            <ul class="tasks">${g.items
              .map((x) => {
                const prog = subtaskProgress(x);
                return `<li class="task">
                  ${isAdmin() ? `<button type="button" class="tick on" data-undo="${x.id}" title="Mark as not done" aria-label="Mark as not done">✓</button>` : '<span class="tick on">✓</span>'}
                  <div class="body">
                    <span class="title">${x.type === 'visit' ? `Visit ${esc(x.partner?.name ?? '(removed partner)')}` : esc(x.title)}</span>
                    <div class="meta">${[
                      !category ? categoryTag(x.category) : '',
                      x.lateBy ? `<span class="pill overdue">${x.lateBy} day${x.lateBy === 1 ? '' : 's'} late</span>` : '<span class="pill good">on time</span>',
                      x.partner && x.type !== 'visit' ? `<a href="#/partner/${x.partner.id}">${esc(x.partner.name)}</a>` : x.type === 'visit' && x.partner ? `<a href="#/partner/${x.partner.id}">${esc(x.partner.area ?? 'open')}</a>` : '',
                      prog.total ? `<span>☑ ${prog.done}/${prog.total} subtasks</span>` : '',
                      x.notes ? `<span>${esc(x.notes.length > 80 ? `${x.notes.slice(0, 80)}…` : x.notes)}</span>` : '',
                    ]
                      .filter(Boolean)
                      .join('')}</div>
                  </div>
                  <span class="muted small nowrap">${x.done_at ? new Date(x.done_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </li>`;
              })
              .join('')}</ul>
          </section>`
            )
            .join('')
        : `<div class="empty-box"><b>Nothing done${q ? ' matching that' : ' in this period'} yet</b>${v.period !== 'all' ? '<p>Try “All”.</p>' : ''}</div>`
    }`;

  onSeg(el, 'period', (p) => {
    v.period = p;
    renderDone(el, category, ctx);
  });
  const search = el.querySelector('[data-q]');
  search.addEventListener('change', () => {
    v.q = search.value;
    renderDone(el, category, ctx);
  });
  search.addEventListener('keydown', (e) => e.key === 'Enter' && search.blur());
  el.querySelectorAll('[data-undo]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api('/api/tasks', { method: 'POST', body: { id: b.dataset.undo, done: false } });
        toast('Moved back to open tasks');
        ctx.refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}
