// /api/files — files on the Files page, or attached to a task or a marketing post (voiceover
// scripts, PDFs, images…). Stored in D1, so each file must stay under MAX_BYTES; bigger things
// (videos) go in as links.
//   GET    ?id=…                                                  the file itself
//   POST   multipart: file, parent_type (task|post|library), parent_id, folder_id?   upload
//   PATCH  { id, name?, folder_id? }                              rename / move to a folder
//   DELETE ?id=…

import { authorize, bad, canEditTask, canSeeTask, json, now, readJson, str, uuid } from '../_lib/db.js';

const MAX_BYTES = 1.5 * 1024 * 1024;

// The task / post a file belongs to, if this person may see it (and change it, for `write`).
async function parent(env, auth, type, id, write) {
  if (type === 'task') {
    const t = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
    if (!t || !canSeeTask(t, auth)) return null;
    return !write || canEditTask(t, auth) ? t : false;
  }
  if (type === 'library') {
    // Uploaded straight to the Files page – a Marketing thing.
    if (!auth.has('marketing')) return null;
    return !write || auth.canEdit('marketing') ? { id: '' } : false;
  }
  if (type === 'post') {
    if (!auth.has('marketing')) return null;
    const p = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(id).first();
    if (!p) return null;
    return !write || auth.canEdit('marketing') ? p : false;
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  const f = id ? await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first() : null;
  if (!f || !(await parent(env, auth, f.parent_type, f.parent_id, false))) return bad('File not found', 404);
  // D1 hands BLOBs back as an array of byte values.
  const bytes = f.data instanceof ArrayBuffer ? new Uint8Array(f.data) : Uint8Array.from(f.data);
  return new Response(bytes, {
    headers: {
      'content-type': f.type || 'application/octet-stream',
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  let form;
  try {
    form = await request.formData();
  } catch {
    return bad('Invalid upload');
  }
  const file = form.get('file');
  const type = form.get('parent_type');
  const pid = type === 'library' ? '' : str(form.get('parent_id'), 64);
  const folder = await folderId(env, form.get('folder_id'));
  if (folder === false) return bad('Folder not found', 404);
  if (!file || typeof file === 'string') return bad('Choose a file');
  if (file.size > MAX_BYTES) return bad(`“${file.name}” is too big – files can be up to 1.5 MB. For videos, paste a Google Drive / OneDrive link in the notes.`);
  const p = await parent(env, auth, type, pid, true);
  if (p === null) return bad('Not found', 404);
  if (p === false) return bad('You can’t change this', 403);
  const row = { id: uuid(), parent_type: type, parent_id: pid, folder_id: folder, name: str(file.name, 200) || 'file', type: str(file.type, 100), size: file.size, created_by: auth.user.id, created_at: now() };
  await env.DB.prepare('INSERT INTO files (id, parent_type, parent_id, folder_id, name, type, size, data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.parent_type, row.parent_id, row.folder_id, row.name, row.type, row.size, await file.arrayBuffer(), row.created_by, row.created_at)
    .run();
  return json(row);
}

// null for "no folder", the id if the folder exists, false if it doesn't.
async function folderId(env, value) {
  const id = str(value, 64);
  if (!id) return null;
  return (await env.DB.prepare('SELECT id FROM folders WHERE id = ?').bind(id).first()) ? id : false;
}

export async function onRequestPatch({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  const f = b?.id ? await env.DB.prepare('SELECT id, parent_type, parent_id, name, folder_id FROM files WHERE id = ?').bind(b.id).first() : null;
  if (!f) return bad('File not found', 404);
  const p = await parent(env, auth, f.parent_type, f.parent_id, true);
  if (!p) return bad(p === false ? 'You can’t change this' : 'File not found', p === false ? 403 : 404);
  // Sorting into folders happens on the Files page, which is part of Marketing.
  if ('folder_id' in b && !auth.canEdit('marketing')) return bad('Only Marketing can sort files into folders', 403);
  const name = 'name' in b ? str(b.name, 200) : f.name;
  if (!name) return bad('Give the file a name');
  const folder = 'folder_id' in b ? await folderId(env, b.folder_id) : f.folder_id;
  if (folder === false) return bad('Folder not found', 404);
  await env.DB.prepare('UPDATE files SET name = ?, folder_id = ? WHERE id = ?').bind(name, folder, f.id).run();
  return json({ id: f.id, name, folder_id: folder });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  const f = id ? await env.DB.prepare('SELECT id, parent_type, parent_id FROM files WHERE id = ?').bind(id).first() : null;
  if (!f) return bad('File not found', 404);
  const p = await parent(env, auth, f.parent_type, f.parent_id, true);
  if (!p) return bad(p === false ? 'You can’t change this' : 'File not found', p === false ? 403 : 404);
  await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
