// /api/comments — comments on tasks and marketing posts, with @mentions and emoji reactions.
//   GET                                          comments on what this person can see + their read markers
//   POST   { parent_type, parent_id, body }      add (mentions are written into the text as <@userId>)
//   PATCH  { id, body } | { id, react }          edit your own comment / toggle your reaction
//   PUT    { parent_type, parent_id }            mark that task's / post's comments as read
//   DELETE ?id=…                                 your own comment (or any, for owner/admin)
// Someone @mentioned on a task becomes its follower, so they see it even outside their sections.

import { REACTIONS, parseReactions, shape, visibleComments } from '../_lib/comments.js';
import { authFor, authorize, bad, canSeeTask, json, now, parseList, readJson, str, uuid } from '../_lib/db.js';

// The task / post being commented on, if this person may see it.
async function parent(env, auth, type, id) {
  if (type === 'task') {
    const t = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
    return t && canSeeTask(t, auth) ? t : null;
  }
  if (type === 'post') {
    if (!auth.has('marketing')) return null;
    return env.DB.prepare('SELECT id, title FROM posts WHERE id = ?').bind(id).first();
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const { results } = await env.DB.prepare("SELECT * FROM tasks WHERE done = 0 OR due_date >= date('now', '-120 days')").all();
  return json(await visibleComments(env, auth, new Set(results.filter((t) => canSeeTask(t, auth)).map((t) => t.id))));
}

// Checks the <@id> mentions in a text. Returns { ids } or { error }.
async function checkMentions(env, body, type) {
  const ids = [...new Set([...body.matchAll(/<@([\w-]{1,64})>/g)].map((m) => m[1]))];
  if (!ids.length) return { ids };
  const { results } = await env.DB.prepare(`SELECT * FROM users WHERE active = 1 AND id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all();
  if (results.length !== ids.length) return { error: 'You mentioned someone who isn’t in the team' };
  if (type === 'post') {
    const out = results.find((u) => !authFor(u).has('marketing'));
    if (out) return { error: `${out.name} has no access to Marketing, so they can’t see this post` };
  }
  return { ids, users: results };
}

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  const type = b?.parent_type;
  const pid = str(b?.parent_id, 64);
  const body = str(b?.body, 4000);
  if (!body) return bad('Write something first');
  const p = await parent(env, auth, type, pid);
  if (!p) return bad('Not found', 404);
  const m = await checkMentions(env, body, type);
  if (m.error) return bad(m.error);
  const row = { id: uuid(), parent_type: type, parent_id: pid, body, mentions: JSON.stringify(m.ids), reactions: '{}', created_by: auth.user.id, created_at: now(), edited_at: null };
  const stmts = [
    env.DB.prepare('INSERT INTO comments (id, parent_type, parent_id, body, mentions, reactions, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
      row.id, row.parent_type, row.parent_id, row.body, row.mentions, row.reactions, row.created_by, row.created_at
    ),
    // Writing a comment means you've read the thread.
    readStmt(env, auth.user.id, type, pid, row.created_at),
  ];
  // People mentioned on a task they couldn't see so far start following it.
  if (type === 'task') {
    const newcomers = (m.users ?? []).filter((u) => !canSeeTask(p, authFor(u))).map((u) => u.id);
    if (newcomers.length) {
      const followers = [...new Set([...parseList(p.followers), ...newcomers])];
      stmts.push(env.DB.prepare('UPDATE tasks SET followers = ? WHERE id = ?').bind(JSON.stringify(followers), pid));
    }
  }
  await env.DB.batch(stmts);
  return json(shape(row));
}

const readStmt = (env, userId, type, pid, at) =>
  env.DB.prepare('INSERT INTO comment_reads (user_id, parent_type, parent_id, read_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, parent_type, parent_id) DO UPDATE SET read_at = excluded.read_at').bind(
    userId, type, pid, at
  );

export async function onRequestPatch({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  const c = b?.id ? await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(b.id).first() : null;
  const p = c && (await parent(env, auth, c.parent_type, c.parent_id));
  if (!p) return bad('Comment not found', 404);
  if ('react' in b) {
    if (!REACTIONS.includes(b.react)) return bad('Unknown reaction');
    const r = parseReactions(c.reactions);
    const who = new Set(r[b.react] ?? []);
    if (who.has(auth.user.id)) who.delete(auth.user.id);
    else who.add(auth.user.id);
    if (who.size) r[b.react] = [...who];
    else delete r[b.react];
    await env.DB.prepare('UPDATE comments SET reactions = ? WHERE id = ?').bind(JSON.stringify(r), c.id).run();
    return json(shape({ ...c, reactions: JSON.stringify(r) }));
  }
  if (c.created_by !== auth.user.id) return bad('You can only edit your own comments', 403);
  const body = str(b.body, 4000);
  if (!body) return bad('Write something first');
  const m = await checkMentions(env, body, c.parent_type);
  if (m.error) return bad(m.error);
  const edited = now();
  await env.DB.prepare('UPDATE comments SET body = ?, mentions = ?, edited_at = ? WHERE id = ?').bind(body, JSON.stringify(m.ids), edited, c.id).run();
  return json(shape({ ...c, body, mentions: JSON.stringify(m.ids), edited_at: edited }));
}

export async function onRequestPut({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  const pid = str(b?.parent_id, 64);
  if (!(await parent(env, auth, b?.parent_type, pid))) return bad('Not found', 404);
  const at = now();
  await readStmt(env, auth.user.id, b.parent_type, pid, at).run();
  return json({ parent_type: b.parent_type, parent_id: pid, read_at: at });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  const c = id ? await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first() : null;
  if (!c || !(await parent(env, auth, c.parent_type, c.parent_id))) return bad('Comment not found', 404);
  if (c.created_by !== auth.user.id && !auth.isTeamAdmin) return bad('You can only delete your own comments', 403);
  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
