// /api/posts (admin only) — marketing content: ideas and planned / published posts.
//   POST   { id?, title, brand, channels: [...], format, theme, status, publish_date, publish_time, deadline,
//            caption, media_url, post_url, notes, assignee_id, subtasks: [{ title, done }],
//            repeat_dates: [YYYY-MM-DD] }   create (with copies on the repeat dates), or update only the fields sent
//   DELETE ?id=…[&following=1]   (following: also the later posts of the same repeating series)

import { authorize, bad, checkSubtaskPeople, cleanSubtasks, isDate, json, now, oneOf, parseSubtasks, readJson, str, uuid } from '../_lib/db.js';

const CHANNELS = ['facebook', 'instagram', 'tiktok', 'google', 'youtube'];
const FORMATS = ['reel', 'post', 'carousel', 'story'];
const STATUSES = ['idea', 'in_progress', 'scheduled', 'published'];
const BRANDS = ['car', 'camper', 'both'];
const isTime = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
const shift = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

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
  const auth = await authorize(request, env, { write: true, section: 'marketing' });
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
    const problem = await checkSubtaskPeople(db, list);
    if (problem) return bad(problem);
    row.subtasks = list;
  }
  if ('assignee_id' in b) {
    row.assignee_id = str(b.assignee_id, 64);
    if (row.assignee_id && !(await db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').bind(row.assignee_id).first())) return bad('That person isn’t in the team');
  }
  if (!row.title) return bad('Give it a short title');
  // Remember when it actually went live (the planned publish_date can be different).
  // And who did it, so the team sees it in Tasks → Done.
  if (row.status === 'published' && !row.published_at) {
    row.published_at = now();
    row.published_by = auth.user?.id ?? null;
  }
  if (row.status !== 'published') row.published_at = row.published_by = null;
  if (row.status !== 'idea' && !row.publish_date) return bad('Choose a publish date (or keep it as an idea)');
  row.updated_at = now();

  // A repeating post: one copy per date, its deadline moved by the same number of days.
  const repeats = !existing && row.publish_date && Array.isArray(b.repeat_dates)
    ? [...new Set(b.repeat_dates.filter((d) => isDate(d) && d > row.publish_date))].sort().slice(0, 52)
    : [];
  if (repeats.length) row.series_id = row.id;
  const rows = [
    row,
    ...repeats.map((d) => ({
      ...row,
      id: uuid(),
      publish_date: d,
      deadline: row.deadline ? shift(d, dayDiff(row.publish_date, row.deadline)) : null,
      status: row.status === 'published' ? 'scheduled' : row.status,
      published_at: null,
      published_by: null,
      post_url: null,
    })),
  ];
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  await db.batch(
    rows.map((r) =>
      db
        .prepare(
          `INSERT INTO posts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
           ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
        )
        .bind(...cols.map((c) => r[c] ?? null))
    )
  );
  return json({ ...row, channels: row.channels ? row.channels.split(',') : [], subtasks: parseSubtasks(row.subtasks), repeated: repeats.length });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'marketing' });
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return bad('Missing id');
  let ids = [id];
  if (url.searchParams.get('following')) {
    const post = await env.DB.prepare('SELECT series_id, publish_date FROM posts WHERE id = ?').bind(id).first();
    if (post?.series_id && post.publish_date) {
      const { results } = await env.DB.prepare('SELECT id FROM posts WHERE series_id = ? AND publish_date >= ?').bind(post.series_id, post.publish_date).all();
      ids = [...new Set([id, ...results.map((r) => r.id)])];
    }
  }
  await env.DB.batch(
    ids.flatMap((x) => [
      env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(x),
      env.DB.prepare(`DELETE FROM files WHERE parent_type = 'post' AND parent_id = ?`).bind(x),
      env.DB.prepare(`DELETE FROM comments WHERE parent_type = 'post' AND parent_id = ?`).bind(x),
      env.DB.prepare(`DELETE FROM comment_reads WHERE parent_type = 'post' AND parent_id = ?`).bind(x),
    ])
  );
  return json({ ok: true, deleted: ids.length });
}
