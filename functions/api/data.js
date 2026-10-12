// GET /api/data — everything the CRM page needs except sales rows and reviews, limited to what the
// signed-in person may see: Sales data only with Sales access, Marketing data only with Marketing
// access, tasks by category (or assigned to them), and only their own notes. Plus the team list
// (for "Assign to") and who they are.
// The data set is small (hundreds of partners), so the page loads it all at once.

import { authorize, canSeeTask, json, ownsNote, parseSubtasks, publicUser } from '../_lib/db.js';

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const db = env.DB;
  const sales = auth.has('sales');
  const marketing = auth.has('marketing');
  const none = db.prepare('SELECT 1 WHERE 0');
  const [partners, contacts, activities, tasks, posts, affiliates, payouts, notes, collaborators, goals, salesInfo, users, social, reportNotes] = await db.batch([
    sales ? db.prepare('SELECT * FROM partners ORDER BY name COLLATE NOCASE') : none,
    sales ? db.prepare('SELECT * FROM contacts ORDER BY is_primary DESC, name COLLATE NOCASE') : none,
    sales ? db.prepare('SELECT * FROM activities ORDER BY happened_at DESC') : none,
    // Open tasks plus what was done in the last 120 days (for the calendar history).
    db.prepare("SELECT * FROM tasks WHERE done = 0 OR due_date >= date('now', '-120 days') ORDER BY due_date, due_time"),
    marketing ? db.prepare('SELECT * FROM posts ORDER BY publish_date, publish_time') : none,
    sales ? db.prepare('SELECT * FROM affiliates ORDER BY name COLLATE NOCASE') : none,
    sales ? db.prepare('SELECT * FROM payouts ORDER BY paid_at DESC') : none,
    db.prepare('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC'),
    marketing ? db.prepare('SELECT * FROM collaborators ORDER BY pickup_date DESC, name COLLATE NOCASE') : none,
    sales ? db.prepare('SELECT * FROM goals') : none,
    sales ? db.prepare('SELECT COUNT(*) AS n, MIN(booking_date) AS first, MAX(booking_date) AS last, MAX(imported_at) AS imported FROM sales') : none,
    db.prepare(`SELECT * FROM users WHERE active = 1 ORDER BY role = 'owner' DESC, name COLLATE NOCASE`),
    marketing ? db.prepare('SELECT account, date, followers FROM social_stats ORDER BY date') : none,
    marketing ? db.prepare('SELECT week, notes, updated_by, updated_at FROM report_notes') : none,
  ]);
  return json({
    me: auth.user,
    role: auth.role,
    sections: auth.sections,
    users: users.results.map((u) => {
      const p = publicUser(u);
      return { id: p.id, name: p.name, photo: p.photo, role: p.role, sections: p.sections };
    }),
    partners: partners.results,
    contacts: contacts.results.map((c) => ({ ...c, is_primary: !!c.is_primary })),
    activities: activities.results,
    tasks: tasks.results.filter((t) => canSeeTask(t, auth)).map((t) => ({ ...t, done: !!t.done, subtasks: parseSubtasks(t.subtasks) })),
    posts: posts.results.map((p) => ({ ...p, channels: p.channels ? p.channels.split(',') : [], subtasks: parseSubtasks(p.subtasks) })),
    affiliates: affiliates.results,
    payouts: payouts.results,
    notes: notes.results.filter((n) => ownsNote(n, auth)).map((n) => ({ ...n, pinned: !!n.pinned })),
    collaborators: collaborators.results.map((c) => ({ ...c, moodboard: !!c.moodboard, content_delivered: !!c.content_delivered, in_onedrive: !!c.in_onedrive })),
    goals: goals.results,
    salesInfo: salesInfo.results[0] ?? null,
    social: social.results,
    reportNotes: reportNotes.results,
  });
}
