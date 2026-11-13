// /api/activity-types (Sales edit access) — our own activity types, e.g. "Staff training".
//   POST   { label }   → the new type (or the existing one with that name)
//   DELETE ?id=…       activities already logged keep their label

import { authorize, bad, json, now, readJson, str, uuid } from '../_lib/db.js';

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'sales' });
  if (auth instanceof Response) return auth;
  const label = str((await readJson(request))?.label, 80);
  if (!label) return bad('Name is required');
  const existing = await env.DB.prepare('SELECT * FROM activity_types WHERE lower(label) = lower(?)').bind(label).first();
  if (existing) return json(existing);
  const row = { id: uuid(), label, created_at: now() };
  await env.DB.prepare('INSERT INTO activity_types (id, label, created_at) VALUES (?, ?, ?)').bind(row.id, row.label, row.created_at).run();
  return json(row);
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'sales' });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.prepare('DELETE FROM activity_types WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
