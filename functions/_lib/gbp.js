// Google Business Profile: the official API for owners/managers. Unlike the Places API it returns
// every review, newest first, and lets us reply. Needs:
//   • Google's approval of "Basic API access" for the Cloud project,
//   • an OAuth client: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET secrets,
//   • one admin sign-in ("Connect Google account") – the refresh token is kept in D1.

import { now } from './db.js';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ACCOUNTS = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const V4 = 'https://mybusiness.googleapis.com/v4';
export const SCOPES = 'openid email https://www.googleapis.com/auth/business.manage';

export const isConfigured = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const redirectUri = (request) => `${new URL(request.url).origin}/api/google/callback`;

// ── Signed "state" so the OAuth callback (which can't carry our password) is trusted ──
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

export async function signState(secret, now = Date.now()) {
  const payload = `${now}.${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyState(secret, state, now = Date.now(), maxAgeMs = 15 * 60 * 1000) {
  const parts = String(state ?? '').split('.');
  if (parts.length !== 3) return false;
  const [ts, nonce, sig] = parts;
  if (!/^\d+$/.test(ts) || now - Number(ts) > maxAgeMs || Number(ts) > now + 60000) return false;
  const expected = await hmac(secret, `${ts}.${nonce}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function authUrl(env, request, state) {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent', // always return a refresh token
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH}?${q}`;
}

async function tokenRequest(env, params) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Google sign-in failed (${res.status})`);
  return data;
}

export const exchangeCode = (env, request, code) => tokenRequest(env, { code, grant_type: 'authorization_code', redirect_uri: redirectUri(request) });

// The e-mail of the signed-in account, read from the ID token (it came straight from Google over TLS).
export function emailFromIdToken(idToken) {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))).email ?? null;
  } catch {
    return null;
  }
}

let cached = null; // { token, expires } – per worker instance
export async function accessToken(env, db) {
  if (cached && cached.expires > Date.now() + 60000) return cached.token;
  const row = await db.prepare(`SELECT refresh_token FROM google_auth WHERE id = 'main'`).first();
  if (!row) throw new Error('Google account is not connected.');
  try {
    const t = await tokenRequest(env, { refresh_token: row.refresh_token, grant_type: 'refresh_token' });
    cached = { token: t.access_token, expires: Date.now() + (t.expires_in ?? 3600) * 1000 };
    return cached.token;
  } catch (e) {
    if (/invalid_grant/i.test(e.message)) throw new Error('Google access was revoked or expired – connect the Google account again.');
    throw e;
  }
}
export const forgetToken = () => (cached = null);

// Google's errors, translated to what to do about them.
export function explainGoogleError(status, message = '') {
  if (status === 429 || /quota|rate limit/i.test(message))
    return 'Google hasn’t enabled Business Profile API access for this project yet (quota is 0). Wait for the approval e-mail, then try again.';
  if (/has not been used|is disabled|SERVICE_DISABLED|not been enabled/i.test(message))
    return 'Enable the Business Profile APIs in Google Cloud: “My Business Account Management API”, “My Business Business Information API” and “Google My Business API”.';
  if (status === 401) return 'Google sign-in expired – connect the Google account again.';
  if (status === 403) return `Google refused access (${message || 'permission denied'}). Is this account an owner/manager of the business profile?`;
  return message || `Google request failed (${status})`;
}

async function gapi(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(explainGoogleError(res.status, data?.error?.message));
  return data;
}

// All locations the signed-in account can manage, across its accounts.
export async function listLocations(token) {
  const out = [];
  let pageToken = '';
  const accounts = [];
  do {
    const a = await gapi(token, `${ACCOUNTS}/accounts?pageSize=20${pageToken ? `&pageToken=${pageToken}` : ''}`);
    accounts.push(...(a.accounts || []));
    pageToken = a.nextPageToken || '';
  } while (pageToken);
  for (const acc of accounts) {
    let pt = '';
    do {
      const l = await gapi(token, `${INFO}/${acc.name}/locations?readMask=name,title,storefrontAddress,metadata&pageSize=100${pt ? `&pageToken=${pt}` : ''}`);
      for (const loc of l.locations || []) {
        const addr = loc.storefrontAddress;
        out.push({
          name: loc.name, // locations/123
          account: acc.name, // accounts/456
          title: loc.title ?? '',
          address: addr ? [...(addr.addressLines || []), addr.locality].filter(Boolean).join(', ') : '',
          place_id: loc.metadata?.placeId ?? null,
        });
      }
      pt = l.nextPageToken || '';
    } while (pt);
  }
  return out;
}

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

