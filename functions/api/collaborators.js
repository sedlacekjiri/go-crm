// /api/collaborators (admin only) — influencer / content-creator collaborations
// (replaces the "Social Media collaboration" spreadsheet).
//   POST   { id?, name, email, socials, followers, content, brand, vehicle, pickup_date, dropoff_date,
//            handled_by, booking_ref, terms, comment, price_eur, refund_eur, status,
//            moodboard, content_delivered, in_onedrive, content_link }   create / update (only fields sent)
//   DELETE ?id=…

import { authorize, bad, int, isDate, json, now, oneOf, readJson, str, uuid } from '../_lib/db.js';

const STATUSES = ['request', 'agreed', 'delivered', 'done', 'declined'];
const money = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

const FIELDS = {
  name: (v) => str(v, 200),
  email: (v) => str(v, 300),
  socials: (v) => str(v, 2000),
  followers: (v) => int(v, 0, 1_000_000_000),
  content: (v) => str(v, 5000),
  brand: (v) => oneOf(v, ['car', 'camper'], null),
  vehicle: (v) => str(v, 200),
  pickup_date: (v) => (isDate(v) ? v : null),
  dropoff_date: (v) => (isDate(v) ? v : null),
  handled_by: (v) => str(v, 100),
  booking_ref: (v) => str(v, 200),
  terms: (v) => str(v, 1000),
  comment: (v) => str(v, 3000),
  price_eur: money,
  refund_eur: money,
  status: (v) => oneOf(v, STATUSES, 'request'),
  moodboard: (v) => (v ? 1 : 0),
  content_delivered: (v) => (v ? 1 : 0),
  in_onedrive: (v) => (v ? 1 : 0),
  content_link: (v) => str(v, 1000),
};

const out = (r) => ({ ...r, moodboard: !!r.moodboard, content_delivered: !!r.content_delivered, in_onedrive: !!r.in_onedrive });

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || typeof b !== 'object') return bad('Invalid request');
  const db = env.DB;
  const existing = b.id ? await db.prepare('SELECT * FROM collaborators WHERE id = ?').bind(b.id).first() : null;
  if (b.id && !existing) return bad('Collaborator not found', 404);
  const row = existing ? { ...existing } : { id: uuid(), status: 'request', moodboard: 0, content_delivered: 0, in_onedrive: 0, created_at: now() };
  for (const [key, clean] of Object.entries(FIELDS)) if (key in b) row[key] = clean(b[key]);
  if (!row.name) return bad('Name is required');
  if (row.pickup_date && row.dropoff_date && row.dropoff_date < row.pickup_date) return bad('Drop-off is before pick-up');
  // Keep status and the checkboxes in step: delivered ⇒ content delivered, done ⇒ refund paid.
  if (row.status === 'delivered' || row.status === 'done') row.content_delivered = 1;
  if (row.status === 'done' && !row.refunded_at) row.refunded_at = now().slice(0, 10);
  if (row.status !== 'done') row.refunded_at = null;
  row.updated_at = now();
  const cols = Object.keys(row);
  await db
    .prepare(
      `INSERT INTO collaborators (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
    )
    .bind(...cols.map((c) => row[c] ?? null))
    .run();
  return json(out(row));
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.prepare('DELETE FROM collaborators WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
