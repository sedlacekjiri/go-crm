// /api/tasks — to-dos and planned visits for the calendar. Visits are Sales; to-dos follow their
// category; you can always work on tasks assigned to you. assignee_id = who does it (to-dos only).
//   POST { id?, type, category, title, partner_id, start_date, due_date, due_time, notes, done }
//        create / update (only sent fields). due_date is the deadline; start_date (optional)
//        makes it a multi-day task shown as "in progress" from that day.
//        subtasks: [{ id?, title, done }] – a checklist inside the task (replaces the whole list).
//   POST { plan: { date: "YYYY-MM-DD", partner_ids: [...] } }              plan visits for a day
//   GET  ?done=1&from=YYYY-MM-DD               finished tasks, newest first (history; everyone logged in)
//   DELETE ?id=…

import { authorize, bad, canSeeTask, checkSubtaskPeople, cleanSubtasks, hasSubtaskFor, isDate, json, now, oneOf, parseSubtasks, readJson, str, uuid } from '../_lib/db.js';

const TYPES = ['todo', 'visit'];
const CATEGORIES = ['sales', 'marketing'];
const isTime = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  if (url.searchParams.get('done') !== '1') return bad('Use ?done=1');
  const from = url.searchParams.get('from');
  const { results } = await env.DB.prepare(
    `SELECT * FROM tasks WHERE done = 1 AND (? IS NULL OR substr(COALESCE(done_at, due_date), 1, 10) >= ?)
     ORDER BY COALESCE(done_at, due_date) DESC LIMIT 2000`
  )
    .bind(isDate(from) ? from : null, isDate(from) ? from : null)
    .all();
  return json(results.filter((t) => canSeeTask(t, auth)).map((t) => ({ ...t, done: true, subtasks: parseSubtasks(t.subtasks) })));
}

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || typeof b !== 'object') return bad('Invalid request');
  const db = env.DB;

  if (b.plan) {
    if (!auth.canEdit('sales')) return bad('Planning visits is part of Sales', 403);
    const { date, partner_ids: ids } = b.plan;
    if (!isDate(date) || !Array.isArray(ids) || !ids.length) return bad('Choose a day and at least one partner');
    const known = await db
      .prepare(`SELECT id FROM partners WHERE id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all();
    // Skip partners that already have an open visit planned that day.
    const planned = await db.prepare(`SELECT partner_id FROM tasks WHERE type = 'visit' AND done = 0 AND due_date = ?`).bind(date).all();
    const skip = new Set(planned.results.map((r) => r.partner_id));
    const fresh = known.results.map((r) => r.id).filter((id) => !skip.has(id));
    const t = now();
    if (fresh.length) {
      await db.batch(
        fresh.map((pid) =>
          db.prepare(`INSERT INTO tasks (id, type, category, partner_id, due_date, done, created_at) VALUES (?, 'visit', 'sales', ?, ?, 0, ?)`).bind(uuid(), pid, date, t)
        )
      );
    }
    return json({ planned: fresh.length, skipped: ids.length - fresh.length });
  }

  const existing = b.id ? await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(b.id).first() : null;
  if (b.id && !existing) return bad('Task not found', 404);
  if (existing && !canSeeTask(existing, auth)) return bad('Task not found', 404);
  const row = existing ? { ...existing } : { id: uuid(), type: 'todo', category: auth.has('sales') ? 'sales' : 'marketing', done: 0, created_by: auth.user.id, created_at: now() };
  if ('type' in b) row.type = oneOf(b.type, TYPES, 'todo');
  if ('category' in b) row.category = oneOf(b.category, CATEGORIES, 'sales');
  if ('title' in b) row.title = str(b.title, 300);
  if ('start_date' in b) row.start_date = isDate(b.start_date) ? b.start_date : null;
  if ('partner_id' in b) row.partner_id = str(b.partner_id, 64);
  if ('due_date' in b) row.due_date = isDate(b.due_date) ? b.due_date : null;
  if ('due_time' in b) row.due_time = isTime(b.due_time) ? b.due_time : null;
  if ('notes' in b) row.notes = str(b.notes, 2000);
  if ('assignee_id' in b) {
    row.assignee_id = str(b.assignee_id, 64);
    if (row.assignee_id && !(await db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').bind(row.assignee_id).first())) return bad('That person isn’t in the team');
  }
  if ('subtasks' in b) {
    const list = cleanSubtasks(b.subtasks);
    if (list === undefined) return bad('Invalid subtasks');
    const problem = await checkSubtaskPeople(db, list);
    if (problem) return bad(problem);
    row.subtasks = list;
  }
  if ('done' in b) {
    row.done = b.done ? 1 : 0;
    row.done_at = b.done ? existing?.done_at || now() : null;
  }
  if (!row.due_date) return bad('Choose a date');
  if (row.type === 'visit') {
    row.category = 'sales';
    row.assignee_id = null; // visits are yours
  }
  // You can only file tasks under sections you work in (unless it's assigned to you to do).
  const workingOnIt = existing && (existing.assignee_id === auth.user.id || hasSubtaskFor(existing, auth.user.id));
  if (!auth.canEdit(row.category) && !(workingOnIt && existing.category === row.category)) {
    return bad(`You can’t add or move tasks to ${row.category === 'sales' ? 'Sales' : 'Marketing'}`, 403);
  }
  if (row.start_date && row.start_date >= row.due_date) row.start_date = null; // a one-day task
  if (row.type === 'visit' && !row.partner_id) return bad('A visit needs a partner');
  if (row.type === 'todo' && !row.title) return bad('Write what to do');
  if (row.partner_id) {
    const p = await db.prepare('SELECT id FROM partners WHERE id = ?').bind(row.partner_id).first();
    if (!p) return bad('Partner not found', 404);
  }

  const cols = ['id', 'type', 'category', 'title', 'partner_id', 'start_date', 'due_date', 'due_time', 'notes', 'subtasks', 'assignee_id', 'created_by', 'done', 'done_at', 'created_at'];
  await db
    .prepare(
      `INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id' && c !== 'created_at').map((c) => `${c} = excluded.${c}`).join(', ')}`
    )
    .bind(...cols.map((c) => row[c] ?? null))
    .run();
  return json({ ...row, done: !!row.done, subtasks: parseSubtasks(row.subtasks) });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  if (!task || !canSeeTask(task, auth)) return bad('Task not found', 404);
  if (!auth.canEdit(task.category || 'sales') && task.created_by !== auth.user.id) return bad('You can’t delete this task', 403);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id),
    env.DB.prepare(`DELETE FROM files WHERE parent_type = 'task' AND parent_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM comments WHERE parent_type = 'task' AND parent_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM comment_reads WHERE parent_type = 'task' AND parent_id = ?`).bind(id),
  ]);
  return json({ ok: true });
}
