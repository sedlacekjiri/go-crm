// Partner validation + save, shared by /api/partners and /api/activities.

import { codeOwner, int, isDate, now, oneOf, str, uuid } from './db.js';

export const TYPES = ['hotel', 'guesthouse', 'hostel', 'campsite', 'ota', 'cafe', 'other'];
const STAGES = ['new', 'contacted', 'in_talks', 'accepted', 'declined'];

const FIELDS = {
  name: (v) => str(v, 200),
  chain: (v) => str(v, 100),
  type: (v) => oneOf(v, TYPES, 'hotel'),
  area: (v) => str(v, 100),
  address: (v) => str(v, 300),
  website: (v) => str(v, 300),
  phone: (v) => str(v, 60),
  email: (v) => str(v, 200),
  rooms: (v) => int(v, 0, 100000),
  stars: (v) => int(v, 1, 5),
  stage: (v) => oneOf(v, STAGES, 'new'),
  interest: (v) => int(v, 1, 3),
  affiliate_code: (v) => str(v, 100),
  affiliate_url: (v) => str(v, 500),
  next_follow_up: (v) => (isDate(v) ? v : null),
  declined_reason: (v) => str(v, 500),
  notes: (v) => str(v, 5000),
};

// Applies the allowed fields from body onto a partner row (used by activities.js too).
// options.visitLogged: the caller has just logged the visit itself (activities.js).
export async function savePartner(db, body, { visitLogged = false } = {}) {
  const existing = body.id ? await db.prepare('SELECT * FROM partners WHERE id = ?').bind(body.id).first() : null;
  if (body.id && !existing) return { error: 'Partner not found', status: 404 };
  const row = existing ? { ...existing } : { id: uuid(), created_at: now(), stage: 'new', type: 'hotel' };
  for (const [key, clean] of Object.entries(FIELDS)) {
    if (key in body) row[key] = clean(body[key]);
  }
  if (!row.name) return { error: 'Name is required', status: 400 };
  if (row.stage === 'accepted' && !row.accepted_at) row.accepted_at = now().slice(0, 10);
  row.updated_at = now();

  if (row.affiliate_code) {
    const owner = await codeOwner(db, row.affiliate_code, { partnerId: row.id });
    if (owner) return { error: `Affiliate code "${row.affiliate_code}" is already used by ${owner}.`, status: 409 };
  }

  const cols = Object.keys(row);
  await db
    .prepare(
      `INSERT INTO partners (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
    )
    .bind(...cols.map((c) => row[c] ?? null))
    .run();

  // Leaving "To visit" means you've been there: record a visit (unless one is already logged
  // today), so it counts in Goals and the visit history, and tick off any planned visit.
  if (!visitLogged && (!existing || existing.stage === 'new') && row.stage !== 'new') await recordVisit(db, row.id);
  return { partner: row };
}

export async function recordVisit(db, partnerId) {
  const day = now().slice(0, 10);
  const already = await db
    .prepare(`SELECT 1 FROM activities WHERE partner_id = ? AND type IN ('visit', 'meeting') AND substr(happened_at, 1, 10) = ?`)
    .bind(partnerId, day)
    .first();
  if (already) return;
  const t = now();
  await db.batch([
    db
      .prepare(`INSERT INTO activities (id, partner_id, type, happened_at, summary, created_at) VALUES (?, ?, 'visit', ?, 'Marked as visited', ?)`)
      .bind(uuid(), partnerId, t, t),
    db.prepare(`UPDATE tasks SET done = 1, done_at = ? WHERE partner_id = ? AND type = 'visit' AND done = 0 AND due_date <= ?`).bind(t, partnerId, day),
  ]);
}
