// /api/users — the team, and your own profile.
//   GET                                    team list (for "Assign to"), e-mails only for admins
//   POST { profile: { name, email, photo, password, current_password } }   edit your own profile
//   POST { id?, name, email, role, sections, password, active }            add / edit a member (admin)
//   DELETE ?id=…                                                           remove a member (admin)

import {
  authorize, bad, checkPassword, hashPassword, json, now, OWNER_ID, publicUser, readJson, SECTIONS, str, uuid,
} from '../_lib/db.js';

const ROLES = ['admin', 'member', 'viewer'];
// Profile photos are resized in the browser; keep them small.
const photo = (v) => (v === null || v === '' ? null : typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 300_000 ? v : undefined);

async function emailTaken(db, email, exceptId) {
  if (!email) return false;
  return !!(await db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?) AND id != ?').bind(email, exceptId).first());
}

export async function onRequestGet({ request, env }) {
  const auth = await authorize(request, env);
  if (auth instanceof Response) return auth;
  const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY role = \'owner\' DESC, name COLLATE NOCASE').all();
  return json(
    results.map((u) => {
      const p = publicUser(u);
      return { ...p, email: auth.isTeamAdmin || u.id === auth.user.id ? p.email : null, last_login: auth.isTeamAdmin ? u.last_login : undefined };
    })
  );
}

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b || typeof b !== 'object') return bad('Invalid request');
  const db = env.DB;

  // ── Your own profile ──
  if (b.profile) {
    const auth = await authorize(request, env);
    if (auth instanceof Response) return auth;
    if (auth.user.id === 'viewer') return bad('The shared viewer login has no profile');
    const me = await db.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.id).first();
    const p = b.profile;
    const row = { ...me };
    if ('name' in p) row.name = str(p.name, 100);
    if ('email' in p) row.email = str(p.email, 300)?.toLowerCase() ?? null;
    if ('photo' in p) {
      const ph = photo(p.photo);
      if (ph === undefined) return bad('The photo is too big or not an image');
      row.photo = ph;
    }
    if (!row.name) return bad('Your name is required');
    if (await emailTaken(db, row.email, me.id)) return bad('That e-mail is already used by someone in the team', 409);
    if (p.password) {
      if (me.role === 'owner') return bad('Your password is the ADMIN_PASSWORD in Cloudflare – change it there.');
      if (String(p.password).length < 8) return bad('Use at least 8 characters');
      if (!(await checkPassword(p.current_password ?? '', me.password_hash))) return bad('Your current password is not right');
      row.password_hash = await hashPassword(String(p.password));
    }
    if (me.role !== 'owner' && !row.email) return bad('Your e-mail is needed to log in');
    await db
      .prepare('UPDATE users SET name = ?, email = ?, photo = ?, password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(row.name, row.email, row.photo, row.password_hash, now(), me.id)
      .run();
    return json(publicUser(row));
  }

  // ── Team management ──
  const auth = await authorize(request, env, { team: true });
  if (auth instanceof Response) return auth;
  if (b.id === OWNER_ID) return bad('The owner account is edited through its own profile');
  const existing = b.id ? await db.prepare('SELECT * FROM users WHERE id = ?').bind(b.id).first() : null;
  if (b.id && !existing) return bad('User not found', 404);
  const t = now();
  const row = existing ? { ...existing } : { id: uuid(), role: 'member', sections: '[]', active: 1, created_at: t };
  if ('name' in b) row.name = str(b.name, 100);
  if ('email' in b) row.email = str(b.email, 300)?.toLowerCase() ?? null;
  if ('role' in b) row.role = ROLES.includes(b.role) ? b.role : 'member';
  if ('sections' in b) row.sections = JSON.stringify((Array.isArray(b.sections) ? b.sections : []).filter((s) => SECTIONS.includes(s)));
  if ('active' in b) row.active = b.active ? 1 : 0;
  if (b.password) {
    if (String(b.password).length < 8) return bad('Use at least 8 characters for the password');
    row.password_hash = await hashPassword(String(b.password));
  }
  if (!row.name) return bad('Name is required');
  if (!row.email) return bad('E-mail is required – it’s their login');
  if (!row.password_hash) return bad('Set a first password for them');
  if (await emailTaken(db, row.email, row.id)) return bad('That e-mail is already in the team', 409);
  row.updated_at = t;
  const cols = ['id', 'email', 'name', 'photo', 'role', 'sections', 'password_hash', 'active', 'created_at', 'updated_at'];
  const statements = [
    db
      .prepare(
        `INSERT INTO users (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
         ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => !['id', 'created_at', 'photo'].includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')}`
      )
      .bind(...cols.map((c) => row[c] ?? null)),
  ];
  // Deactivating or a new password signs them out everywhere.
  if (existing && (!row.active || b.password)) statements.push(db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.id));
  await db.batch(statements);
  return json(publicUser(row));
}

export async function onRequestDelete({ request, env }) {
  const auth = await authorize(request, env, { team: true });
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id === OWNER_ID) return bad('This account can’t be removed');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?').bind(id),
    env.DB.prepare('UPDATE posts SET assignee_id = NULL WHERE assignee_id = ?').bind(id),
    env.DB.prepare('DELETE FROM notes WHERE created_by = ?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}
