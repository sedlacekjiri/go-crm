// Contact people shared by /api/contacts and the partners bulk change.

import { now, str, uuid } from './db.js';

// Copies of one contact for other partners; main contact only where they have none yet.
export async function addContactTo(db, ids, c) {
  const list = [...new Set(ids.map((id) => str(id, 64)).filter(Boolean))].slice(0, 500);
  if (!list.length) return 0;
  const marks = list.map(() => '?').join(', ');
  const [found, withContacts] = await db.batch([
    db.prepare(`SELECT id FROM partners WHERE id IN (${marks})`).bind(...list),
    db.prepare(`SELECT DISTINCT partner_id FROM contacts WHERE partner_id IN (${marks})`).bind(...list),
  ]);
  const has = new Set(withContacts.results.map((r) => r.partner_id));
  const t = now();
  const rows = found.results.map((p) =>
    db
      .prepare(`INSERT INTO contacts (id, partner_id, name, role, email, phone, notes, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uuid(), p.id, c.name, c.role, c.email, c.phone, c.notes, has.has(p.id) ? 0 : 1, t)
  );
  if (rows.length) await db.batch(rows);
  return rows.length;
}
