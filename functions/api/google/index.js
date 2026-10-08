// /api/google — Google Business Profile connection (Marketing → Google reviews).
//   GET                                   status: configured / connected / account / locations (everyone logged in)
//   POST { connect: true }                → { url } to start the Google sign-in (admin)
//   POST { sync: true }                   pull reviews of active locations now – all pages (admin)
//   POST { refreshLocations: true }       re-read the locations this account manages (admin)
//   POST { location: { name, active, label } }   choose which locations to follow (admin)
//   POST { reply: { review_id, comment } }       post / update a reply on Google (admin)
//   POST { deleteReply: review_id }              remove our reply (admin)
//   POST { disconnect: true }                    forget the Google account (admin)

import { authorize, bad, json, now, oneOf, readJson, str } from '../../_lib/db.js';
import { accessToken, authUrl, deleteReply, forgetToken, isConfigured, listLocations, postReply, saveLocations, signState, status, syncAll } from '../../_lib/gbp.js';

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  return json(await status(env));
}

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  if (!isConfigured(env)) return bad('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in Cloudflare Pages → Settings → Variables and Secrets.', 503);
  const b = await readJson(request);
  if (!b) return bad('Invalid request');
  const db = env.DB;

  if (b.connect) return json({ url: authUrl(env, request, await signState(env.ADMIN_PASSWORD)) });

  if (b.disconnect) {
    const row = await db.prepare(`SELECT refresh_token FROM google_auth WHERE id = 'main'`).first();
    if (row) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`, { method: 'POST' }).catch(() => {});
    await db.batch([db.prepare(`DELETE FROM google_auth WHERE id = 'main'`), db.prepare('DELETE FROM gbp_locations')]);
    forgetToken();
    return json(await status(env));
  }

  if (b.refreshLocations) {
    try {
      await saveLocations(db, await listLocations(await accessToken(env, db)));
    } catch (e) {
      return bad(e.message, 502);
    }
    return json(await status(env));
  }

  if (b.location) {
    const name = str(b.location.name, 200);
    const sets = [];
    if ('active' in b.location) sets.push(db.prepare('UPDATE gbp_locations SET active = ? WHERE name = ?').bind(b.location.active ? 1 : 0, name));
    if ('label' in b.location) sets.push(db.prepare('UPDATE gbp_locations SET label = ? WHERE name = ?').bind(oneOf(b.location.label, ['car', 'camper', 'other'], 'other'), name));
    if (sets.length) await db.batch(sets);
    return json(await status(env));
  }

  if (b.sync) {
    const r = await syncAll(env, { full: true });
    if (!r.ok) return bad(r.error, 502);
    return json({ ...(await status(env)), synced: r.reviews });
  }

  if (b.reply) {
    const id = str(b.reply.review_id, 400);
    const comment = str(b.reply.comment, 4000);
    if (!id || !comment) return bad('Write a reply first');
    const review = await db.prepare(`SELECT id FROM reviews WHERE id = ? AND source = 'gbp'`).bind(id).first();
    if (!review) return bad('Review not found', 404);
    try {
      const r = await postReply(await accessToken(env, db), id, comment);
      await db.prepare('UPDATE reviews SET reply_text = ?, reply_at = ? WHERE id = ?').bind(r.comment ?? comment, r.updateTime ?? now(), id).run();
      return json({ ok: true, reply_text: r.comment ?? comment, reply_at: r.updateTime ?? now() });
    } catch (e) {
      return bad(e.message, 502);
    }
  }

  if (b.deleteReply) {
    const id = str(b.deleteReply, 400);
    try {
      await deleteReply(await accessToken(env, db), id);
      await db.prepare('UPDATE reviews SET reply_text = NULL, reply_at = NULL WHERE id = ?').bind(id).run();
      return json({ ok: true });
    } catch (e) {
      return bad(e.message, 502);
    }
  }

  return bad('Invalid request');
}
