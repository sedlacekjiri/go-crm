// Tasks & calendar: hotel visits, to-dos with deadlines, follow-ups and marketing posts – split into
// Sales and Marketing. A planned visit is ticked off automatically when the visit is logged.
import { avatar, channelTags, onSeg, pageHeader, seg, stageBadge } from '../components.js';
import { agenda, AREAS, eventTimeText, laterItems, daysLeft, subtaskProgress, dayCounts, monthGrid, monthOf, nextPlannedVisit, overdue, postStatusLabel, shiftDate, shiftMonth, STAGES, TASK_CATEGORIES, today, visitStats, weekDays } from '../lib.js';
import { fileCount, filesFieldHtml, mountFiles } from '../files.js';
import { assigneeFieldHtml, mountAssignee, subAssigneeSelect, subPerson } from '../people.js';
import { eventModal } from '../events.js';
import { api, assigneeId, can, isAdmin, state, taskPerson, userById } from '../store.js';
import { esc, formData, monthLabel, openModal, options, shortDate, toast } from '../util.js';
import { postModal } from './marketing.js';
import { renderDone } from './done.js';
import { handleNoteClick, pinnedStrip, renderBoard } from './notes.js';
import { logActivity } from './partner.js';

// View state survives navigation.
let selected = null;
let mode = 'week';
let category = ''; // '' | 'sales' | 'marketing'
let who = ''; // '' everyone | 'me' | 'none' (unassigned) | a user id

