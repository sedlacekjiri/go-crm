// /api/partners (admin only)
//   POST   { id?, ...fields }            create, or update only the fields that are sent
//   POST   { bulk: [names], type, area, chain } add many partners at once (existing names are skipped)
//   DELETE ?id=…                          delete a partner with its contacts and activity log

import { authorize, bad, json, now, oneOf, readJson, str, uuid } from '../_lib/db.js';
import { savePartner, TYPES } from '../_lib/partners.js';

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return bad('Invalid request');

  if (Array.isArray(body.bulk)) {
    const existing = await env.DB.prepare('SELECT lower(name) AS n FROM partners').all();
    const known = new Set(existing.results.map((r) => r.n));
    const type = oneOf(body.type, TYPES, 'hotel');
    const area = str(body.area, 100);
    const chain = str(body.chain, 100);
    const names = [...new Set(body.bulk.map((n) => str(n, 200)).filter(Boolean))].filter((n) => !known.has(n.toLowerCase()));
    const t = now();
    if (names.length) {
      await env.DB.batch(
        names.map((name) =>
          env.DB.prepare(
            `INSERT INTO partners (id, name, type, area, chain, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`
          ).bind(uuid(), name, type, area, chain, t, t)
        )
      );
    }
    return json({ added: names.length });
  }

  const result = await savePartner(env.DB, body);
  if (result.error) return bad(result.error, result.status);
  return json(result.partner);
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return bad('Missing id');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM activities WHERE partner_id = ?').bind(id),
    env.DB.prepare('DELETE FROM tasks WHERE partner_id = ?').bind(id),
    // Front-line people stay (with their payouts) but are no longer linked to the hotel.
    env.DB.prepare('UPDATE affiliates SET partner_id = NULL WHERE partner_id = ?').bind(id),
    env.DB.prepare('UPDATE notes SET partner_id = NULL WHERE partner_id = ?').bind(id),
    env.DB.prepare('DELETE FROM contacts WHERE partner_id = ?').bind(id),
    env.DB.prepare('DELETE FROM partners WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}
