// /api/reviews — Google rating & reviews for the tracked places (Marketing → Reviews).
//   GET                                    places, rating history, collected reviews; refreshes places
//                                          older than 12 hours (everyone who is logged in)
//   POST { search: "go car rental" }       find places to track (admin)
//   POST { add: place_id, label }          start tracking a place (admin)
//   POST { refresh: true }                 refresh all places now (admin)
//   DELETE ?place_id=…                     stop tracking, delete its data (admin)

import { authorize, bad, json, now, oneOf, readJson, str } from '../_lib/db.js';
import { refreshPlace, searchPlaces } from '../_lib/google.js';
import { status as gbpStatus, syncAll } from '../_lib/gbp.js';

const STALE_MS = 12 * 3600 * 1000;
const GBP_STALE_MS = 2 * 3600 * 1000; // Business Profile: newest reviews every 2 hours
const LABELS = ['car', 'camper', 'other'];

async function payload(env) {
  const db = env.DB;
  const [places, snapshots, reviews] = await db.batch([
    db.prepare('SELECT * FROM review_places ORDER BY created_at'),
    db.prepare(`SELECT * FROM review_snapshots WHERE day >= date('now', '-400 days') ORDER BY day`),
    db.prepare('SELECT * FROM reviews ORDER BY published_at DESC LIMIT 500'),
  ]);
  return { configured: !!env.GOOGLE_PLACES_API_KEY, places: places.results, snapshots: snapshots.results, reviews: reviews.results, google: await gbpStatus(env) };
}

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const key = env.GOOGLE_PLACES_API_KEY;
  if (key) {
    const { results } = await env.DB.prepare('SELECT place_id, fetched_at FROM review_places').all();
    const stale = results.filter((p) => !p.fetched_at || Date.now() - Date.parse(p.fetched_at) > STALE_MS);
    await Promise.all(stale.map((p) => refreshPlace(env.DB, key, p.place_id)));
  }
  const g = await env.DB.prepare(`SELECT last_sync FROM google_auth WHERE id = 'main'`).first();
  if (g && (!g.last_sync || Date.now() - Date.parse(g.last_sync) > GBP_STALE_MS)) await syncAll(env);
  return json(await payload(env));
}

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const key = env.GOOGLE_PLACES_API_KEY;
  if (!key) return bad('GOOGLE_PLACES_API_KEY is not set in Cloudflare Pages → Settings → Variables and Secrets.', 503);
  const b = await readJson(request);
  if (!b) return bad('Invalid request');

  if (typeof b.search === 'string') {
    const q = str(b.search, 200);
    if (!q) return bad('Type a business name');
    try {
      return json({ results: await searchPlaces(key, q) });
    } catch (e) {
      return bad(e.message, 502);
    }
  }
  if (b.add) {
    const id = str(b.add, 300);
    await env.DB.prepare(
      `INSERT INTO review_places (place_id, label, created_at) VALUES (?, ?, ?) ON CONFLICT(place_id) DO UPDATE SET label = excluded.label`
    )
      .bind(id, oneOf(b.label, LABELS, 'other'), now())
      .run();
    const r = await refreshPlace(env.DB, key, id);
    if (!r.ok) return bad(r.error, 502);
    return json(await payload(env));
  }
  if (b.refresh) {
    const { results } = await env.DB.prepare('SELECT place_id FROM review_places').all();
    const out = await Promise.all(results.map((p) => refreshPlace(env.DB, key, p.place_id)));
    const failed = out.find((r) => !r.ok);
    if (failed) return bad(failed.error, 502);
    return json(await payload(env));
  }
  return bad('Invalid request');
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { write: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('place_id');
  if (!id) return bad('Missing place_id');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reviews WHERE place_id = ?').bind(id),
    env.DB.prepare('DELETE FROM review_snapshots WHERE place_id = ?').bind(id),
    env.DB.prepare('DELETE FROM review_places WHERE place_id = ?').bind(id),
  ]);
  return json({ ok: true });
}
