// /api/contacts (admin only) — contact people of a partner.
//   POST   { id?, partner_id, name, role, email, phone, notes, is_primary }
//   DELETE ?id=…

import { authorize, bad, json, now, readJson, str, uuid } from '../_lib/db.js';

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b) return bad('Invalid request');
  const name = str(b.name, 200);
  if (!name) return bad('Name is required');
  const partner = await env.DB.prepare('SELECT id FROM partners WHERE id = ?').bind(b.partner_id ?? '').first();
  if (!partner) return bad('Partner not found', 404);

  const row = {
    id: b.id || uuid(),
    partner_id: partner.id,
    name,
    role: str(b.role, 200),
    email: str(b.email, 200),
    phone: str(b.phone, 60),
    notes: str(b.notes, 2000),
    is_primary: b.is_primary ? 1 : 0,
    created_at: now(),
  };
  const statements = [];
  // Only one main contact per partner.
  if (row.is_primary) {
    statements.push(env.DB.prepare('UPDATE contacts SET is_primary = 0 WHERE partner_id = ? AND id != ?').bind(row.partner_id, row.id));
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO contacts (id, partner_id, name, role, email, phone, notes, is_primary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, email = excluded.email,
         phone = excluded.phone, notes = excluded.notes, is_primary = excluded.is_primary`
    ).bind(row.id, row.partner_id, row.name, row.role, row.email, row.phone, row.notes, row.is_primary, row.created_at)
  );
  await env.DB.batch(statements);
  return json({ ...row, is_primary: !!row.is_primary });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.batch([
    env.DB.prepare('UPDATE activities SET contact_id = NULL WHERE contact_id = ?').bind(id),
    env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}
