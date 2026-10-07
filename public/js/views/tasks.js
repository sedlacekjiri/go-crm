// Tasks & calendar: hotel visits, to-dos with deadlines, follow-ups and marketing posts – split into
// Sales and Marketing. A planned visit is ticked off automatically when the visit is logged.
import { categoryTag, channelTags, onSeg, pageHeader, seg, stageBadge } from '../components.js';
import { agenda, AREAS, daysLeft, subtaskProgress, dayCounts, monthGrid, monthOf, nextPlannedVisit, overdue, postStatusLabel, shiftDate, shiftMonth, STAGES, TASK_CATEGORIES, today, visitStats, weekDays } from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { esc, formData, monthLabel, openModal, options, shortDate, toast } from '../util.js';
import { postModal } from './marketing.js';
import { renderDone } from './done.js';
import { handleNoteClick, pinnedStrip, renderBoard } from './notes.js';
import { logActivity } from './partner.js';

// View state survives navigation.
let selected = null;
let mode = 'week';
let category = ''; // '' | 'sales' | 'marketing'
const expanded = new Set(); // tasks whose checklist is open
let refocus = null; // task id whose "add subtask" input should get focus after a redraw

const dayTitle = (d) => {
  const t = today();
  const name = new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  if (d === t) return `Today · ${name}`;
  if (d === shiftDate(t, 1)) return `Tomorrow · ${name}`;
  return name;
};

