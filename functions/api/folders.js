// /api/folders — folders on the Files page (Marketing editors).
//   POST   { id?, name }   create or rename
//   DELETE ?id=…           remove the folder; its files stay, just without a folder

import { authorize, bad, json, now, readJson, str, uuid } from '../_lib/db.js';

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'marketing' });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  const name = str(b?.name, 80);
  if (!name) return bad('Give the folder a name');
  if (b.id) {
    const r = await env.DB.prepare('UPDATE folders SET name = ? WHERE id = ?').bind(name, b.id).run();
    if (!r.meta.changes) return bad('Folder not found', 404);
    return json({ id: b.id, name });
  }
  const row = { id: uuid(), name, created_at: now() };
  await env.DB.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)').bind(row.id, row.name, row.created_at).run();
  return json(row);
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'marketing' });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.batch([
    env.DB.prepare('UPDATE files SET folder_id = NULL WHERE folder_id = ?').bind(id),
    env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}