// One Business Profile review → a row of the reviews table.
export function toGbpRow(r, loc, seenAt) {
  return {
    id: r.name, // accounts/…/locations/…/reviews/…
    place_id: loc.place_id ?? loc.name,
    location: loc.name,
    source: 'gbp',
    rating: STARS[r.starRating] ?? null,
    text: r.comment ?? null,
    language: null,
    author: r.reviewer?.isAnonymous ? 'Google user' : r.reviewer?.displayName ?? null,
    author_uri: null,
    author_photo: r.reviewer?.profilePhotoUrl ?? null,
    published_at: r.createTime ?? null,
    updated_at: r.updateTime ?? r.createTime ?? null,
    review_uri: null,
    reply_text: r.reviewReply?.comment ?? null,
    reply_at: r.reviewReply?.updateTime ?? null,
    first_seen: seenAt,
  };
}

// Pull reviews newest first. `full` walks every page (first sync); otherwise just the newest 50.
export async function syncLocation(db, token, loc, { full = false } = {}) {
  const seenAt = new Date().toISOString();
  let pageToken = '';
  let pages = 0;
  let count = 0;
  let meta = {};
  do {
    const data = await gapi(
      token,
      `${V4}/${loc.account}/${loc.name}/reviews?orderBy=${encodeURIComponent('updateTime desc')}&pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`
    );
    meta = { total: data.totalReviewCount ?? meta.total, average: data.averageRating ?? meta.average };
    const rows = (data.reviews || []).map((r) => toGbpRow(r, loc, seenAt));
    if (rows.length) {
      await db.batch(
        rows.map((x) =>
          db
            .prepare(
              `INSERT INTO reviews (id, place_id, location, source, rating, text, language, author, author_uri, author_photo, published_at, updated_at, review_uri, reply_text, reply_at, first_seen)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET rating = excluded.rating, text = excluded.text, author = excluded.author, author_photo = excluded.author_photo,
                 updated_at = excluded.updated_at, reply_text = excluded.reply_text, reply_at = excluded.reply_at, place_id = excluded.place_id`
            )
            .bind(x.id, x.place_id, x.location, x.source, x.rating, x.text, x.language, x.author, x.author_uri, x.author_photo, x.published_at, x.updated_at, x.review_uri, x.reply_text, x.reply_at, x.first_seen)
        )
      );
    }
    count += rows.length;
    pageToken = data.nextPageToken || '';
    pages++;
  } while (full && pageToken && pages < 40);
  await db
    .prepare('UPDATE gbp_locations SET synced_at = ?, total = ?, average = ? WHERE name = ?')
    .bind(seenAt, meta.total ?? null, meta.average ?? null, loc.name)
    .run();
  return count;
}

export async function postReply(token, reviewId, comment) {
  return gapi(token, `${V4}/${reviewId}/reply`, { method: 'PUT', body: JSON.stringify({ comment }) });
}

export async function deleteReply(token, reviewId) {
  return gapi(token, `${V4}/${reviewId}/reply`, { method: 'DELETE' });
}

// ── Stored connection ──────────────────────────────────────────
export async function status(env) {
  const db = env.DB;
  const [auth, locs] = await db.batch([
    db.prepare(`SELECT email, connected_at, last_sync, error FROM google_auth WHERE id = 'main'`),
    db.prepare('SELECT * FROM gbp_locations ORDER BY title'),
  ]);
  const a = auth.results[0];
  return {
    configured: isConfigured(env),
    connected: !!a,
    email: a?.email ?? null,
    connected_at: a?.connected_at ?? null,
    last_sync: a?.last_sync ?? null,
    error: a?.error ?? null,
    locations: locs.results.map((l) => ({ ...l, active: !!l.active })),
  };
}

export async function saveLocations(db, list) {
  if (!list.length) return;
  await db.batch(
    list.map((l) =>
      db
        .prepare(
          `INSERT INTO gbp_locations (name, account, title, address, place_id, label, active) VALUES (?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(name) DO UPDATE SET account = excluded.account, title = excluded.title, address = excluded.address, place_id = excluded.place_id`
        )
        .bind(l.name, l.account, l.title, l.address, l.place_id, /camp/i.test(l.title) ? 'camper' : 'car')
    )
  );
}

// Pull reviews for every active location; records the result on the connection.
export async function syncAll(env, { full = false } = {}) {
  const db = env.DB;
  try {
    const token = await accessToken(env, db);
    const { results } = await db.prepare('SELECT * FROM gbp_locations WHERE active = 1').all();
    let n = 0;
    for (const loc of results) n += await syncLocation(db, token, loc, { full });
    await db.prepare(`UPDATE google_auth SET last_sync = ?, error = NULL WHERE id = 'main'`).bind(now()).run();
    return { ok: true, reviews: n };
  } catch (e) {
    await db.prepare(`UPDATE google_auth SET last_sync = ?, error = ? WHERE id = 'main'`).bind(now(), String(e.message).slice(0, 400)).run();
    return { ok: false, error: e.message };
  }
}

