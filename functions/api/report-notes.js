// POST /api/report-notes — notes for one week's marketing meeting (Marketing editors).
//   { week: "YYYY-MM-DD" (its Monday), notes: "…" }   empty notes remove them

import { authorize, bad, isDate, json, now, readJson, str } from '../_lib/db.js';

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'marketing' });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || !isDate(b.week) || new Date(`${b.week}T00:00:00Z`).getUTCDay() !== 1) return bad('Invalid week');
  const notes = str(b.notes, 20000);
  const row = { week: b.week, notes, updated_by: auth.user.id, updated_at: now() };
  if (!notes) await env.DB.prepare('DELETE FROM report_notes WHERE week = ?').bind(b.week).run();
  else
    await env.DB.prepare(
      `INSERT INTO report_notes (week, notes, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(week) DO UPDATE SET notes = excluded.notes, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).bind(row.week, row.notes, row.updated_by, row.updated_at).run();
  return json(row);
}
