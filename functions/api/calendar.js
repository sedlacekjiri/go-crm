// /api/calendar — the Sales calendar as a private feed for Google Calendar (or iPhone / Outlook).
//   GET    ?token=…   the .ics feed (no login: the secret link is the key; Google can't log in)
//   GET               { active } – whether you have a link
//   POST              a new private link { url } (the old one stops working)
//   DELETE            switch the link off

import { authFor, authorize, bad, canSeeEvent, canSeeTask, ensureSchema, json, now, randomToken, sha256 } from '../_lib/db.js';
import { calendarText, salesFeed } from '../_lib/ics.js';

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function feed(request, env, token) {
  if (!env.DB) return new Response('Not available', { status: 503 });
  await ensureSchema(env.DB);
  const db = env.DB;
  const row = await db
    .prepare('SELECT u.* FROM calendar_feeds f JOIN users u ON u.id = f.user_id WHERE f.token_hash = ? AND u.active = 1')
    .bind(await sha256(token))
    .first();
  if (!row) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return new Response('Unknown calendar link', { status: 404 });
  }
  const auth = authFor(row);
  if (!auth.has('sales')) return new Response('No access to Sales', { status: 403 });
  const from = day(-30);
  const to = day(365);
  const [tasks, partners, events] = await Promise.all([
    db.prepare('SELECT * FROM tasks WHERE due_date BETWEEN ? AND ?').bind(from, to).all(),
    db.prepare('SELECT id, name, address, area, stage, next_follow_up, declined_reason FROM partners').all(),
    db.prepare('SELECT * FROM events WHERE COALESCE(end_date, date) >= ? AND date <= ?').bind(from, to).all(),
  ]);
  const base = new URL(request.url).origin;
  const items = salesFeed(
    { tasks: tasks.results.filter((t) => canSeeTask(t, auth)), partners: partners.results, events: events.results.filter((e) => canSeeEvent(e, auth)) },
    { from, to, base }
  );
  return new Response(calendarText('GO CRM – Sales', items), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  if (token) return feed(request, env, token);
  const auth = await authorize(request, env, { section: 'sales' });
  if (auth instanceof Response) return auth;
  const row = await env.DB.prepare('SELECT created_at FROM calendar_feeds WHERE user_id = ?').bind(auth.user.id).first();
  return json({ active: !!row, created_at: row?.created_at ?? null });
}

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { section: 'sales' });
  if (auth instanceof Response) return auth;
  if (auth.user.id === 'viewer') return bad('View-only access', 403);
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM calendar_feeds WHERE user_id = ?').bind(auth.user.id),
    env.DB.prepare('INSERT INTO calendar_feeds (token_hash, user_id, created_at) VALUES (?, ?, ?)').bind(await sha256(token), auth.user.id, now()),
  ]);
  return json({ url: `${new URL(request.url).origin}/api/calendar?token=${token}` });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { section: 'sales' });
  if (auth instanceof Response) return auth;
  await env.DB.prepare('DELETE FROM calendar_feeds WHERE user_id = ?').bind(auth.user.id).run();
  return json({ ok: true });
}
