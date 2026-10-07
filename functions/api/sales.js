// /api/sales — bookings imported from Caren.
//   GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD   bookings in the period (everyone who is logged in)
//   POST { rows: [...] }                  import: insert or update by booking number (admin only).
//                                         The page converts amounts to EUR/ISK before sending.

import { authorize, bad, isDate, json, now, readJson, str } from '../_lib/db.js';

const COLUMNS =
  'booking_ref, booking_date, pickup_date, return_date, brand, vehicle, rental_days, amount, currency, amount_eur, amount_isk, fx_eur_isk, affiliate_code, status, is_cancelled, customer_country, imported_at';

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!isDate(from) || !isDate(to)) return bad('from and to (YYYY-MM-DD) are required');
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM sales WHERE booking_date >= ? AND booking_date <= ? ORDER BY booking_date DESC, booking_ref`
  )
    .bind(from, to)
    .all();
  return json(results.map((s) => ({ ...s, is_cancelled: !!s.is_cancelled })));
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || !Array.isArray(b.rows)) return bad('Invalid request');
  if (b.rows.length > 1000) return bad('Send at most 1000 rows per request');

  const t = now();
  const statements = [];
  for (const r of b.rows) {
    const ref = str(r.booking_ref, 100);
    if (!ref || !isDate(r.booking_date)) continue;
    statements.push(
      env.DB.prepare(
        `INSERT INTO sales (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(booking_ref) DO UPDATE SET ${COLUMNS.split(', ')
           .filter((c) => c !== 'booking_ref')
           .map((c) => `${c} = excluded.${c}`)
           .join(', ')}`
      ).bind(
        ref,
        r.booking_date,
        isDate(r.pickup_date) ? r.pickup_date : null,
        isDate(r.return_date) ? r.return_date : null,
        r.brand === 'car' || r.brand === 'camper' ? r.brand : null,
        str(r.vehicle, 200),
        Number.isFinite(Number(r.rental_days)) && r.rental_days !== null ? Math.round(Number(r.rental_days)) : null,
        num(r.amount),
        str(r.currency, 3) || 'EUR',
        num(r.amount_eur),
        Math.round(num(r.amount_isk)),
        Number.isFinite(Number(r.fx_eur_isk)) ? Number(r.fx_eur_isk) : null,
        str(r.affiliate_code, 100),
        str(r.status, 100),
        r.is_cancelled ? 1 : 0,
        str(r.customer_country, 100),
        t
      )
    );
  }
  // D1 batches are transactions; keep them reasonably small.
  for (let i = 0; i < statements.length; i += 100) await env.DB.batch(statements.slice(i, i + 100));
  return json({ imported: statements.length, skipped: b.rows.length - statements.length });
}
