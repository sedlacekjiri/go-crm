// POST /api/social — follower counts of our own social accounts on a day (Marketing editors).
//   { date: "YYYY-MM-DD", values: { "instagram:car": 12345, "tiktok:camper": null, … } }
// A number saves that day's count, null removes it.

import { authorize, bad, isDate, json, now, readJson } from '../_lib/db.js';

const ACCOUNTS = ['instagram', 'facebook', 'tiktok'].flatMap((c) => ['car', 'camper'].map((b) => `${c}:${b}`));

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'marketing' });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b || !isDate(b.date) || typeof b.values !== 'object' || !b.values) return bad('Invalid request');
  if (b.date > new Date().toISOString().slice(0, 10)) return bad('The date can’t be in the future');
  const t = now();
  const statements = [];
  for (const account of ACCOUNTS) {
    if (!(account in b.values)) continue;
    const v = b.values[account];
    const n = v === null || v === '' ? null : Math.round(Number(v));
    if (n === null) {
      statements.push(env.DB.prepare('DELETE FROM social_stats WHERE account = ? AND date = ?').bind(account, b.date));
    } else if (Number.isFinite(n) && n >= 0 && n < 1e10) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO social_stats (account, date, followers, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(account, date) DO UPDATE SET followers = excluded.followers, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
        ).bind(account, b.date, n, auth.user.id, t)
      );
    } else return bad(`Invalid number for ${account}`);
  }
  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true, saved: statements.length });
}
