// Google reviews via the Places API (New). Needs the GOOGLE_PLACES_API_KEY secret.
// Each refresh returns the rating, the total review count and up to 5 reviews; the CRM keeps the
// reviews it has seen and a daily rating snapshot, so history builds up over time.

const API = 'https://places.googleapis.com/v1';

async function call(url, key, fieldMask, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Google Places request failed (${res.status})`);
  return data;
}

export async function searchPlaces(key, query) {
  const data = await call(`${API}/places:searchText`, key, 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount', {
    method: 'POST',
    body: JSON.stringify({ textQuery: query, languageCode: 'en', regionCode: 'IS' }),
  });
  return (data.places || []).map((p) => ({
    place_id: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? 0,
  }));
}

export async function fetchPlace(key, placeId) {
  return call(`${API}/places/${encodeURIComponent(placeId)}?languageCode=en`, key, 'id,displayName,formattedAddress,googleMapsUri,rating,userRatingCount,reviews');
}

// One API review → one row of the reviews table. Keeps the original-language text when present.
export function toReviewRow(r, placeId, seenAt) {
  const text = r.originalText?.text ?? r.text?.text ?? null;
  return {
    id: r.name,
    place_id: placeId,
    rating: r.rating ?? null,
    text,
    language: r.originalText?.languageCode ?? r.text?.languageCode ?? null,
    author: r.authorAttribution?.displayName ?? null,
    author_uri: r.authorAttribution?.uri ?? null,
    author_photo: r.authorAttribution?.photoUri ?? null,
    published_at: r.publishTime ?? null,
    review_uri: r.googleMapsUri ?? null,
    first_seen: seenAt,
  };
}

export async function refreshPlace(db, key, placeId) {
  const t = new Date().toISOString();
  try {
    const p = await fetchPlace(key, placeId);
    const statements = [
      db
        .prepare(
          `UPDATE review_places SET name = ?, address = ?, maps_uri = ?, rating = ?, rating_count = ?, fetched_at = ?, error = NULL WHERE place_id = ?`
        )
        .bind(p.displayName?.text ?? null, p.formattedAddress ?? null, p.googleMapsUri ?? null, p.rating ?? null, p.userRatingCount ?? 0, t, placeId),
      db
        .prepare(
          `INSERT INTO review_snapshots (place_id, day, rating, rating_count) VALUES (?, ?, ?, ?)
           ON CONFLICT(place_id, day) DO UPDATE SET rating = excluded.rating, rating_count = excluded.rating_count`
        )
        .bind(placeId, t.slice(0, 10), p.rating ?? null, p.userRatingCount ?? 0),
    ];
    for (const r of p.reviews || []) {
      const row = toReviewRow(r, placeId, t);
      if (!row.id) continue;
      statements.push(
        db
          .prepare(
            `INSERT INTO reviews (id, place_id, rating, text, language, author, author_uri, author_photo, published_at, review_uri, first_seen)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET rating = excluded.rating, text = excluded.text, author_photo = excluded.author_photo`
          )
          .bind(row.id, row.place_id, row.rating, row.text, row.language, row.author, row.author_uri, row.author_photo, row.published_at, row.review_uri, row.first_seen)
      );
    }
    await db.batch(statements);
    return { ok: true, reviews: (p.reviews || []).length };
  } catch (e) {
    await db.prepare('UPDATE review_places SET error = ?, fetched_at = ? WHERE place_id = ?').bind(String(e.message || e).slice(0, 300), t, placeId).run();
    return { ok: false, error: e.message };
  }
}
