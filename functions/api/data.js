// GET /api/data — everything the CRM needs except sales: partners, contacts, activity log, goals.
// The data set is small (hundreds of partners), so the page loads it all at once.

import { authorize, json } from '../_lib/db.js';

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const db = env.DB;
  const [partners, contacts, activities, goals, sales] = await db.batch([
    db.prepare('SELECT * FROM partners ORDER BY name COLLATE NOCASE'),
    db.prepare('SELECT * FROM contacts ORDER BY is_primary DESC, name COLLATE NOCASE'),
    db.prepare('SELECT * FROM activities ORDER BY happened_at DESC'),
    db.prepare('SELECT * FROM goals'),
    db.prepare('SELECT COUNT(*) AS n, MIN(booking_date) AS first, MAX(booking_date) AS last, MAX(imported_at) AS imported FROM sales'),
  ]);
  return json({
    role: auth.role,
    partners: partners.results,
    contacts: contacts.results.map((c) => ({ ...c, is_primary: !!c.is_primary })),
    activities: activities.results,
    goals: goals.results,
    salesInfo: sales.results[0],
  });
}
