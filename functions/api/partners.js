// /api/partners (admin only)
//   POST   { id?, ...fields }            create, or update only the fields that are sent
//   POST   { bulk: [names], type, area, chain } add many partners at once (existing names are skipped)
//   POST   { ids: [...], set: { stage, interest, next_follow_up, welcome_sent, welcome_reply, declined_reason }, visited_on, note, contact, followup_mail }
//          change several partners at once (e.g. one meeting about a whole hotel chain)
//   DELETE ?id=…                          delete a partner with its contacts and activity log

import { authorize, bad, isDate, json, now, oneOf, readJson, str, uuid } from '../_lib/db.js';
import { savePartner, TYPES } from '../_lib/partners.js';
import { addContactTo } from '../_lib/contacts.js';

const BULK_FIELDS = ['stage', 'interest', 'next_follow_up', 'welcome_sent', 'welcome_reply', 'declined_reason', 'flyers_a4', 'flyers_a5'];

async function bulkUpdate(env, body) {
  const ids = [...new Set(body.ids.map((id) => str(id, 64)).filter(Boolean))].slice(0, 500);
  if (!ids.length) return bad('Nothing selected');
  const set = Object.fromEntries(BULK_FIELDS.filter((k) => body.set && k in body.set).map((k) => [k, body.set[k]]));
  const note = str(body.note, 5000);
  const { results } = await env.DB.prepare(`SELECT * FROM partners WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all();
  // Optional: the same contact person added to every selected partner.
  const contact = body.contact && str(body.contact.name, 200)
    ? { name: str(body.contact.name, 200), role: str(body.contact.role, 200), email: str(body.contact.email, 200), phone: str(body.contact.phone, 60), notes: null }
    : null;
  if (contact) await addContactTo(env.DB, results.map((p) => p.id), contact);
  const today = now().slice(0, 10);
  const followUp = isDate(body.followup_mail) && body.followup_mail <= today ? body.followup_mail : null;
  const dayAt = (day) => (day === today ? now() : `${day}T12:00:00.000Z`);
  let updated = 0;
  for (const p of results) {
    const r = await savePartner(env.DB, { id: p.id, ...set, visited_on: body.visited_on, visit_note: note });
    if (r.error) return bad(`${p.name}: ${r.error}`, r.status);
    // A note goes into every partner's history: with the visit when it leaves "To visit", else with
    // the follow-up e-mail, else as a meeting on that day (one talk about the whole chain).
    const leftToVisit = p.stage === 'new' && set.stage && set.stage !== 'new';
    if (followUp) {
      await env.DB.prepare(`INSERT INTO activities (id, partner_id, type, happened_at, summary, created_at) VALUES (?, ?, 'followup', ?, ?, ?)`)
        .bind(uuid(), p.id, dayAt(followUp), leftToVisit ? null : note, now())
        .run();
    } else if (note && !leftToVisit) {
      const day = isDate(body.visited_on) && body.visited_on <= now().slice(0, 10) ? body.visited_on : null;
      await env.DB.prepare(`INSERT INTO activities (id, partner_id, type, happened_at, summary, created_at) VALUES (?, ?, 'meeting', ?, ?, ?)`)
        .bind(uuid(), p.id, day ? `${day}T12:00:00.000Z` : now(), note, now())
        .run();
    }
    // Same as on the partner page: the first welcome e-mail also goes into the activity history.
    if (isDate(set.welcome_sent) && !p.welcome_sent) {
      const at = set.welcome_sent === now().slice(0, 10) ? now() : `${set.welcome_sent}T12:00:00.000Z`;
      await env.DB.prepare(`INSERT INTO activities (id, partner_id, type, happened_at, summary, created_at) VALUES (?, ?, 'email', ?, 'Welcome e-mail sent', ?)`)
        .bind(uuid(), p.id, at, now())
        .run();
    }
    if (isDate(set.welcome_reply) && !p.welcome_reply) {
      const at = set.welcome_reply === now().slice(0, 10) ? now() : `${set.welcome_reply}T12:00:00.000Z`;
      await env.DB.prepare(`INSERT INTO activities (id, partner_id, type, happened_at, summary, created_at) VALUES (?, ?, 'email', ?, 'Replied to the welcome e-mail', ?)`)
        .bind(uuid(), p.id, at, now())
        .run();
    }
    updated++;
  }
  return json({ updated });
}

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'sales' });
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return bad('Invalid request');

  if (Array.isArray(body.ids)) return bulkUpdate(env, body);

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
  const auth = await authorize(request, env, { write: true, section: 'sales' });
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
