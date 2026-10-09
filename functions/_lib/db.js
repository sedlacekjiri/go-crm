// Shared helpers for the /api functions: JSON responses, password check, D1 schema.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const bad = (message, status = 400) => json({ error: message }, status);

// Constant-time string compare so the password can't be guessed by timing.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ADMIN_PASSWORD = full access, VIEWER_PASSWORD (optional) = read-only for the owners.
// Returns { role } or an error Response.
export async function authorize(request, env, { write = false } = {}) {
  if (!env.ADMIN_PASSWORD) {
    return bad('ADMIN_PASSWORD is not set in Cloudflare Pages → Settings → Variables and Secrets.', 503);
  }
  if (!env.DB) return bad('The D1 database is not bound (Cloudflare Pages → Settings → Bindings).', 503);
  const header = request.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  let role = null;
  if (safeEqual(given, env.ADMIN_PASSWORD)) role = 'admin';
  else if (env.VIEWER_PASSWORD && safeEqual(given, env.VIEWER_PASSWORD)) role = 'viewer';
  if (!role) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return bad('Wrong password', 401);
  }
  if (write && role !== 'admin') return bad('View-only access', 403);
  await ensureSchema(env.DB);
  return { role };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS partners (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'hotel',
    area TEXT, address TEXT, website TEXT, phone TEXT, email TEXT,
    rooms INTEGER, stars INTEGER,
    stage TEXT NOT NULL DEFAULT 'new',
    interest INTEGER,
    affiliate_code TEXT, affiliate_url TEXT,
    next_follow_up TEXT, accepted_at TEXT, declined_reason TEXT, notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS partners_code ON partners (lower(affiliate_code)) WHERE affiliate_code IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT, email TEXT, phone TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS contacts_partner ON contacts (partner_id)`,
  `CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL,
    contact_id TEXT,
    type TEXT NOT NULL DEFAULT 'visit',
    happened_at TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS activities_partner ON activities (partner_id, happened_at)`,
  `CREATE TABLE IF NOT EXISTS sales (
    booking_ref TEXT PRIMARY KEY,
    booking_date TEXT NOT NULL,
    pickup_date TEXT, return_date TEXT,
    brand TEXT, vehicle TEXT, rental_days INTEGER,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    amount_eur REAL NOT NULL DEFAULT 0,
    amount_isk REAL NOT NULL DEFAULT 0,
    fx_eur_isk REAL,
    affiliate_code TEXT,
    status TEXT,
    is_cancelled INTEGER NOT NULL DEFAULT 0,
    customer_country TEXT,
    imported_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sales_date ON sales (booking_date)`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'todo',
    title TEXT,
    partner_id TEXT,
    due_date TEXT NOT NULL,
    due_time TEXT,
    notes TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    done_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tasks_due ON tasks (done, due_date)`,
  `CREATE INDEX IF NOT EXISTS tasks_partner ON tasks (partner_id, done)`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    brand TEXT,
    channels TEXT,
    format TEXT,
    theme TEXT,
    status TEXT NOT NULL DEFAULT 'idea',
    publish_date TEXT,
    publish_time TEXT,
    caption TEXT,
    media_url TEXT,
    post_url TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS posts_date ON posts (publish_date)`,
  `CREATE TABLE IF NOT EXISTS review_places (
    place_id TEXT PRIMARY KEY,
    label TEXT,
    name TEXT,
    address TEXT,
    maps_uri TEXT,
    rating REAL,
    rating_count INTEGER,
    fetched_at TEXT,
    error TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS review_snapshots (
    place_id TEXT NOT NULL,
    day TEXT NOT NULL,
    rating REAL,
    rating_count INTEGER,
    PRIMARY KEY (place_id, day)
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    place_id TEXT NOT NULL,
    rating INTEGER,
    text TEXT,
    language TEXT,
    author TEXT,
    author_uri TEXT,
    author_photo TEXT,
    published_at TEXT,
    review_uri TEXT,
    first_seen TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS reviews_place ON reviews (place_id, published_at)`,
  `CREATE TABLE IF NOT EXISTS affiliates (
    id TEXT PRIMARY KEY,
    partner_id TEXT,
    name TEXT NOT NULL,
    role TEXT, email TEXT, phone TEXT,
    code TEXT NOT NULL,
    url TEXT,
    commission_type TEXT NOT NULL DEFAULT 'percent',
    commission_value REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'offered',
    confirmed_at TEXT,
    card_given_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS affiliates_code ON affiliates (lower(code))`,
  `CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    affiliate_id TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    paid_at TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS payouts_affiliate ON payouts (affiliate_id)`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'yellow',
    pinned INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    partner_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS google_auth (
    id TEXT PRIMARY KEY,
    email TEXT,
    refresh_token TEXT NOT NULL,
    connected_at TEXT NOT NULL,
    last_sync TEXT,
    error TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS gbp_locations (
    name TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    title TEXT,
    address TEXT,
    place_id TEXT,
    label TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    synced_at TEXT,
    total INTEGER,
    average REAL
  )`,
  `CREATE TABLE IF NOT EXISTS goals (
    month TEXT NOT NULL,
    metric TEXT NOT NULL,
    target REAL NOT NULL,
    PRIMARY KEY (month, metric)
  )`,
];

// Columns added after the first release. SQLite has no "ADD COLUMN IF NOT EXISTS",
// so each one is tried and the "duplicate column" error is ignored.
const MIGRATIONS = [
  `ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'sales'`,
  `ALTER TABLE tasks ADD COLUMN start_date TEXT`,
  `ALTER TABLE tasks ADD COLUMN subtasks TEXT`, // JSON: [{ id, title, done }]
  `ALTER TABLE posts ADD COLUMN deadline TEXT`, // content ready by
  `ALTER TABLE posts ADD COLUMN subtasks TEXT`, // JSON checklist, like tasks.subtasks
  `ALTER TABLE partners ADD COLUMN chain TEXT`, // hotel chain, e.g. Hilton, Center Hotels
  // Reviews from the Business Profile API (complete, newest first) next to the Places API ones.
  `ALTER TABLE reviews ADD COLUMN source TEXT NOT NULL DEFAULT 'places'`,
  `ALTER TABLE reviews ADD COLUMN location TEXT`,
  `ALTER TABLE reviews ADD COLUMN updated_at TEXT`,
  `ALTER TABLE reviews ADD COLUMN reply_text TEXT`,
  `ALTER TABLE reviews ADD COLUMN reply_at TEXT`,
];

let schemaReady = false;
export async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  for (const sql of MIGRATIONS) {
    try {
      await db.prepare(sql).run();
    } catch {}
  }
  schemaReady = true;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Trimmed string or null, capped in length.
export function str(value, max = 500) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

export function int(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

// Checklist (tasks.subtasks / posts.subtasks): [{ id?, title, done }] → cleaned JSON text or null.
export function cleanSubtasks(list) {
  if (!Array.isArray(list)) return undefined;
  const out = list
    .map((s) => ({ id: str(s?.id, 64) || uuid(), title: str(s?.title, 200), done: !!s?.done }))
    .filter((s) => s.title)
    .slice(0, 50);
  return out.length ? JSON.stringify(out) : null;
}

// tasks.subtasks / posts.subtasks are stored as JSON text.
export function parseSubtasks(v) {
  try {
    const list = v ? JSON.parse(v) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Affiliate codes must be unique across hotels and front-line people. Returns the owner's name or null.
export async function codeOwner(db, code, { partnerId = '', affiliateId = '' } = {}) {
  const p = await db.prepare('SELECT name FROM partners WHERE lower(affiliate_code) = lower(?) AND id != ?').bind(code, partnerId).first();
  if (p) return p.name;
  const a = await db.prepare('SELECT name FROM affiliates WHERE lower(code) = lower(?) AND id != ?').bind(code, affiliateId).first();
  return a ? a.name : null;
}
