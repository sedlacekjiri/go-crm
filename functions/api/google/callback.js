// GET /api/google/callback — Google sends the admin back here after "Connect Google account".
// It can't carry the CRM password, so the request is trusted through the signed `state` we created.

import { ensureSchema, now } from '../../_lib/db.js';
import { accessToken, emailFromIdToken, exchangeCode, forgetToken, isConfigured, listLocations, saveLocations, syncAll, verifyState } from '../../_lib/gbp.js';

const back = (request, params) => Response.redirect(`${new URL(request.url).origin}/#/marketing?tab=reviews&${new URLSearchParams(params)}`, 302);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env.DB || !env.ADMIN_PASSWORD || !isConfigured(env)) return back(request, { google: 'error', msg: 'Google connection is not set up in Cloudflare yet.' });
  if (url.searchParams.get('error')) return back(request, { google: 'error', msg: `Google sign-in was cancelled (${url.searchParams.get('error')}).` });
  if (!(await verifyState(env.ADMIN_PASSWORD, url.searchParams.get('state')))) {
    return back(request, { google: 'error', msg: 'The sign-in link expired – click “Connect Google account” again.' });
  }
  await ensureSchema(env.DB);
  try {
    const tokens = await exchangeCode(env, request, url.searchParams.get('code') ?? '');
    if (!tokens.refresh_token) throw new Error('Google did not return offline access – remove go-crm under myaccount.google.com → Security → Third-party access and connect again.');
    await env.DB.prepare(
      `INSERT INTO google_auth (id, email, refresh_token, connected_at) VALUES ('main', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, refresh_token = excluded.refresh_token, connected_at = excluded.connected_at, error = NULL`
    )
      .bind(emailFromIdToken(tokens.id_token ?? ''), tokens.refresh_token, now())
      .run();
    forgetToken();
  } catch (e) {
    return back(request, { google: 'error', msg: e.message });
  }
  // Find the profiles this account manages and pull their reviews. If Google hasn't approved API
  // access yet this fails – the account stays connected and the page explains what's missing.
  try {
    await saveLocations(env.DB, await listLocations(await accessToken(env, env.DB)));
    await syncAll(env, { full: true });
  } catch (e) {
    await env.DB.prepare(`UPDATE google_auth SET error = ? WHERE id = 'main'`).bind(String(e.message).slice(0, 400)).run();
  }
  return back(request, { google: 'connected' });
}
