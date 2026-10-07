// /api/notes (admin only) — sticky notes: things to remember that aren't really tasks.
//   POST   { id?, text, color, pinned, category, partner_id }   create / update (only the fields sent)
//   DELETE ?id=…

import { authorize, bad, json, now, oneOf, readJson, str, uuid } from '../_lib/db.js';

const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'];

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || typeof b !== 'object') return bad('Invalid request');
  const db = env.DB;
  const existing = b.id ? await db.prepare('SELECT * FROM notes WHERE id = ?').bind(b.id).first() : null;
  if (b.id && !existing) return bad('Note not found', 404);
  const row = existing ? { ...existing } : { id: uuid(), color: 'yellow', pinned: 0, created_at: now() };
  if ('text' in b) row.text = str(b.text, 3000);
  if ('color' in b) row.color = oneOf(b.color, COLORS, 'yellow');
  if ('pinned' in b) row.pinned = b.pinned ? 1 : 0;
  if ('category' in b) row.category = oneOf(b.category, ['sales', 'marketing'], null);
  if ('partner_id' in b) row.partner_id = str(b.partner_id, 64);
  if (!row.text) return bad('Write something on the note');
  if (row.partner_id && !(await db.prepare('SELECT 1 FROM partners WHERE id = ?').bind(row.partner_id).first())) row.partner_id = null;
  row.updated_at = now();
  const cols = Object.keys(row);
  await db
    .prepare(
      `INSERT INTO notes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
    )
    .bind(...cols.map((c) => row[c] ?? null))
    .run();
  return json({ ...row, pinned: !!row.pinned });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
