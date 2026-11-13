// /api/activities (admin only) — the visit / call / e-mail log.
//   POST   { partner_id, type, happened_at, contact_id, summary, tags, partner: { stage, next_follow_up, flyers_a4, flyers_a5 } }
//          `tags`: labels of our own activity types done with it (type 'other' = only those).
//          `partner` is optional: logging a visit can move the partner on and set the next follow-up.
//   PATCH  { id, happened_at }   correct when it happened
//   DELETE ?id=…

import { authorize, bad, isDate, json, now, oneOf, parseList, readJson, str, uuid } from '../_lib/db.js';
import { savePartner } from '../_lib/partners.js';

const TYPES = ['visit', 'meeting', 'call', 'email', 'followup', 'note', 'other'];

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'sales' });
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
  const tags = [...new Set(parseList(b.tags).map((t) => str(t, 80)).filter(Boolean))].slice(0, 20);
  row.tags = tags.length ? JSON.stringify(tags) : null;
  const statements = [
    env.DB.prepare(
      `INSERT INTO activities (id, partner_id, contact_id, type, happened_at, summary, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(row.id, row.partner_id, row.contact_id, row.type, row.happened_at, row.summary, row.tags, row.created_at),
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
    for (const k of ['next_follow_up', 'flyers_a4', 'flyers_a5']) if (k in b.partner) patch[k] = b.partner[k];
    if (Object.keys(patch).length) {
      const result = await savePartner(env.DB, { id: partner.id, ...patch }, { visitLogged: row.type === 'visit' || row.type === 'meeting', flyersLogged: true });
      if (result.error) return bad(result.error, result.status);
    }
  }
  return json({ ...row, tags });
}

export async function onRequestPatch({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'sales' });
  if (auth instanceof Response) return auth;
  const b = await readJson(request);
  const when = new Date(b?.happened_at ?? '');
  if (Number.isNaN(when.getTime())) return bad('Invalid date');
  if (when.getTime() > Date.now() + 86400000) return bad('That date is in the future');
  const { meta } = await env.DB.prepare('UPDATE activities SET happened_at = ? WHERE id = ?').bind(when.toISOString(), str(b.id, 64)).run();
  if (!meta.changes) return bad('Entry not found', 404);
  return json({ ok: true, happened_at: when.toISOString() });
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'sales' });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
