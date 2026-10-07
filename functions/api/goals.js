// POST /api/goals (admin only) — { month: "YYYY-MM", targets: { visits: 40, revenue_eur: null, … } }
// A null / empty target removes it.

import { authorize, bad, json, readJson } from '../_lib/db.js';

const METRICS = ['visits', 'new_partners', 'bookings', 'revenue_eur'];

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || !/^\d{4}-\d{2}$/.test(b.month || '') || typeof b.targets !== 'object') return bad('Invalid request');
  const statements = [];
  for (const metric of METRICS) {
    if (!(metric in b.targets)) continue;
    const v = b.targets[metric];
    const n = v === null || v === '' ? null : Number(v);
    if (n === null || !Number.isFinite(n) || n < 0) {
      statements.push(env.DB.prepare('DELETE FROM goals WHERE month = ? AND metric = ?').bind(b.month, metric));
    } else {
      statements.push(
        env.DB.prepare(
          'INSERT INTO goals (month, metric, target) VALUES (?, ?, ?) ON CONFLICT(month, metric) DO UPDATE SET target = excluded.target'
        ).bind(b.month, metric, n)
      );
    }
  }
  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true });
}
