// /api/activities (admin only) — the visit / call / e-mail log.
//   POST   { partner_id, type, happened_at, contact_id, summary, partner: { stage, next_follow_up } }
//          `partner` is optional: logging a visit can move the partner on and set the next follow-up.
//   DELETE ?id=…

import { authorize, bad, isDate, json, now, oneOf, readJson, str, uuid } from '../_lib/db.js';
import { savePartner } from '../_lib/partners.js';

const TYPES = ['visit', 'meeting', 'call', 'email', 'note'];

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  if (!b) return bad('Invalid request');
  const partner = await env.DB.prepare('SELECT id FROM partners WHERE id = ?').bind(b.partner_id ?? '').first();
  if (!partner) return bad('Partner not found', 404);

  const when = new Date(b.happened_at || Date.now());
  if (Number.isNaN(when.getTime())) return bad('Invalid date');
  const row = {
    id: uuid(),
    partner_id: partner.id,
    contact_id: str(b.contact_id, 64),
    type: oneOf(b.type, TYPES, 'visit'),
    happened_at: when.toISOString(),
    summary: str(b.summary, 5000),
    created_at: now(),
  };
  const statements = [
    env.DB.prepare(
      `INSERT INTO activities (id, partner_id, contact_id, type, happened_at, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(row.id, row.partner_id, row.contact_id, row.type, row.happened_at, row.summary, row.created_at),
  ];
  // A visit ticks off the planned visit(s) for this partner up to that day (the page sends its local date).
  if (row.type === 'visit' || row.type === 'meeting') {
    const day = isDate(b.local_date) ? b.local_date : row.happened_at.slice(0, 10);
    statements.push(
      env.DB.prepare(`UPDATE tasks SET done = 1, done_at = ? WHERE partner_id = ? AND type = 'visit' AND done = 0 AND due_date <= ?`).bind(
        now(),
        row.partner_id,
        day
      )
    );
  }
  await env.DB.batch(statements);

  if (b.partner && typeof b.partner === 'object') {
    const patch = {};
    if ('stage' in b.partner) patch.stage = b.partner.stage;
    if ('next_follow_up' in b.partner) patch.next_follow_up = b.partner.next_follow_up;
    if (Object.keys(patch).length) {
      const result = await savePartner(env.DB, { id: partner.id, ...patch });
      if (result.error) return bad(result.error, result.status);
    }
  }
  return json(row);
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