// Filter by who the task is assigned to (visits are always the owner's).
const matchesWho = (t) => {
  if (!who) return true;
  if (t.type === 'visit') return who === 'me' ? state.me?.id === 'owner' : who === 'owner';
  if (who === 'none') return !assigneeId(t);
  const id = who === 'me' ? state.me?.id : who;
  return assigneeId(t) === id || (t.subtasks ?? []).some((s) => s.assignee_id === id && !s.done);
};
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
  // The "who" filter applies to tasks; partner follow-ups are the owner's and follow the same rule.
  const meId = state.me?.id;
  const showFollowUps = !who || (who === 'me' ? meId === 'owner' : who === 'owner');
  // Events: the person filter shows the ones they're invited to (or created).
  const eventFor = (e) => !who || (() => { const id = who === 'me' ? meId : who; return id !== 'none' && ((e.attendees ?? []).includes(id) || e.created_by === id); })();
  const data = { ...state, tasks: state.tasks.filter(matchesWho), partners: state.partners, events: (state.events ?? []).filter(eventFor) };
  const counts = dayCounts(days, data, category);
  const day = agenda(selected, data, category);
  const late = overdue(t, data, category);
  if (!showFollowUps) {
    day.followUps = [];
    late.followUps = [];
  }
  const visits = visitStats(state.activities);
  const rangeLabel = mode === 'week' ? `${shortDate(days[0])} – ${shortDate(days[6])}` : monthLabel(monthOf(selected));

  const marker = (c) =>
    `<span class="marks">${c.events ? '<i class="e"></i>' : ''}${'<i class="v"></i>'.repeat(Math.min(c.visits, 3))}${c.todos ? '<i class="t"></i>' : ''}${c.followUps ? '<i class="f"></i>' : ''}${c.posts ? '<i class="p"></i>' : ''}</span>`;

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

  const todoRow = (task, showDate = false, isLate = showDate) => `<li class="task ${task.done ? 'done' : ''}">
      ${admin ? `<button type="button" class="tick cat-${task.type === 'visit' ? 'sales' : esc(task.category || 'sales')} ${task.done ? 'on' : ''}" data-toggle="${task.id}" aria-label="${task.done ? 'Mark not done' : 'Mark done'}">${task.done ? '✓' : ''}</button>` : `<span class="tick ${task.done ? 'on' : ''}">${task.done ? '✓' : ''}</span>`}
      <div class="body">
        <button type="button" class="title as-link" data-menu-task="${task.id}">${task.type === 'visit' ? `Visit ${esc(task.partner?.name ?? '')}` : esc(task.title)}</button>
        <div class="meta">${[showDate ? `<span class="due ${isLate ? 'late' : ''}">${isLate ? '⚠ ' : ''}${shortDate(task.due_date)}</span>` : '', deadlinePill(task, showDate), taskPerson(task) ? `<span class="assignee" title="${esc(taskPerson(task).name)}">${avatar(taskPerson(task), 18)}${esc(taskPerson(task).name.split(' ')[0])}</span>` : '', task.due_time ? esc(task.due_time) : '', task.partner && task.type !== 'visit' ? `<a href="#/partner/${task.partner.id}">${esc(task.partner.name)}</a>` : '', fileCount('task', task.id) ? `<span class="clip">📎 ${fileCount('task', task.id)}</span>` : '', task.notes ? esc(task.notes) : '']
          .filter(Boolean)
          .join(' · ')}</div>
      </div>
      ${task.type !== 'visit' ? subtaskToggle(task) : ''}
      ${admin ? `<div class="acts">${task.type === 'visit' && !task.done ? `<button class="btn sm" data-log="${task.partner_id}">Log visit</button>` : ''}${isLate ? `<button class="btn secondary sm hover-act" data-today="${task.id}">Move to today</button>` : ''}<button class="icon-btn round sm" data-menu-task="${task.id}" aria-label="More">⋯</button></div>` : ''}
      ${task.type !== 'visit' && expanded.has(task.id) ? subtaskList(task) : ''}
    </li>`;

  const subtaskToggle = (task) => {
    const { done, total } = subtaskProgress(task);
    if (!total && !admin) return '';
    const open = expanded.has(task.id);
    return `<button type="button" class="sub-toggle ${total && done === total ? 'complete' : ''}${total ? '' : ' empty'}" data-expand="${task.id}" aria-expanded="${open}">
      ${total ? `<span class="sub-bar"><i style="width:${(done / total) * 100}%"></i></span>${done}/${total}` : '+ Subtasks'}<span class="chev">${open ? '▴' : '▾'}</span></button>`;
  };

  const subtaskList = (task) => `<div class="subtasks">
      <ul>${(task.subtasks ?? [])
        .map(
          (st) => `<li class="${st.done ? 'done' : ''}">
            ${admin ? `<button type="button" class="tick sm ${st.done ? 'on' : ''}" data-sub-toggle="${task.id}" data-sub="${esc(st.id)}" aria-label="${st.done ? 'Mark not done' : 'Mark done'}">${st.done ? '✓' : ''}</button>` : `<span class="tick sm ${st.done ? 'on' : ''}">${st.done ? '✓' : ''}</span>`}
            <span class="st-title">${esc(st.title)}</span>${subPerson(st)}
            ${admin ? `<button type="button" class="link-btn muted" data-sub-del="${task.id}" data-sub="${esc(st.id)}" aria-label="Remove subtask">×</button>` : ''}
          </li>`
        )
        .join('')}</ul>
      ${admin ? `<form class="sub-add" data-sub-add="${task.id}"><input class="input" name="title" placeholder="Add a subtask and press Enter" autocomplete="off" /><button class="btn secondary sm" type="submit">Add</button></form>` : ''}
      ${subtaskProgress(task).total && subtaskProgress(task).done === subtaskProgress(task).total && !task.done && admin ? `<button type="button" class="link-btn" data-toggle="${task.id}">All subtasks done – tick the whole task ✓</button>` : ''}
    </div>`;

  const postRow = (p, showDate = false, readyBy = false, isLate = showDate && p.publish_date < t) => `<li class="task">
      <span class="tick post st-${p.status}" aria-hidden="true">${p.status === 'published' ? '✓' : ''}</span>
      <div class="body">
        <button type="button" class="title as-link" data-post="${p.id}">${esc(p.title)}</button>
        <div class="meta">${readyBy || (showDate && p.deadline && p.deadline < t && ['idea', 'in_progress'].includes(p.status)) ? `<span class="pill ${showDate ? 'overdue' : 'today'}">⏰ ready by ${shortDate(p.deadline)}</span>` : ''}${showDate && !(p.deadline && p.deadline < t && ['idea', 'in_progress'].includes(p.status)) ? `<span class="due ${isLate ? 'late' : ''}">${shortDate(p.publish_date)}</span>` : ''}${p.publish_time ? `<span>${esc(p.publish_time)}</span>` : ''}${channelTags(p.channels)}<span class="status st-${p.status}">${postStatusLabel(p.status)}</span>${taskPerson(p) ? `<span class="assignee" title="${esc(taskPerson(p).name)}">${avatar(taskPerson(p), 18)}${esc(taskPerson(p).name.split(' ')[0])}</span>` : ''}${p.subtasks?.length ? `<span>☑ ${p.subtasks.filter((st) => st.done).length}/${p.subtasks.length}</span>` : ''}${fileCount('post', p.id) ? `<span class="clip">📎 ${fileCount('post', p.id)}</span>` : ''}</div>
      </div>
      ${isAdmin() && p.status !== 'published' ? `<div class="acts">${readyBy || ['idea', 'in_progress'].includes(p.status) ? `<button class="btn secondary sm" data-ready="${p.id}">Ready ✓</button>` : `<button class="btn secondary sm" data-published="${p.id}">Mark published</button>`}</div>` : ''}
    </li>`;

  const eventRow = (e, onDay = selected) => `<li class="task event-row">
      <span class="tick ev cat-${esc(e.category)}" aria-hidden="true">📅</span>
      <div class="body">
        <button type="button" class="title as-link" data-event="${e.id}">${esc(e.title)}</button>
        <div class="meta">${[`<b>${esc(eventTimeText(e, onDay))}</b>`, e.date > shiftDate(t, 6) ? `<span class="due">${shortDate(e.date)}</span>` : '', e.location ? `📍 ${esc(e.location)}` : '', e.partner ? `<a href="#/partner/${e.partner.id}">${esc(e.partner.name)}</a>` : '', (e.attendees ?? []).map((id) => userById(id)).filter(Boolean).map((u) => `<span class="who" title="${esc(u.name)}">${avatar(u, 18)}</span>`).join('')].filter(Boolean).join(' · ')}</div>
      </div>
    </li>`;

  const followRow = (p, showDate = false, onDate = selected) => `<li class="task">
      <span class="tick follow" aria-hidden="true">↻</span>
      <div class="body">
        <a class="title" href="#/partner/${p.id}">Follow up: ${esc(p.name)}</a>
        <div class="meta">${showDate ? `<span class="due late">${shortDate(p.next_follow_up)}</span>` : ''}${esc(p.area ?? '')} ${stageBadge(p.stage)}</div>
      </div>
      ${admin ? `<div class="acts"><button class="btn secondary sm" data-plan-one="${p.id}" data-plan-date="${onDate}">Plan visit ${onDate === t ? 'today' : shortDate(onDate)}</button></div>` : ''}
    </li>`;

  const tab = ['notes', 'done', 'calendar'].includes(ctx.query.get('tab')) ? ctx.query.get('tab') : 'list';
  // Filters are always visible, and you're told when they hide something overdue.
  const filtered = !!category || !!who;
  const allLate = overdue(t, { ...state, events: state.events ?? [] }, '');
  const allLateCount = allLate.tasks.length + allLate.followUps.length + allLate.posts.length;
  const lateCount = late.tasks.length + late.followUps.length + late.posts.length;
  const hiddenLate = filtered ? Math.max(0, allLateCount - lateCount) : 0;
  const todayAgenda = agenda(t, data, category);
  const todayOpen = todayAgenda.events.length + todayAgenda.visits.filter((v) => !v.done).length + todayAgenda.todos.filter((x) => !x.done).length + todayAgenda.ongoing.length + todayAgenda.followUps.length + todayAgenda.posts.filter((p) => p.status !== 'published').length + todayAgenda.readyBy.length;

  const tabLink = (key, label, extra = '') => `<a href="#/tasks${key === 'list' ? '' : `?tab=${key}`}" class="${tab === key ? 'active' : ''}">${label}${extra}</a>`;
  const top = `
    ${pageHeader(
      'Tasks',
      `${lateCount ? `<b class="late">${lateCount} overdue</b> · ` : ''}${todayOpen} for today`,
      admin ? `${can('sales') ? '<button class="btn secondary" data-plan>Plan visits</button>' : ''}<button class="btn secondary" data-new-event>+ Event</button><button class="btn" data-new-task>+ Task</button>` : ''
    )}
    <nav class="tabs tasks-tabs">${tabLink('list', 'List')}${tabLink('calendar', 'Calendar')}${tabLink('notes', 'Notes', `<span class="count">${state.notes.length}</span>`)}${tabLink('done', 'Done')}</nav>
    ${
      tab === 'notes'
        ? ''
        : `<div class="filter-bar">
        <div class="seg-pills">${[{ value: '', label: 'All' }, ...TASK_CATEGORIES.filter((c) => can(c.value))]
          .map((c) => `<button type="button" data-cat="${c.value}" aria-pressed="${category === c.value}">${c.value ? `<i class="cdot cat-dot-${c.value}"></i>` : ''}${c.label}</button>`)
          .join('')}</div>
        ${
          state.users.length > 1
            ? `<div class="seg-pills people-pills">${[
                { value: '', label: 'Everyone' },
                { value: 'me', label: 'Mine' },
                ...state.users.filter((u) => u.id !== meId).map((u) => ({ value: u.id, label: u.name.split(' ')[0], user: u })),
                { value: 'none', label: 'Unassigned' },
              ]
                .map((o) => `<button type="button" data-who="${esc(o.value)}" aria-pressed="${who === o.value}" title="${esc(o.label)}">${o.user ? avatar(o.user, 18) : ''}<span class="pl-label">${esc(o.label)}</span></button>`)
                .join('')}</div>`
            : ''
        }
        ${filtered ? '<button type="button" class="link-btn" data-clear-filters>Clear filters ×</button>' : ''}
      </div>`
    }`;

  if (tab === 'notes' || tab === 'done') {
    page.innerHTML = `${top}<div id="tabBody"></div>`;
    if (tab === 'notes') renderBoard(page.querySelector('#tabBody'), category, ctx.refresh);
    else renderDone(page.querySelector('#tabBody'), category, ctx);
    page.onclick = async (e) => {
      if (await handleNoteClick(e, ctx.refresh)) return;
      const b = e.target.closest('button');
      if (b?.dataset.who !== undefined) {
        who = b.dataset.who;
        render(page, ctx);
      } else if (b?.dataset.cat !== undefined) {
        category = b.dataset.cat;
        render(page, ctx);
      } else if (b && 'clearFilters' in b.dataset) {
        who = '';
        category = '';
        render(page, ctx);
      } else if (b && 'plan' in b.dataset) planVisits(selected, ctx.refresh);
      else if (b && 'newTask' in b.dataset) taskModal({ type: 'todo', category: category || defaultCategory(), due_date: selected, assignee_id: who && who !== 'me' && who !== 'none' ? who : null }, ctx.refresh);
      else if (b && 'newEvent' in b.dataset) eventModal({ category: category || defaultCategory(), date: selected }, ctx.refresh);
    };
    return;
  }

  // One day's work as a single list: events first, then to-dos, content and follow-ups; hotel visits grouped.
  const dayRows = (a, d) => [
    ...a.events.map(eventRow),
    ...a.ongoing.map((x) => todoRow(x)),
    ...a.todos.map((x) => todoRow(x)),
    ...a.readyBy.map((p) => postRow(p, false, true)),
    ...a.posts.map((p) => postRow(p)),
    ...a.followUps.map((p) => followRow(p, false, d)),
  ];
  const visitGroup = (a) =>
    a.visits.length
      ? `<div class="visit-group"><div class="vg-head">🏨 Hotel visits <span class="muted">· ${a.visits.filter((v) => v.done).length}/${a.visits.length} done · by area</span></div><ul class="tasks">${a.visits.map(visitRow).join('')}</ul></div>`
      : '';
  const dayName = (d) => (d === t ? 'Today' : d === shiftDate(t, 1) ? 'Tomorrow' : new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }));
  const daySection = (d) => {
    const a = d === t ? todayAgenda : agenda(d, data, category);
    const rows = dayRows(a, d);
    const visitsHtml = visitGroup(a);
    const n = rows.length + a.visits.length;
    if (!n && d !== t) return '';
    return `<section class="tl-section${d === t ? ' is-today' : ''}">
        <header class="tl-head"><h2>${dayName(d)}</h2><span class="tl-date">${esc(new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</span>${n ? `<span class="tl-count">${n}</span>` : ''}
          ${admin ? `<button type="button" class="tl-add" data-new-task-on="${d}" aria-label="Add a task on ${esc(dayName(d))}">+</button>` : ''}</header>
        ${rows.length ? `<ul class="tasks">${rows.join('')}</ul>` : ''}${visitsHtml}
        ${!n ? `<p class="empty tl-empty">Nothing planned for today${lateCount ? ' – maybe start with the overdue ones above' : ' 🎉'}.</p>` : ''}
      </section>`;
  };
  const later = laterItems(data, t, category);

  if (tab === 'list') {
    const next = Array.from({ length: 6 }, (_, i) => daySection(shiftDate(t, i + 1))).join('');
    page.innerHTML = `${top}
      ${pinnedStrip(category)}
      ${
        lateCount
          ? `<section class="tl-section is-late">
              <header class="tl-head"><h2>Overdue</h2><span class="tl-count">${lateCount}</span></header>
              <ul class="tasks">${late.tasks.map((x) => todoRow(x, true)).join('')}${late.posts.map((p) => postRow(p, true)).join('')}${late.followUps.map((p) => followRow(p, true, t)).join('')}</ul>
            </section>`
          : ''
      }
      ${hiddenLate ? `<button type="button" class="hidden-late" data-clear-filters>⚠ ${hiddenLate} more overdue ${hiddenLate === 1 ? 'is' : 'are'} hidden by your filters · <b>Show all</b></button>` : ''}
      ${daySection(t)}
      ${next || ''}
      ${
        later.length
          ? `<details class="tl-section tl-later"><summary class="tl-head"><h2>Later</h2><span class="tl-count">${later.length}</span><span class="tl-date">next 3 months</span></summary>
              <ul class="tasks">${later
                .map((x) => (x.kind === 'event' ? eventRow(x.ref, x.date) : x.kind === 'post' ? postRow(x.ref, true) : todoRow(x.ref, true, false)))
                .join('')}</ul></details>`
          : ''
      }`;
  } else {
    page.innerHTML = `${top}
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
      <div class="cal-legend"><span><i class="e"></i>Event</span><span><i class="v"></i>Visit</span><span><i class="t"></i>To-do</span><span><i class="f"></i>Follow-up</span><span><i class="p"></i>Post</span></div>
    </section>
    <section class="tl-section">
      <header class="tl-head"><h2>${esc(dayTitle(selected))}</h2>${admin && can('sales') ? '<button class="link-btn" data-plan>+ Plan visits</button>' : ''}</header>
      ${(() => {
        const rows = dayRows(day, selected);
        const v = visitGroup(day);
        return rows.length || v ? `${rows.length ? `<ul class="tasks">${rows.join('')}</ul>` : ''}${v}` : `<p class="empty">Nothing planned for this day.${admin && can('sales') ? ' Use “Plan visits” to pick the hotels you’ll walk into.' : ''}</p>`;
      })()}
    </section>`;
  }

  // ── Events ──
  const rerender = () => render(page, ctx);
  // After saving an event, jump to its day.
  const refreshTo = (date) => {
    if (date) selected = date;
    ctx.refresh();
  };
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
    } else if (d.who !== undefined) {
      who = d.who;
      rerender();
    } else if (d.cat !== undefined) {
      category = d.cat;
      rerender();
    } else if ('clearFilters' in d) {
      who = '';
      category = '';
      rerender();
    } else if (d.newTaskOn) taskModal({ type: 'todo', category: category || defaultCategory(), due_date: d.newTaskOn, assignee_id: who && who !== 'me' && who !== 'none' ? who : null }, ctx.refresh);
    else if (d.post) postModal(state.posts.find((x) => x.id === d.post), ctx.refresh);
    else if (d.published) save({ id: d.published, status: 'published' }, 'Published ✓', ctx.refresh, '/api/posts');
    else if (d.ready) {
      const p = state.posts.find((x) => x.id === d.ready);
      // Ready content becomes Scheduled (needs a publish date) – otherwise open the post to set one.
      if (p.publish_date) save({ id: p.id, status: 'scheduled' }, 'Content ready – scheduled ✓', ctx.refresh, '/api/posts');
      else postModal({ ...p, status: 'scheduled' }, ctx.refresh);
    }
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
    else if ('newTask' in d) taskModal({ type: 'todo', category: category || defaultCategory(), due_date: tab === 'list' ? t : selected, assignee_id: who && who !== 'me' && who !== 'none' ? who : null }, ctx.refresh);
    else if ('newEvent' in d) eventModal({ category: category || defaultCategory(), date: tab === 'list' ? t : selected }, refreshTo);
    else if (d.event) eventModal(state.events.find((x) => x.id === d.event), refreshTo);
    else if (d.log) {
      const p = state.partners.find((x) => x.id === d.log);
      logActivity(p, state.contacts.filter((c) => c.partner_id === p.id), ctx.refresh);
    } else if (d.toggle) {
      const task = state.tasks.find((x) => x.id === d.toggle);
      save({ id: task.id, done: !task.done }, task.done ? 'Not done' : 'Done ✓', ctx.refresh);
    } else if (d.today) save({ id: d.today, due_date: t }, 'Moved to today', ctx.refresh);
    else if (d.planOne) {
      try {
        await api('/api/tasks', { method: 'POST', body: { plan: { date: d.planDate || selected, partner_ids: [d.planOne] } } });
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
  // A new task starts as mine.
  const m = openModal(
    task.id ? (isVisit ? `Visit – ${partner?.name ?? ''}` : 'Edit task') : 'New task',
    `<form>
      ${isVisit ? '' : `<label class="field"><span>What to do *</span><input class="input" name="title" required value="${esc(task.title ?? '')}" placeholder="Print flyers, prepare summer campaign…" /></label>
      <div class="field"><span>Category</span><div class="chips" data-category>${TASK_CATEGORIES.filter((c) => can(c.value) || c.value === task.category).map((c) => `<button type="button" data-v="${c.value}" aria-pressed="${(task.category || defaultCategory()) === c.value}"><i class="cdot cat-dot-${c.value}"></i>${c.label}</button>`).join('')}</div></div>
      ${assigneeFieldHtml(task.id ? assigneeId(task) : task.assignee_id ?? state.me?.id)}`}
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
      <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="4">${esc(task.notes ?? '')}</textarea></label>
      ${filesFieldHtml(isAdmin())}
      ${isVisit ? '' : `<div class="field"><span>Subtasks</span><ul class="sub-edit" data-sub-edit></ul>
        <div class="sub-add"><input class="input" data-sub-new placeholder="Add a step and press Enter" autocomplete="off" /><button class="btn secondary sm" type="button" data-sub-new-btn>Add</button></div></div>`}
      <button class="btn block" type="submit">${task.id ? 'Save' : 'Add task'}</button>
      ${task.id ? `<button class="btn danger block" type="button" data-remove>${isVisit ? 'Remove from plan' : 'Delete task'}</button>` : ''}
    </form>`
  );
  m.el.querySelector('.modal').classList.add('wide');
  const form = m.el.querySelector('form');
  wireDateChips(m, form.due_date);
  const files = mountFiles(m.el, 'task', task.id, isAdmin());
  let cat = task.category || defaultCategory();
  // Checklist editor (kept in memory, saved with the task).
  let subs = (task.subtasks ?? []).map((s) => ({ ...s }));
  const subList = m.el.querySelector('[data-sub-edit]');
  const drawSubs = () => {
    if (!subList) return;
    subList.innerHTML = subs
      .map(
        (s, i) => `<li><input type="checkbox" data-i="${i}" ${s.done ? 'checked' : ''} aria-label="Done" />
          <input class="input" data-t="${i}" value="${esc(s.title)}" />${subAssigneeSelect(i, s.assignee_id)}<button type="button" class="link-btn muted" data-x="${i}" aria-label="Remove">×</button></li>`
      )
      .join('');
  };
  drawSubs();
  subList?.addEventListener('change', (e) => {
    if (e.target.dataset.w !== undefined) {
      subs[e.target.dataset.w].assignee_id = e.target.value || undefined;
      return;
    }
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
  const assignee = mountAssignee(m.el, task.id ? assigneeId(task) : task.assignee_id ?? state.me?.id);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    const body = { title: f.title, start_date: f.start_date, due_date: f.due_date, due_time: f.due_time, partner_id: f.partner_id, notes: f.notes, type: task.type, id: task.id, ...(isVisit ? {} : { category: cat, subtasks: subs, assignee_id: assignee() }) };
    if (body.start_date && body.start_date > body.due_date) return toast('Start must be before the deadline', 'error');
    try {
      const saved = await api('/api/tasks', { method: 'POST', body });
      await files.flush(saved.id);
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


// New tasks go to Sales if you work in Sales, otherwise Marketing.
const defaultCategory = () => (can('sales') ? 'sales' : 'marketing');
