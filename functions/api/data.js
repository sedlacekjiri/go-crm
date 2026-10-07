// GET /api/data — everything the CRM needs except sales and reviews: partners, contacts, activity log,
// tasks, marketing posts, goals.
// The data set is small (hundreds of partners), so the page loads it all at once.

import { authorize, json, parseSubtasks } from '../_lib/db.js';

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const db = env.DB;
  const [partners, contacts, activities, tasks, posts, affiliates, payouts, goals, sales] = await db.batch([
    db.prepare('SELECT * FROM partners ORDER BY name COLLATE NOCASE'),
    db.prepare('SELECT * FROM contacts ORDER BY is_primary DESC, name COLLATE NOCASE'),
    db.prepare('SELECT * FROM activities ORDER BY happened_at DESC'),
    // Open tasks plus what was done in the last 120 days (for the calendar history).
    db.prepare("SELECT * FROM tasks WHERE done = 0 OR due_date >= date('now', '-120 days') ORDER BY due_date, due_time"),
    db.prepare('SELECT * FROM posts ORDER BY publish_date, publish_time'),
    db.prepare('SELECT * FROM affiliates ORDER BY name COLLATE NOCASE'),
    db.prepare('SELECT * FROM payouts ORDER BY paid_at DESC'),
    db.prepare('SELECT * FROM goals'),
    db.prepare('SELECT COUNT(*) AS n, MIN(booking_date) AS first, MAX(booking_date) AS last, MAX(imported_at) AS imported FROM sales'),
  ]);
  return json({
    role: auth.role,
    partners: partners.results,
    contacts: contacts.results.map((c) => ({ ...c, is_primary: !!c.is_primary })),
    activities: activities.results,
    tasks: tasks.results.map((t) => ({ ...t, done: !!t.done, subtasks: parseSubtasks(t.subtasks) })),
    posts: posts.results.map((p) => ({ ...p, channels: p.channels ? p.channels.split(',') : [] })),
    affiliates: affiliates.results,
    payouts: payouts.results,
    goals: goals.results,
    salesInfo: sales.results[0],
  });
}
