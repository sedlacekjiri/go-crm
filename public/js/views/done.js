// Tasks → Done: everything ticked off – tasks, visits and published posts (with who published them) –
// grouped by day, with search and an undo.
import { avatar, categoryTag, channelTags, kpi, onSeg, seg } from '../components.js';
import { groupDone, shiftDate, subtaskProgress, today, weekDays } from '../lib.js';
import { api, can, isAdmin, state, taskPerson, userById } from '../store.js';
import { postModal } from './marketing.js';
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

// A published post in the Done list: who put it live, where, and a link to it.
function postItem(x, category) {
  const p = x.post;
  const who = userById(p.published_by);
  return `<li class="task">
    ${isAdmin() && can('marketing') ? `<button type="button" class="tick on post" data-unpublish="${p.id}" title="Mark as not published" aria-label="Mark as not published">✓</button>` : '<span class="tick on post">✓</span>'}
    <div class="body">
      <button type="button" class="title as-link" data-post="${p.id}">📣 Published: ${esc(p.title)}</button>
      <div class="meta">${[
        who ? `<span class="assignee">${avatar(who, 18)}${esc(who.name.split(' ')[0])}</span>` : '',
        !category ? categoryTag('marketing') : '',
        channelTags(p.channels),
        x.lateBy ? `<span class="pill overdue">${x.lateBy} day${x.lateBy === 1 ? '' : 's'} late</span>` : '<span class="pill good">on time</span>',
        p.post_url ? `<a href="${esc(p.post_url)}" target="_blank" rel="noreferrer">View post ↗</a>` : '',
      ]
        .filter(Boolean)
        .join('')}</div>
    </div>
    <span class="muted small nowrap">${new Date(p.published_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
  </li>`;
}

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
  // Published posts count as done marketing work, on the day they went live.
  const from = v.period === 'all' ? '' : shiftDate(t, -Number(v.period) + 1);
  const posts = (can('marketing') ? state.posts : [])
    .filter((p) => p.status === 'published' && p.published_at && today(new Date(p.published_at)) >= from)
    .map((p) => ({ id: p.id, kind: 'post', post: p, title: p.title, notes: p.notes, category: 'marketing', due_date: p.publish_date, done_at: p.published_at }));
  const list = [...all, ...posts]
    .map((x) => ({ ...x, partner: byId.get(x.partner_id) ?? null }))
    .filter((x) => !category || (x.category || 'sales') === category)
    .filter((x) => !q || [x.title, x.notes, x.partner?.name, ...(x.subtasks ?? []).map((s) => s.title)].some((s) => s && s.toLowerCase().includes(q)));
  const groups = groupDone(list);
  const week = weekDays(t);
  const doneDay = (x) => (x.done_at ? today(new Date(x.done_at)) : x.due_date);
  const thisWeek = list.filter((x) => doneDay(x) >= week[0]).length;
  const visits = list.filter((x) => x.type === 'visit').length;
  const published = list.filter((x) => x.kind === 'post').length;
  const onTime = list.filter((x) => doneDay(x) <= x.due_date).length;

  el.innerHTML = `
    <div class="kpis">
      ${kpi('Done this week', thisWeek, 'since Monday')}
      ${kpi(`Done · ${PERIODS.find((p) => p.value === v.period).label.toLowerCase()}`, list.length, `${[`${list.length - visits - published} task${list.length - visits - published === 1 ? '' : 's'}`, `${visits} visit${visits === 1 ? '' : 's'}`, published ? `${published} post${published === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}`)}
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
                if (x.kind === 'post') return postItem(x, category);
                const prog = subtaskProgress(x);
                return `<li class="task">
                  ${isAdmin() ? `<button type="button" class="tick on" data-undo="${x.id}" title="Mark as not done" aria-label="Mark as not done">✓</button>` : '<span class="tick on">✓</span>'}
                  <div class="body">
                    <span class="title">${x.type === 'visit' ? `Visit ${esc(x.partner?.name ?? '(removed partner)')}` : esc(x.title)}</span>
                    <div class="meta">${[
                      taskPerson(x) ? `<span class="assignee">${avatar(taskPerson(x), 18)}${esc(taskPerson(x).name.split(' ')[0])}</span>` : '',
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
  el.querySelectorAll('[data-post]').forEach((b) => b.addEventListener('click', () => postModal(state.posts.find((p) => p.id === b.dataset.post), ctx.refresh)));
  el.querySelectorAll('[data-unpublish]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Mark this post as not published (back to Scheduled)?')) return;
      try {
        await api('/api/posts', { method: 'POST', body: { id: b.dataset.unpublish, status: 'scheduled' } });
        toast('Back to Scheduled');
        ctx.refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
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
