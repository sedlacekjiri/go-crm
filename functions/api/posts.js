// /api/posts (admin only) — marketing content: ideas and planned / published posts.
//   POST   { id?, title, brand, channels: [...], format, theme, status, publish_date, publish_time, deadline,
//            caption, media_url, post_url, notes, subtasks: [{ title, done }] }   create, or update only the fields sent
//   DELETE ?id=…

import { authorize, bad, cleanSubtasks, isDate, json, now, oneOf, parseSubtasks, readJson, str, uuid } from '../_lib/db.js';

const CHANNELS = ['facebook', 'instagram', 'tiktok', 'google', 'youtube'];
const FORMATS = ['reel', 'post', 'carousel', 'story'];
const STATUSES = ['idea', 'in_progress', 'scheduled', 'published'];
const BRANDS = ['car', 'camper', 'both'];
const isTime = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

const FIELDS = {
  title: (v) => str(v, 200),
  brand: (v) => oneOf(v, BRANDS, null),
  channels: (v) => (Array.isArray(v) ? [...new Set(v.filter((c) => CHANNELS.includes(c)))].join(',') || null : null),
  format: (v) => oneOf(v, FORMATS, null),
  theme: (v) => str(v, 60),
  status: (v) => oneOf(v, STATUSES, 'idea'),
  publish_date: (v) => (isDate(v) ? v : null),
  publish_time: (v) => (isTime(v) ? v : null),
  deadline: (v) => (isDate(v) ? v : null), // content ready by
  caption: (v) => str(v, 5000),
  media_url: (v) => str(v, 1000),
  post_url: (v) => str(v, 1000),
  notes: (v) => str(v, 2000),
};

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || typeof b !== 'object') return bad('Invalid request');
  const db = env.DB;
  const existing = b.id ? await db.prepare('SELECT * FROM posts WHERE id = ?').bind(b.id).first() : null;
  if (b.id && !existing) return bad('Post not found', 404);
  const row = existing ? { ...existing } : { id: uuid(), status: 'idea', created_at: now() };
  for (const [key, clean] of Object.entries(FIELDS)) if (key in b) row[key] = clean(b[key]);
  if ('subtasks' in b) {
    const list = cleanSubtasks(b.subtasks);
    if (list === undefined) return bad('Invalid subtasks');
    row.subtasks = list;
  }
  if (!row.title) return bad('Give it a short title');
  if (row.status !== 'idea' && !row.publish_date) return bad('Choose a publish date (or keep it as an idea)');
  row.updated_at = now();

  const cols = Object.keys(row);
  await db
    .prepare(
      `INSERT INTO posts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
    )
    .bind(...cols.map((c) => row[c] ?? null))
    .run();
  return json({ ...row, channels: row.channels ? row.channels.split(',') : [], subtasks: parseSubtasks(row.subtasks) });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
