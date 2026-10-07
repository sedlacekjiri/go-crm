// /api/tasks (admin only) — to-dos and planned visits for the calendar.
//   POST { id?, type, category, title, partner_id, start_date, due_date, due_time, notes, done }
//        create / update (only sent fields). due_date is the deadline; start_date (optional)
//        makes it a multi-day task shown as "in progress" from that day.
//   POST { plan: { date: "YYYY-MM-DD", partner_ids: [...] } }              plan visits for a day
//   DELETE ?id=…

import { authorize, bad, isDate, json, now, oneOf, readJson, str, uuid } from '../_lib/db.js';

const TYPES = ['todo', 'visit'];
const CATEGORIES = ['sales', 'marketing'];
const isTime = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || typeof b !== 'object') return bad('Invalid request');
  const db = env.DB;

  if (b.plan) {
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
  const row = existing ? { ...existing } : { id: uuid(), type: 'todo', category: 'sales', done: 0, created_at: now() };
  if ('type' in b) row.type = oneOf(b.type, TYPES, 'todo');
  if ('category' in b) row.category = oneOf(b.category, CATEGORIES, 'sales');
  if ('title' in b) row.title = str(b.title, 300);
  if ('start_date' in b) row.start_date = isDate(b.start_date) ? b.start_date : null;
  if ('partner_id' in b) row.partner_id = str(b.partner_id, 64);
  if ('due_date' in b) row.due_date = isDate(b.due_date) ? b.due_date : null;
  if ('due_time' in b) row.due_time = isTime(b.due_time) ? b.due_time : null;
  if ('notes' in b) row.notes = str(b.notes, 2000);
  if ('done' in b) {
    row.done = b.done ? 1 : 0;
    row.done_at = b.done ? existing?.done_at || now() : null;
  }
  if (!row.due_date) return bad('Choose a date');
  if (row.type === 'visit') row.category = 'sales';
  if (row.start_date && row.start_date >= row.due_date) row.start_date = null; // a one-day task
  if (row.type === 'visit' && !row.partner_id) return bad('A visit needs a partner');
  if (row.type === 'todo' && !row.title) return bad('Write what to do');
  if (row.partner_id) {
    const p = await db.prepare('SELECT id FROM partners WHERE id = ?').bind(row.partner_id).first();
    if (!p) return bad('Partner not found', 404);
  }

  const cols = ['id', 'type', 'category', 'title', 'partner_id', 'start_date', 'due_date', 'due_time', 'notes', 'done', 'done_at', 'created_at'];
  await db
    .prepare(
      `INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id' && c !== 'created_at').map((c) => `${c} = excluded.${c}`).join(', ')}`
    )
    .bind(...cols.map((c) => row[c] ?? null))
    .run();
  return json({ ...row, done: !!row.done });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
