// /api/affiliates (admin only) — front-line people (receptionists, concierges…) with their own code.
//   POST   { id?, partner_id, name, role, email, phone, code, url, commission_type, commission_value,
//            status, notes }                       create / update (only the fields sent)
//   POST   { payout: { affiliate_id, amount_eur, paid_at, note } }   record a payout
//   DELETE ?id=…          remove a person (and their payouts)
//   DELETE ?payout_id=…   remove a payout

import { authorize, bad, codeOwner, isDate, json, now, oneOf, readJson, str, uuid } from '../_lib/db.js';

const STATUSES = ['offered', 'confirmed', 'card_given', 'inactive'];
const TYPES = ['percent', 'fixed'];

const FIELDS = {
  partner_id: (v) => str(v, 64),
  name: (v) => str(v, 200),
  role: (v) => str(v, 200),
  email: (v) => str(v, 200),
  phone: (v) => str(v, 60),
  code: (v) => str(v, 60)?.replace(/\s+/g, '') || null,
  url: (v) => str(v, 500),
  commission_type: (v) => oneOf(v, TYPES, 'percent'),
  commission_value: (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  },
  status: (v) => oneOf(v, STATUSES, 'offered'),
  notes: (v) => str(v, 2000),
};

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || typeof b !== 'object') return bad('Invalid request');
  const db = env.DB;

  if (b.payout) {
    const p = b.payout;
    const aff = await db.prepare('SELECT id FROM affiliates WHERE id = ?').bind(p.affiliate_id ?? '').first();
    if (!aff) return bad('Affiliate not found', 404);
    const amount = Number(p.amount_eur);
    if (!Number.isFinite(amount) || amount <= 0) return bad('Enter the amount paid');
    const row = { id: uuid(), affiliate_id: aff.id, amount_eur: Math.round(amount * 100) / 100, paid_at: isDate(p.paid_at) ? p.paid_at : now().slice(0, 10), note: str(p.note, 500), created_at: now() };
    await db
      .prepare('INSERT INTO payouts (id, affiliate_id, amount_eur, paid_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.affiliate_id, row.amount_eur, row.paid_at, row.note, row.created_at)
      .run();
    return json(row);
  }

  const existing = b.id ? await db.prepare('SELECT * FROM affiliates WHERE id = ?').bind(b.id).first() : null;
  if (b.id && !existing) return bad('Affiliate not found', 404);
  const row = existing ? { ...existing } : { id: uuid(), status: 'offered', commission_type: 'percent', commission_value: 0, created_at: now() };
  for (const [key, clean] of Object.entries(FIELDS)) if (key in b) row[key] = clean(b[key]);
  if (!row.name) return bad('Name is required');
  if (!row.code) return bad('Give them a code (e.g. ANNA-BORG)');
  if (row.partner_id) {
    const p = await db.prepare('SELECT id FROM partners WHERE id = ?').bind(row.partner_id).first();
    if (!p) return bad('Partner not found', 404);
  }
  const owner = await codeOwner(db, row.code, { affiliateId: row.id });
  if (owner) return bad(`Code "${row.code}" is already used by ${owner}.`, 409);
  // Remember when they said yes and when they got their card.
  if (['confirmed', 'card_given'].includes(row.status) && !row.confirmed_at) row.confirmed_at = now().slice(0, 10);
  if (row.status === 'card_given' && !row.card_given_at) row.card_given_at = now().slice(0, 10);
  row.updated_at = now();

  const cols = Object.keys(row);
  await db
    .prepare(
      `INSERT INTO affiliates (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
    )
    .bind(...cols.map((c) => row[c] ?? null))
    .run();
  return json(row);
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const payoutId = url.searchParams.get('payout_id');
  if (payoutId) {
    await env.DB.prepare('DELETE FROM payouts WHERE id = ?').bind(payoutId).run();
    return json({ ok: true });
  }
  if (!id) return bad('Missing id');
  await env.DB.batch([env.DB.prepare('DELETE FROM payouts WHERE affiliate_id = ?').bind(id), env.DB.prepare('DELETE FROM affiliates WHERE id = ?').bind(id)]);
  return json({ ok: true });
}
