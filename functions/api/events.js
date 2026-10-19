// /api/events — calendar events (meetings, fairs, photo shoots…). Visible to the section's people
// and to everyone invited; editable by the section's editors and by whoever created the event.
//   POST   { id?, title, category, date, end_date?, start_time?, end_time?, location?, partner_id?, attendees: [userId], notes? }
//   DELETE ?id=…

import { authorize, bad, canEditEvent, isDate, json, now, oneOf, parseAttendees, readJson, str, uuid } from '../_lib/db.js';

const CATEGORIES = ['sales', 'marketing'];
const isTime = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || typeof b !== 'object') return bad('Invalid request');
  const db = env.DB;
  const existing = b.id ? await db.prepare('SELECT * FROM events WHERE id = ?').bind(b.id).first() : null;
  if (b.id && !existing) return bad('Event not found', 404);
  if (existing && !canEditEvent(existing, auth)) return bad('You can’t change this event', 403);

  const t = now();
  const row = existing ? { ...existing } : { id: uuid(), created_by: auth.user.id, created_at: t };
  if ('title' in b) row.title = str(b.title, 200);
  if ('category' in b) row.category = oneOf(b.category, CATEGORIES, 'sales');
  row.category ??= auth.has('sales') ? 'sales' : 'marketing';
  if ('date' in b) row.date = isDate(b.date) ? b.date : null;
  if ('end_date' in b) row.end_date = isDate(b.end_date) ? b.end_date : null;
  if ('start_time' in b) row.start_time = isTime(b.start_time) ? b.start_time : null;
  if ('end_time' in b) row.end_time = isTime(b.end_time) ? b.end_time : null;
  if ('location' in b) row.location = str(b.location, 300);
  if ('notes' in b) row.notes = str(b.notes, 5000);
  if ('partner_id' in b) row.partner_id = str(b.partner_id, 64);
  if ('attendees' in b) {
    const ids = Array.isArray(b.attendees) ? [...new Set(b.attendees.map((x) => str(x, 64)).filter(Boolean))].slice(0, 30) : [];
    if (ids.length) {
      const { results } = await db.prepare(`SELECT id FROM users WHERE active = 1 AND id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all();
      if (results.length !== ids.length) return bad('Someone invited isn’t in the team');
    }
    row.attendees = ids.length ? JSON.stringify(ids) : null;
  }

  if (!row.title) return bad('Give the event a name');
  if (!row.date) return bad('Choose a date');
  if (row.end_date && row.end_date <= row.date) row.end_date = null; // one-day event
  if (!row.start_time) row.end_time = null;
  if (row.start_time && row.end_time && !row.end_date && row.end_time <= row.start_time) return bad('The end time must be after the start');
  if (!auth.canEdit(row.category) && !(existing && existing.created_by === auth.user.id && existing.category === row.category)) {
    return bad(`You can’t add events to ${row.category === 'sales' ? 'Sales' : 'Marketing'}`, 403);
  }
  if (row.partner_id && !(await db.prepare('SELECT 1 FROM partners WHERE id = ?').bind(row.partner_id).first())) return bad('Partner not found', 404);
  row.updated_at = t;

  const cols = ['id', 'title', 'category', 'date', 'end_date', 'start_time', 'end_time', 'location', 'partner_id', 'attendees', 'notes', 'created_by', 'created_at', 'updated_at'];
  await db
    .prepare(
      `INSERT INTO events (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id' && c !== 'created_at' && c !== 'created_by').map((c) => `${c} = excluded.${c}`).join(', ')}`
    )
    .bind(...cols.map((c) => row[c] ?? null))
    .run();
  return json({ ...row, attendees: parseAttendees(row) });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  const ev = id ? await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first() : null;
  if (!ev) return bad('Event not found', 404);
  if (!canEditEvent(ev, auth)) return bad('You can’t delete this event', 403);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id),
    env.DB.prepare(`DELETE FROM files WHERE parent_type = 'event' AND parent_id = ?`).bind(id),
  ]);
  return json({ ok: true });
}