export function render(page, ctx) {
  const t = today();
  selected ??= t;
  const admin = isAdmin();
  const days = mode === 'week' ? weekDays(selected) : monthGrid(monthOf(selected));
  const counts = dayCounts(days, state, category);
  const day = agenda(selected, state, category);
  const late = overdue(t, state, category);
  const visits = visitStats(state.activities);
  const rangeLabel = mode === 'week' ? `${shortDate(days[0])} – ${shortDate(days[6])}` : monthLabel(monthOf(selected));

  const marker = (c) =>
    `<span class="marks">${'<i class="v"></i>'.repeat(Math.min(c.visits, 3))}${c.todos ? '<i class="t"></i>' : ''}${c.followUps ? '<i class="f"></i>' : ''}${c.posts ? '<i class="p"></i>' : ''}</span>`;

  const cell = (d) => {
    const c = counts.get(d);
    const cls = [d === selected && 'sel', d === t && 'today', mode === 'month' && monthOf(d) !== monthOf(selected) && 'out'].filter(Boolean).join(' ');
    return `<button type="button" class="day ${cls}" data-day="${d}" aria-pressed="${d === selected}" aria-label="${esc(dayTitle(d))}${c.open ? `, ${c.open} open` : ''}">
      ${mode === 'week' ? `<span class="dow">${new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}</span>` : ''}
      <span class="dn">${Number(d.slice(8))}</span>${marker(c)}</button>`;
  };

  const visitRow = (v) => {
    const p = v.partner;
    const st = visits.get(p.id);
    return `<li class="task ${v.done ? 'done' : ''}">
      <span class="tick ${v.done ? 'on' : ''}" aria-hidden="true">${v.done ? '✓' : ''}</span>
      <div class="body">
        <a class="title" href="#/partner/${p.id}">${esc(p.name)}</a>
        <div class="meta">${esc(p.area ?? 'No area')} · ${stageBadge(p.stage)}${st ? ` · ${st.count}× visited` : ''}</div>
      </div>
      ${
        admin
          ? `<div class="acts">${v.done ? '<span class="pill good">Visited</span>' : `<button class="btn sm" data-log="${p.id}">Log visit</button>`}
             <button class="icon-btn round sm" data-menu-task="${v.id}" aria-label="More">⋯</button></div>`
          : ''
      }
    </li>`;
  };

  const todoRow = (task, showDate = false) => `<li class="task ${task.done ? 'done' : ''}">
      ${admin ? `<button type="button" class="tick ${task.done ? 'on' : ''}" data-toggle="${task.id}" aria-label="${task.done ? 'Mark not done' : 'Mark done'}">${task.done ? '✓' : ''}</button>` : `<span class="tick ${task.done ? 'on' : ''}">${task.done ? '✓' : ''}</span>`}
      <div class="body">
        <span class="title">${task.type === 'visit' ? `Visit ${esc(task.partner?.name ?? '')}` : esc(task.title)}</span>
        <div class="meta">${[!category ? categoryTag(task.category) : '', showDate ? `<b class="late">${shortDate(task.due_date)}</b>` : '', deadlinePill(task, showDate), task.due_time ? esc(task.due_time) : '', task.partner && task.type !== 'visit' ? `<a href="#/partner/${task.partner.id}">${esc(task.partner.name)}</a>` : '', task.notes ? esc(task.notes) : '']
          .filter(Boolean)
          .join(' · ')}</div>
      </div>
      ${task.type !== 'visit' ? subtaskToggle(task) : ''}
      ${admin ? `<div class="acts">${task.type === 'visit' && !task.done ? `<button class="btn sm" data-log="${task.partner_id}">Log visit</button>` : ''}${showDate ? `<button class="btn secondary sm" data-today="${task.id}">Move to today</button>` : ''}<button class="icon-btn round sm" data-menu-task="${task.id}" aria-label="More">⋯</button></div>` : ''}
      ${task.type !== 'visit' && expanded.has(task.id) ? subtaskList(task) : ''}
    </li>`;

  const subtaskToggle = (task) => {
    const { done, total } = subtaskProgress(task);
    if (!total && !admin) return '';
    const open = expanded.has(task.id);
    return `<button type="button" class="sub-toggle ${total && done === total ? 'complete' : ''}" data-expand="${task.id}" aria-expanded="${open}">
      ${total ? `<span class="sub-bar"><i style="width:${(done / total) * 100}%"></i></span>${done}/${total}` : '+ Subtasks'}<span class="chev">${open ? '▴' : '▾'}</span></button>`;
  };

  const subtaskList = (task) => `<div class="subtasks">
      <ul>${(task.subtasks ?? [])
        .map(
          (st) => `<li class="${st.done ? 'done' : ''}">
            ${admin ? `<button type="button" class="tick sm ${st.done ? 'on' : ''}" data-sub-toggle="${task.id}" data-sub="${esc(st.id)}" aria-label="${st.done ? 'Mark not done' : 'Mark done'}">${st.done ? '✓' : ''}</button>` : `<span class="tick sm ${st.done ? 'on' : ''}">${st.done ? '✓' : ''}</span>`}
            <span class="st-title">${esc(st.title)}</span>
            ${admin ? `<button type="button" class="link-btn muted" data-sub-del="${task.id}" data-sub="${esc(st.id)}" aria-label="Remove subtask">×</button>` : ''}
          </li>`
        )
        .join('')}</ul>
      ${admin ? `<form class="sub-add" data-sub-add="${task.id}"><input class="input" name="title" placeholder="Add a subtask and press Enter" autocomplete="off" /><button class="btn secondary sm" type="submit">Add</button></form>` : ''}
      ${subtaskProgress(task).total && subtaskProgress(task).done === subtaskProgress(task).total && !task.done && admin ? `<button type="button" class="link-btn" data-toggle="${task.id}">All subtasks done – tick the whole task ✓</button>` : ''}
    </div>`;

  const postRow = (p, showDate = false) => `<li class="task">
      <span class="tick post st-${p.status}" aria-hidden="true">${p.status === 'published' ? '✓' : ''}</span>
      <div class="body">
        <button type="button" class="title as-link" data-post="${p.id}">${esc(p.title)}</button>
        <div class="meta">${!category ? categoryTag('marketing') : ''}${showDate ? `<b class="late">${shortDate(p.publish_date)}</b>` : ''}${p.publish_time ? `<span>${esc(p.publish_time)}</span>` : ''}${channelTags(p.channels)}<span class="status st-${p.status}">${postStatusLabel(p.status)}</span></div>
      </div>
      ${isAdmin() && p.status !== 'published' ? `<div class="acts"><button class="btn secondary sm" data-published="${p.id}">Mark published</button></div>` : ''}
    </li>`;

  const followRow = (p, showDate = false) => `<li class="task">
      <span class="tick follow" aria-hidden="true">↻</span>
      <div class="body">
        <a class="title" href="#/partner/${p.id}">Follow up: ${esc(p.name)}</a>
        <div class="meta">${showDate ? `<b class="late">${shortDate(p.next_follow_up)}</b> · ` : ''}${esc(p.area ?? '')} · ${stageBadge(p.stage)}</div>
      </div>
      ${admin ? `<div class="acts"><button class="btn secondary sm" data-plan-one="${p.id}">Plan visit ${selected === t ? 'today' : shortDate(selected)}</button></div>` : ''}
    </li>`;

  const lateCount = late.tasks.length + late.followUps.length + late.posts.length;
  const empty = !day.visits.length && !day.todos.length && !day.followUps.length && !day.ongoing.length && !day.posts.length;

  const tab = ['notes', 'done'].includes(ctx.query.get('tab')) ? ctx.query.get('tab') : 'plan';
  const top = `
    ${pageHeader('Tasks', 'Hotel visits, to-dos, deadlines and notes – sales and marketing', admin ? '<button class="btn secondary" data-new-task>+ Task</button><button class="btn" data-plan>Plan visits</button>' : '')}
    <div class="tasks-top">
      <nav class="tabs tasks-tabs"><a href="#/tasks" class="${tab === 'plan' ? 'active' : ''}">Plan</a><a href="#/tasks?tab=notes" class="${tab === 'notes' ? 'active' : ''}">Notes<span class="count">${state.notes.length}</span></a><a href="#/tasks?tab=done" class="${tab === 'done' ? 'active' : ''}">Done ✓</a></nav>
      <div class="chips">${[{ value: '', label: 'All' }, ...TASK_CATEGORIES]
        .map((c) => `<button type="button" data-cat="${c.value}" aria-pressed="${category === c.value}">${c.value ? `<i class="cdot cat-dot-${c.value}"></i>` : ''}${c.label}</button>`)
        .join('')}</div>
    </div>`;

  if (tab === 'notes' || tab === 'done') {
    page.innerHTML = `${top}<div id="tabBody"></div>`;
    if (tab === 'notes') renderBoard(page.querySelector('#tabBody'), category, ctx.refresh);
    else renderDone(page.querySelector('#tabBody'), category, ctx);
    page.onclick = async (e) => {
      if (await handleNoteClick(e, ctx.refresh)) return;
      const b = e.target.closest('button');
      if (b?.dataset.cat !== undefined) {
        category = b.dataset.cat;
        render(page, ctx);
      } else if (b && 'plan' in b.dataset) planVisits(selected, ctx.refresh);
      else if (b && 'newTask' in b.dataset) taskModal({ type: 'todo', category: category || 'sales', due_date: selected }, ctx.refresh);
    };
    return;
  }

  page.innerHTML = `${top}
    ${pinnedStrip(category)}
    <section class="card cal-card">
      <div class="cal-head">
        <div class="controls">
          <button class="icon-btn" data-shift="-1" aria-label="Previous">←</button>
          <b class="num">${esc(rangeLabel)}</b>
          <button class="icon-btn" data-shift="1" aria-label="Next">→</button>
          ${selected !== t ? '<button class="btn secondary sm" data-go-today>Today</button>' : ''}
        </div>
        ${seg('mode', mode, [
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ])}
      </div>
      ${mode === 'month' ? `<div class="cal-dows">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span>${d}</span>`).join('')}</div>` : ''}
      <div class="cal ${mode}">${days.map(cell).join('')}</div>
      <div class="cal-legend"><span><i class="v"></i>Visit</span><span><i class="t"></i>To-do / deadline</span><span><i class="f"></i>Follow-up</span><span><i class="p"></i>Post</span></div>
    </section>

    ${
      lateCount && selected === t
        ? `<section class="card late-card">
            <div class="card-head"><h2>Overdue <span class="muted">(${lateCount})</span></h2></div>
            <ul class="tasks">${late.tasks.map((x) => todoRow(x, true)).join('')}${late.followUps.map((p) => followRow(p, true)).join('')}${late.posts.map((p) => postRow(p, true)).join('')}</ul>
          </section>`
        : ''
    }

    <section class="card">
      <div class="card-head"><h2>${esc(dayTitle(selected))}</h2>${admin ? `<button class="link-btn" data-plan>+ Plan visits</button>` : ''}</div>
      ${
        empty
          ? `<p class="empty">Nothing planned for this day.${admin ? ' Use “Plan visits” to pick the hotels you’ll walk into.' : ''}</p>`
          : `
        ${day.visits.length ? `<h3 class="sec">Visits <span class="muted">· ${day.visits.filter((v) => v.done).length}/${day.visits.length} done · sorted by area</span></h3><ul class="tasks">${day.visits.map(visitRow).join('')}</ul>` : ''}
        ${day.ongoing.length ? `<h3 class="sec">In progress <span class="muted">· multi-day tasks</span></h3><ul class="tasks">${day.ongoing.map((x) => todoRow(x)).join('')}</ul>` : ''}
        ${day.posts.length ? `<h3 class="sec">Posts</h3><ul class="tasks">${day.posts.map((p) => postRow(p)).join('')}</ul>` : ''}
        ${day.followUps.length ? `<h3 class="sec">Follow-ups</h3><ul class="tasks">${day.followUps.map((p) => followRow(p)).join('')}</ul>` : ''}
        ${day.todos.length ? `<h3 class="sec">To-dos &amp; deadlines</h3><ul class="tasks">${day.todos.map((x) => todoRow(x)).join('')}</ul>` : ''}`
      }
    </section>`;

  // ── Events ──
  const rerender = () => render(page, ctx);
  page.querySelectorAll('[data-sub-add]').forEach((f) =>
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = f.title.value.trim();
      if (!title) return;
      const task = state.tasks.find((x) => x.id === f.dataset.subAdd);
      const list = [...(task.subtasks ?? []), { title, done: false }];
      refocus = task.id;
      save({ id: task.id, subtasks: list }, null, ctx.refresh);
    })
  );
  if (refocus) {
    page.querySelector(`[data-sub-add="${refocus}"] input`)?.focus();
    refocus = null;
  }
  onSeg(page, 'mode', (m) => {
    mode = m;
    rerender();
  });
  page.onclick = async (e) => {
    if (await handleNoteClick(e, ctx.refresh)) return;
    const el = e.target.closest('button');
    if (!el) return;
    const d = el.dataset;
    if (d.expand) {
      if (expanded.has(d.expand)) expanded.delete(d.expand);
      else {
        expanded.add(d.expand);
        refocus = d.expand;
      }
      rerender();
    } else if (d.subToggle || d.subDel) {
      const task = state.tasks.find((x) => x.id === (d.subToggle || d.subDel));
      const list = (task.subtasks ?? [])
        .map((st) => (d.subToggle && st.id === d.sub ? { ...st, done: !st.done } : st))
        .filter((st) => !(d.subDel && st.id === d.sub));
      task.subtasks = list; // instant feedback, then save
      rerender();
      save({ id: task.id, subtasks: list }, null, ctx.refresh);
    } else if (d.cat !== undefined) {
      category = d.cat;
      rerender();
    } else if (d.post) postModal(state.posts.find((x) => x.id === d.post), ctx.refresh);
    else if (d.published) save({ id: d.published, status: 'published' }, 'Published ✓', ctx.refresh, '/api/posts');
    else if (d.day) {
      selected = d.day;
      rerender();
    } else if (d.shift) {
      selected = mode === 'week' ? shiftDate(selected, 7 * Number(d.shift)) : `${shiftMonth(monthOf(selected), Number(d.shift))}-01`;
      rerender();
    } else if ('goToday' in d) {
      selected = t;
      rerender();
    } else if ('plan' in d) planVisits(selected, ctx.refresh);
    else if ('newTask' in d) taskModal({ type: 'todo', category: category || 'sales', due_date: selected }, ctx.refresh);
    else if (d.log) {
      const p = state.partners.find((x) => x.id === d.log);
      logActivity(p, state.contacts.filter((c) => c.partner_id === p.id), ctx.refresh);
    } else if (d.toggle) {
      const task = state.tasks.find((x) => x.id === d.toggle);
      save({ id: task.id, done: !task.done }, task.done ? 'Not done' : 'Done ✓', ctx.refresh);
    } else if (d.today) save({ id: d.today, due_date: t }, 'Moved to today', ctx.refresh);
    else if (d.planOne) {
      try {
        await api('/api/tasks', { method: 'POST', body: { plan: { date: selected, partner_ids: [d.planOne] } } });
        toast('Visit planned');
        ctx.refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (d.menuTask) taskModal(state.tasks.find((x) => x.id === d.menuTask), ctx.refresh);
  };
}

// Deadline badge for multi-day tasks: "5 days left", "due today", "2 days late".
function deadlinePill(task, isOverdueList) {
  if (task.done || task.type === 'visit' || isOverdueList || !task.start_date) return '';
  const left = daysLeft(task.due_date);
  const cls = left < 0 ? 'overdue' : left <= 2 ? 'today' : '';
  const text = left < 0 ? `${-left} days late` : left === 0 ? 'due today' : `deadline ${shortDate(task.due_date)} · ${left} day${left === 1 ? '' : 's'} left`;
  return `<span class="pill ${cls}">${text}</span>`;
}

async function save(body, message, refresh, path = '/api/tasks') {
  try {
    await api(path, { method: 'POST', body });
    if (message) toast(message);
    refresh();
  } catch (err) {
    toast(err.message, 'error');
  }
}

const dateChips = (base) => {
  const t = today();
  return [
    { label: 'Today', d: t },
    { label: 'Tomorrow', d: shiftDate(t, 1) },
    { label: 'In 2 days', d: shiftDate(t, 2) },
    { label: 'Next Monday', d: shiftDate(weekDays(t)[0], 7) },
  ]
    .map((c) => `<button type="button" data-date="${c.d}" aria-pressed="${c.d === base}">${c.label}</button>`)
    .join('');
};

function wireDateChips(m, input) {
  m.el.querySelectorAll('[data-date]').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.dataset.date;
      input.dispatchEvent(new Event('change'));
    })
  );
  input.addEventListener('change', () => m.el.querySelectorAll('[data-date]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === input.value))));
}

// Pick partners for a day. "To visit" first, grouped by area so the list reads like a walking route.
export function planVisits(date, refresh, preselect = []) {
  const visits = visitStats(state.activities);
  const filter = { stages: new Set(['new']), area: '', q: '' };
  const chosen = new Set(preselect);
  const m = openModal(
    'Plan visits',
    `<form>
      <label class="field"><span>Day</span><input class="input" type="date" name="date" value="${esc(date)}" required /></label>
      <div class="chips wrap-chips">${dateChips(date)}</div>
      <div class="form-grid">
        <label class="field"><span>Area</span><select class="input" name="area">${options(AREAS, '', { empty: 'All areas' })}</select></label>
        <label class="field"><span>Search</span><input class="input" type="search" name="q" placeholder="Hotel name…" /></label>
      </div>
      <div class="chips wrap-chips" data-stages>${STAGES.filter((s) => s.value !== 'declined')
        .map((s) => `<button type="button" data-s="${s.value}" aria-pressed="${filter.stages.has(s.value)}">${s.label}</button>`)
        .join('')}</div>
      <div class="pick-list" data-list></div>
      <button class="btn block" type="submit" data-submit>Plan visits</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  wireDateChips(m, form.date);

  const draw = () => {
    const q = filter.q.trim().toLowerCase();
    const list = state.partners
      .filter((p) => (filter.stages.has(p.stage) || chosen.has(p.id)) && (!filter.area || p.area === filter.area) && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => (a.area ?? '~').localeCompare(b.area ?? '~') || a.name.localeCompare(b.name));
    let lastArea = null;
    m.el.querySelector('[data-list]').innerHTML = list.length
      ? list
          .map((p) => {
            const head = p.area !== lastArea ? `<div class="pick-area">${esc(p.area ?? 'No area')}</div>` : '';
            lastArea = p.area;
            const st = visits.get(p.id);
            const planned = nextPlannedVisit(p.id, state.tasks);
            return `${head}<label class="pick"><input type="checkbox" value="${p.id}" ${chosen.has(p.id) ? 'checked' : ''} />
              <span class="body"><b>${esc(p.name)}</b><span class="meta">${esc(STAGES.find((s) => s.value === p.stage).label)}${st ? ` · ${st.count}× visited, last ${shortDate(st.last)}` : ''}${
                planned ? ` · <span class="planned">planned ${shortDate(planned)}</span>` : ''
              }</span></span></label>`;
          })
          .join('')
      : '<p class="empty">No partners match.</p>';
    updateButton();
  };
  const updateButton = () => {
    const btn = m.el.querySelector('[data-submit]');
    btn.textContent = chosen.size ? `Plan ${chosen.size} visit${chosen.size === 1 ? '' : 's'}` : 'Plan visits';
    btn.disabled = !chosen.size;
  };
  draw();

  // Ticking a hotel only updates the button, so the list keeps its scroll position.
  m.el.querySelector('[data-list]').addEventListener('change', (e) => {
    if (e.target.checked) chosen.add(e.target.value);
    else chosen.delete(e.target.value);
    updateButton();
  });
  m.el.querySelector('[data-stages]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    if (filter.stages.has(b.dataset.s)) filter.stages.delete(b.dataset.s);
    else filter.stages.add(b.dataset.s);
    b.setAttribute('aria-pressed', String(filter.stages.has(b.dataset.s)));
    draw();
  });
  form.area.addEventListener('change', () => {
    filter.area = form.area.value;
    draw();
  });
  form.q.addEventListener('input', () => {
    filter.q = form.q.value;
    draw();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/tasks', { method: 'POST', body: { plan: { date: form.date.value, partner_ids: [...chosen] } } });
      m.close();
      selected = form.date.value;
      toast(`${r.planned} visit${r.planned === 1 ? '' : 's'} planned for ${shortDate(form.date.value)}${r.skipped ? ` (${r.skipped} already planned)` : ''}`);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// Create / edit a to-do, or edit / move / delete a planned visit.
export function taskModal(task, refresh) {
  const isVisit = task.type === 'visit';
  const partner = state.partners.find((p) => p.id === task.partner_id);
  const m = openModal(
    task.id ? (isVisit ? `Visit – ${partner?.name ?? ''}` : 'Edit task') : 'New task',
    `<form>
      ${isVisit ? '' : `<label class="field"><span>What to do *</span><input class="input" name="title" required value="${esc(task.title ?? '')}" placeholder="Print flyers, prepare summer campaign…" /></label>
      <div class="field"><span>Category</span><div class="chips" data-category>${TASK_CATEGORIES.map((c) => `<button type="button" data-v="${c.value}" aria-pressed="${(task.category || 'sales') === c.value}"><i class="cdot cat-dot-${c.value}"></i>${c.label}</button>`).join('')}</div></div>`}
      <div class="form-grid${isVisit ? '' : ' three'}">
        ${isVisit ? '' : `<label class="field"><span>Start (optional)</span><input class="input" type="date" name="start_date" value="${esc(task.start_date ?? '')}" /><small>For longer tasks</small></label>`}
        <label class="field"><span>${isVisit ? 'Visit on' : 'Deadline / date'}</span><input class="input" type="date" name="due_date" required value="${esc(task.due_date ?? today())}" /></label>
        <label class="field"><span>Time (optional)</span><input class="input" type="time" name="due_time" value="${esc(task.due_time ?? '')}" /></label>
      </div>
      <div class="chips wrap-chips">${dateChips(task.due_date)}</div>
      ${
        isVisit
          ? ''
          : `<label class="field"><span>Partner (optional)</span><select class="input" name="partner_id">${options(
              state.partners.map((p) => ({ value: p.id, label: p.name })),
              task.partner_id,
              { empty: '–' }
            )}</select></label>`
      }
      <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="2">${esc(task.notes ?? '')}</textarea></label>
      ${isVisit ? '' : `<div class="field"><span>Subtasks</span><ul class="sub-edit" data-sub-edit></ul>
        <div class="sub-add"><input class="input" data-sub-new placeholder="Add a step and press Enter" autocomplete="off" /><button class="btn secondary sm" type="button" data-sub-new-btn>Add</button></div></div>`}
      <button class="btn block" type="submit">${task.id ? 'Save' : 'Add task'}</button>
      ${task.id ? `<button class="btn danger block" type="button" data-remove>${isVisit ? 'Remove from plan' : 'Delete task'}</button>` : ''}
    </form>`
  );
  const form = m.el.querySelector('form');
  wireDateChips(m, form.due_date);
  let cat = task.category || 'sales';
  // Checklist editor (kept in memory, saved with the task).
  let subs = (task.subtasks ?? []).map((s) => ({ ...s }));
  const subList = m.el.querySelector('[data-sub-edit]');
  const drawSubs = () => {
    if (!subList) return;
    subList.innerHTML = subs
      .map(
        (s, i) => `<li><input type="checkbox" data-i="${i}" ${s.done ? 'checked' : ''} aria-label="Done" />
          <input class="input" data-t="${i}" value="${esc(s.title)}" /><button type="button" class="link-btn muted" data-x="${i}" aria-label="Remove">×</button></li>`
      )
      .join('');
  };
  drawSubs();
  subList?.addEventListener('change', (e) => {
    const i = e.target.dataset.i ?? e.target.dataset.t;
    if (i === undefined) return;
    if (e.target.dataset.i !== undefined) subs[i].done = e.target.checked;
    else subs[i].title = e.target.value;
  });
  subList?.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    subs.splice(Number(x.dataset.x), 1);
    drawSubs();
  });
  const addSub = () => {
    const input = m.el.querySelector('[data-sub-new]');
    const title = input.value.trim();
    if (!title) return;
    subs.push({ title, done: false });
    input.value = '';
    drawSubs();
    input.focus();
  };
  m.el.querySelector('[data-sub-new]')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSub();
    }
  });
  m.el.querySelector('[data-sub-new-btn]')?.addEventListener('click', addSub);
  m.el.querySelector('[data-category]')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    cat = b.dataset.v;
    m.el.querySelectorAll('[data-category] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    const body = { title: f.title, start_date: f.start_date, due_date: f.due_date, due_time: f.due_time, partner_id: f.partner_id, notes: f.notes, type: task.type, id: task.id, ...(isVisit ? {} : { category: cat, subtasks: subs }) };
    if (body.start_date && body.start_date > body.due_date) return toast('Start must be before the deadline', 'error');
    try {
      await api('/api/tasks', { method: 'POST', body });
      m.close();
      selected = form.due_date.value;
      toast(task.id ? 'Saved' : 'Task added');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-remove]')?.addEventListener('click', async () => {
    try {
      await api(`/api/tasks?id=${task.id}`, { method: 'DELETE' });
      m.close();
      toast('Removed');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

