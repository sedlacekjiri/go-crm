// /api/auth — signing in and out.
//   POST { action: 'login', email, password }  → { token, user }
//        • e-mail + password of a team member
//        • the owner: their e-mail (or no e-mail) + ADMIN_PASSWORD
//   POST { action: 'logout' }                    ends this session
//   GET                                          → the signed-in user

import {
  authorize, bad, checkPassword, ensureSchema, json, now, ownerUser, publicUser, randomToken, readJson, safeEqual, sha256, str,
} from '../_lib/db.js';

const SESSION_DAYS = 180;

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  return json({ user: auth.user });
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.DB) return bad('The CRM is not set up yet (ADMIN_PASSWORD / database).', 503);
  await ensureSchema(env.DB);
  const b = await readJson(request);
  if (!b) return bad('Invalid request');
  const db = env.DB;

  if (b.action === 'logout') {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true });
  }

  if (b.action !== 'login') return bad('Invalid request');
  const email = str(b.email, 300)?.toLowerCase() ?? null;
  const password = typeof b.password === 'string' ? b.password : '';
  const fail = async () => {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return bad('Wrong e-mail or password', 401);
  };

  let user = null;
  if (!email) {
    if (safeEqual(password, env.ADMIN_PASSWORD)) user = await ownerUser(db);
    // The shared read-only password keeps working as before (no personal session).
    else if (env.VIEWER_PASSWORD && safeEqual(password, env.VIEWER_PASSWORD)) {
      return json({ token: env.VIEWER_PASSWORD, user: publicUser({ id: 'viewer', name: 'Viewer', role: 'viewer', sections: '["sales","marketing"]', active: 1 }) });
    }
  } else {
    const row = await db.prepare('SELECT * FROM users WHERE lower(email) = ? AND active = 1').bind(email).first();
    if (row?.role === 'owner') user = safeEqual(password, env.ADMIN_PASSWORD) ? row : null;
    else if (row && (await checkPassword(password, row.password_hash))) user = row;
    // The owner's password is ADMIN_PASSWORD; it works with any e-mail no colleague uses
    // (e.g. before the owner has saved their e-mail in Edit profile).
    else if (!row && safeEqual(password, env.ADMIN_PASSWORD)) user = await ownerUser(db);
  }
  if (!user) return fail();

  const token = randomToken();
  const t = now();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.batch([
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), user.id, t, expires),
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(t, user.id),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
  ]);
  return json({ token, user: publicUser(user) });
}
