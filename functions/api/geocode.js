// /api/geocode (Sales edit access) — map pins for partners, via Google Places (GOOGLE_PLACES_API_KEY).
//   POST {}                 looks up the next batch of partners without a pin
//                           → { located, not_found: [names], remaining }
//   POST { id, lat, lng }   puts a pin by hand (a place Google couldn't find, or a wrong match)
// A found address also fills in the partner's address when it has none.

import { locatePlace } from '../_lib/google.js';
import { authorize, bad, json, now, readJson, str } from '../_lib/db.js';

const BATCH = 12;
const inIceland = (lat, lng) => lat > 63 && lat < 67 && lng > -25 && lng < -13;

// "101 Miðborg (Downtown)" → "101 Miðborg"
export const placeQuery = (p) => [p.name, p.address || p.area?.replace(/\s*\(.*\)$/, ''), 'Iceland'].filter(Boolean).join(', ');

export async function onRequestPost({ request, env }) {
  const auth = await authorize(request, env, { write: true, section: 'sales' });
  if (auth instanceof Response) return auth;
  const b = (await readJson(request)) ?? {};
  const db = env.DB;

  if (b.id) {
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!inIceland(lat, lng)) return bad('That spot is not in Iceland');
    const { meta } = await db.prepare(`UPDATE partners SET lat = ?, lng = ?, geo_status = 'manual', updated_at = ? WHERE id = ?`).bind(lat, lng, now(), str(b.id, 64)).run();
    if (!meta.changes) return bad('Partner not found', 404);
    return json({ ok: true });
  }

  if (!env.GOOGLE_PLACES_API_KEY) return bad('Google Places is not set up (GOOGLE_PLACES_API_KEY)', 501);
  const { results } = await db.prepare(`SELECT id, name, address, area FROM partners WHERE lat IS NULL AND geo_status IS NULL LIMIT ?`).bind(BATCH).all();
  const found = await Promise.all(
    results.map((p) =>
      locatePlace(env.GOOGLE_PLACES_API_KEY, placeQuery(p)).catch((e) => {
        throw new Error(`${p.name}: ${e.message}`);
      })
    )
  ).catch((e) => e);
  if (found instanceof Error) return bad(found.message, 502);
  const notFound = [];
  if (results.length) await db.batch(
    results.map((p, i) => {
      const at = found[i];
      if (!at) notFound.push(p.name);
      return at
        ? db.prepare(`UPDATE partners SET lat = ?, lng = ?, geo_status = 'ok', address = COALESCE(NULLIF(address, ''), ?) WHERE id = ?`).bind(at.lat, at.lng, at.address, p.id)
        : db.prepare(`UPDATE partners SET geo_status = 'notfound' WHERE id = ?`).bind(p.id);
    })
  );
  const left = await db.prepare(`SELECT COUNT(*) AS n FROM partners WHERE lat IS NULL AND geo_status IS NULL`).first();
  return json({ located: results.length - notFound.length, not_found: notFound, remaining: left.n });
}
