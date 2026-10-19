// Pure logic (no DOM, no network): constants, Caren import parsing, exchange rates,
// sales analytics and goals. Covered by tests/lib.test.mjs.

// ── Constants ──────────────────────────────────────────────────
export const PARTNER_TYPES = [
  // capacity: what the "size" number means for this kind of place; stars: hotels & guesthouses only.
  { value: 'hotel', label: 'Hotels', singular: 'Hotel', capacity: 'rooms', stars: true },
  { value: 'guesthouse', label: 'Guesthouses', singular: 'Guesthouse', capacity: 'rooms', stars: true },
  { value: 'hostel', label: 'Hostels', singular: 'Hostel', capacity: 'beds' },
  { value: 'campsite', label: 'Campsites', singular: 'Campsite', capacity: 'pitches' },
  { value: 'ota', label: 'OTA', singular: 'OTA' },
  { value: 'cafe', label: 'Cafés', singular: 'Café' },
  { value: 'other', label: 'Other', singular: 'Other' },
];

// Pipeline for walking in (almost all outreach is in person). The stored values stay
// the same; only the wording follows the visits. Interest (cold / warm / hot) is separate.
export const STAGES = [
  { value: 'new', label: 'To visit', hint: 'Not visited yet' },
  { value: 'contacted', label: 'Visited', hint: '1st visit done – info / flyers left' },
  { value: 'in_talks', label: 'Interested', hint: 'Wants it – visit again / meet the manager' },
  { value: 'accepted', label: 'Partner', hint: 'Agreed – affiliate link + materials' },
  { value: 'declined', label: 'Declined', hint: 'Said no (for now)' },
];

// One-tap results of a visit, added to the visit note.
export const VISIT_OUTCOMES = [
  'Met the manager',
  'Talked to reception',
  'Left flyers',
  'Placed QR stand',
  'Manager not in – come back',
  'Wants commission terms',
  'Already works with another rental',
];

// Visits + meetings per partner, newest first: Map(partnerId → { count, last }).
export function visitStats(activities) {
  const out = new Map();
  for (const a of activities) {
    if (a.type !== 'visit' && a.type !== 'meeting') continue;
    const s = out.get(a.partner_id) ?? { count: 0, last: null };
    s.count += 1;
    if (!s.last || a.happened_at > s.last) s.last = a.happened_at;
    out.set(a.partner_id, s);
  }
  return out;
}

export const INTEREST = [
  { value: 1, label: 'Cold' },
  { value: 2, label: 'Warm' },
  { value: 3, label: 'Hot' },
];

export const ACTIVITY_TYPES = [
  { value: 'visit', label: 'Visit' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'E-mail' },
  { value: 'note', label: 'Note' },
];

// Reykjavík first, then the rest of the capital region.
export const AREAS = [
  '101 Miðborg (Downtown)',
  '102 Vatnsmýri',
  '103 Kringlan / Hvassaleiti',
  '104 Vogar',
  '105 Hlíðar / Laugardalur',
  '107 Vesturbær',
  '108 Háaleiti / Fossvogur',
  '109 / 111 Breiðholt',
  '110 Árbær',
  '112 Grafarvogur',
  '113 Grafarholt / Úlfarsárdalur',
  '116 Kjalarnes',
  'Seltjarnarnes',
  'Kópavogur',
  'Garðabær',
  'Hafnarfjörður',
  'Mosfellsbær',
];

export const BRANDS = [
  { value: 'car', label: 'Go Car Rentals' },
  { value: 'camper', label: 'Go Campers' },
];

export const TASK_CATEGORIES = [
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
];

// ── Marketing ──────────────────────────────────────────────────
export const CHANNELS = [
  { value: 'instagram', label: 'Instagram', short: 'IG' },
  { value: 'facebook', label: 'Facebook', short: 'FB' },
  { value: 'tiktok', label: 'TikTok', short: 'TT' },
  { value: 'google', label: 'Google', short: 'G' },
  { value: 'youtube', label: 'YouTube', short: 'YT' },
];

export const FORMATS = [
  { value: 'reel', label: 'Reel / Video' },
  { value: 'post', label: 'Photo post' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'story', label: 'Story' },
];

export const POST_STATUSES = [
  { value: 'idea', label: 'Idea' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
];

export const POST_BRANDS = [
  { value: 'car', label: 'Go Car Rentals' },
  { value: 'camper', label: 'Go Campers' },
  { value: 'both', label: 'Both' },
];

// Iceland is seasonal – these tags keep the idea bank easy to browse.
export const THEMES = [
  'Northern lights',
  'Winter driving',
  'Summer road trip',
  'F-roads & highlands',
  'Camper life',
  'Driving tips & safety',
  'Customer photos',
  'Hotel partner',
  'Behind the scenes',
  'Offer / promo',
];

// Ready-made checklists for content, by format.
export const CHECKLIST_TEMPLATES = {
  reel: ['Script & hook', 'Shot list', 'Film', 'Voiceover', 'Edit + music', 'Subtitles', 'Cover image', 'Caption & hashtags', 'Schedule'],
  carousel: ['Topic & points', 'Photos', 'Design slides', 'Caption & hashtags', 'Schedule'],
  post: ['Photo', 'Edit', 'Caption & hashtags', 'Schedule'],
  story: ['Content', 'Stickers / link', 'Post'],
};

// Posts around today: published in the last 7 days (by when they actually went live), and what is
// planned for the next 7 days. Uses rolling windows, so Monday mornings don't show an empty week.
export function postWeekStats(posts, t = today()) {
  const from = shiftDate(t, -6);
  const to = shiftDate(t, 6);
  const wentLive = (p) => (p.published_at ? today(new Date(p.published_at)) : p.publish_date);
  const upcoming = (p) => p.publish_date && p.publish_date >= t && p.publish_date <= to;
  return {
    published: posts.filter((p) => p.status === 'published' && wentLive(p) && wentLive(p) >= from && wentLive(p) <= t).length,
    scheduled: posts.filter((p) => p.status === 'scheduled' && upcoming(p)).length,
    inProgress: posts.filter((p) => p.status === 'in_progress' && upcoming(p)).length,
    late: posts.filter((p) => (p.status === 'scheduled' || p.status === 'in_progress') && p.publish_date && p.publish_date < t).length,
  };
}

export const channelLabel = (c) => find(CHANNELS, c)?.label ?? c;
export const postStatusLabel = (s) => find(POST_STATUSES, s)?.label ?? s;

// Star counts 1–5 and average of collected reviews.
export function reviewStats(reviews, sinceIso = null) {
  const list = sinceIso ? reviews.filter((r) => (r.published_at ?? '') >= sinceIso) : reviews;
  const stars = [0, 0, 0, 0, 0];
  for (const r of list) if (r.rating >= 1 && r.rating <= 5) stars[r.rating - 1] += 1;
  const n = stars.reduce((a, b) => a + b, 0);
  return { count: n, stars, average: n ? stars.reduce((sum, c, i) => sum + c * (i + 1), 0) / n : null };
}

// Reviews gained between the first and last snapshot in the list (rating count difference).
export function reviewGrowth(snapshots) {
  if (snapshots.length < 2) return null;
  const first = snapshots[0];
  const last = snapshots.at(-1);
  return { gained: (last.rating_count ?? 0) - (first.rating_count ?? 0), from: first.day, to: last.day, ratingChange: (last.rating ?? 0) - (first.rating ?? 0) };
}

export const GOAL_METRICS = [
  { value: 'visits', label: 'Visits & meetings', unit: '' },
  { value: 'hotels_visited', label: 'Hotels visited (first time)', unit: '' },
  { value: 'new_partners', label: 'New partners', unit: '' },
  { value: 'bookings', label: 'Partner bookings', unit: '' },
  { value: 'revenue_eur', label: 'Partner revenue', unit: 'EUR' },
];

const find = (list, v) => list.find((x) => x.value === v);
export const stageLabel = (s) => find(STAGES, s)?.label ?? s;
// Hotel chains in Iceland, suggested when tagging a partner (plus any chain already in the CRM).
export const KNOWN_CHAINS = ['Center Hotels', 'Fosshotel / Íslandshótel', 'Keahotels', 'Iceland Hotel Collection by Berjaya', 'Hilton', 'Marriott', 'Radisson'];

// Chains used in the CRM with how many partners each has, most used first.
export function chainCounts(partners) {
  const counts = new Map();
  for (const p of partners) if (p.chain) counts.set(p.chain, (counts.get(p.chain) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([chain, n]) => ({ chain, n }));
}

export function chainSuggestions(partners) {
  const used = chainCounts(partners).map((c) => c.chain);
  return [...used, ...KNOWN_CHAINS.filter((k) => !used.some((u) => u.toLowerCase() === k.toLowerCase()))];
}

export const typeLabel = (t) => find(PARTNER_TYPES, t)?.singular ?? t;
export const capacityOf = (t) => find(PARTNER_TYPES, t)?.capacity ?? null;
export const hasStars = (t) => !!find(PARTNER_TYPES, t)?.stars;
// "99 rooms" / "40 beds" / "120 pitches" (the size field is stored as `rooms`).
export const capacityText = (p) => (p.rooms && capacityOf(p.type) ? `${p.rooms} ${capacityOf(p.type)}` : null);
export const interestLabel = (i) => find(INTEREST, i)?.label ?? '–';
export const activityLabel = (t) => find(ACTIVITY_TYPES, t)?.label ?? t;
export const brandLabel = (b) => find(BRANDS, b)?.label ?? 'Unknown';

// ── Dates ──────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

// Local calendar date, YYYY-MM-DD.
export function today(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// ── Caren import ───────────────────────────────────────────────
export const IMPORT_FIELDS = [
  { key: 'booking_ref', label: 'Booking number', required: true, guess: [/booking.?(no|nr|number|id|ref)/, /^(booking|reservation|ref|reference|id|number|nr)$/, /reservation.?(no|nr|number|id)/] },
  { key: 'booking_date', label: 'Booking created (date)', required: true, guess: [/(created|booked|booking.?date|order.?date|date.?created)/, /^date$/] },
  { key: 'amount', label: 'Total price', required: true, guess: [/^(total|amount|price|total.?price|grand.?total|revenue)/, /(total|amount|price)/] },
  { key: 'currency', label: 'Currency', required: false, guess: [/^(currency|curr|ccy)$/, /currency/] },
  { key: 'pickup_date', label: 'Pickup date', required: false, guess: [/(pick.?up|start|from|delivery)/] },
  { key: 'return_date', label: 'Return date', required: false, guess: [/(return|drop.?off|end|to.?date)/] },
  { key: 'rental_days', label: 'Rental days', required: false, guess: [/(days|duration|length)/] },
  { key: 'brand', label: 'Brand / company', required: false, guess: [/(brand|company|branch)/] },
  { key: 'vehicle', label: 'Vehicle / category', required: false, guess: [/(vehicle|car|category|group|model|class)/] },
  { key: 'affiliate_code', label: 'Affiliate / source', required: false, guess: [/(affiliate|referr|promo|coupon|partner|agent|source|channel|campaign)/] },
  { key: 'status', label: 'Status', required: false, guess: [/status|state/] },
  { key: 'customer_country', label: 'Customer country', required: false, guess: [/(country|nationality)/] },
];

const normalize = (s) => String(s).toLowerCase().replace(/[_\-.]+/g, ' ').trim();

export function guessMapping(headers) {
  const mapping = {};
  const used = new Set();
  for (const field of IMPORT_FIELDS) {
    for (const pattern of field.guess) {
      const hit = headers.find((h) => !used.has(h) && pattern.test(normalize(h)));
      if (hit) {
        mapping[field.key] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return mapping;
}

// "1.234,56" / "1,234.56" / "45.000" (ISK) / "€ 1 234" / "-12.5"
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/[\s ]/g, '').replace(/[^0-9,.\-]/g, '');
  if (!s || s === '-') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    const isThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].replace('-', '').length > 0);
    s = isThousands ? parts.join('') : parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validDate(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

// Returns YYYY-MM-DD or null. format: auto | dmy | mdy | ymd
export function parseDate(input, format = 'auto') {
  if (input === null || input === undefined || input === '') return null;
  // Excel cells come in as local-midnight Dates – read local parts so they don't shift a day.
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : validDate(input.getFullYear(), input.getMonth() + 1, input.getDate());
  }
  if (typeof input === 'number') {
    // Excel serial date
    if (input > 20000 && input < 80000) return new Date(Math.round((input - 25569) * 86400000)).toISOString().slice(0, 10);
    return null;
  }
  const s = String(input).trim();
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso && format !== 'dmy' && format !== 'mdy') return validDate(+iso[1], +iso[2], +iso[3]);
  const parts = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (parts) {
    const a = +parts[1];
    const b = +parts[2];
    const y = +parts[3];
    if (format === 'mdy') return validDate(y, a, b);
    if (format === 'dmy') return validDate(y, b, a);
    // auto: European day-first unless that is impossible
    return validDate(y, b, a) ?? validDate(y, a, b);
  }
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);
  return null;
}

export const detectBrand = (value) => (value ? (/camp/i.test(value) ? 'camper' : 'car') : null);

const CANCELLED = /cancel|annul|storn|void|deleted|refund/i;

// rows: objects keyed by column header. options: { dateFormat, defaultCurrency, brandMode: column|car|camper }
export function buildSales(rows, mapping, options) {
  const sales = [];
  const errors = [];
  const seen = new Map();
  const get = (row, key) => {
    const col = mapping[key];
    if (!col) return undefined;
    const v = row[col];
    return v === null || v === undefined ? undefined : v;
  };
  const text = (row, key) => {
    const v = get(row, key);
    const s = v === undefined ? '' : String(v).trim();
    return s || null;
  };

  rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    if (Object.values(row).every((v) => v === null || v === undefined || String(v).trim() === '')) return;

    const ref = text(row, 'booking_ref');
    if (!ref) return void errors.push({ row: line, message: 'Missing booking number' });
    const bookingDate = parseDate(get(row, 'booking_date'), options.dateFormat);
    if (!bookingDate) return void errors.push({ row: line, message: `Invalid booking date "${get(row, 'booking_date') ?? ''}"` });
    const amount = parseNumber(get(row, 'amount'));
    if (amount === null) return void errors.push({ row: line, message: `Invalid price "${get(row, 'amount') ?? ''}"` });

    const pickup = parseDate(get(row, 'pickup_date'), options.dateFormat);
    const ret = parseDate(get(row, 'return_date'), options.dateFormat);
    let days = parseNumber(get(row, 'rental_days'));
    if (days === null && pickup && ret) days = Math.max(1, daysBetween(pickup, ret));

    const currencyRaw = text(row, 'currency');
    const currency = (currencyRaw?.match(/[A-Za-z]{3}/)?.[0] ?? (currencyRaw === '€' ? 'EUR' : options.defaultCurrency)).toUpperCase();
    const status = text(row, 'status');
    const vehicle = text(row, 'vehicle');
    const brand = options.brandMode === 'column' ? detectBrand(text(row, 'brand') ?? vehicle) : options.brandMode;

    const sale = {
      booking_ref: ref,
      booking_date: bookingDate,
      pickup_date: pickup,
      return_date: ret,
      brand,
      vehicle,
      rental_days: days === null ? null : Math.round(days),
      amount,
      currency,
      affiliate_code: text(row, 'affiliate_code'),
      status,
      is_cancelled: status ? CANCELLED.test(status) : false,
      customer_country: text(row, 'customer_country'),
    };

    // The same booking twice in one file: keep the last row (latest state).
    const prev = seen.get(ref);
    if (prev !== undefined) sales[prev] = sale;
    else {
      seen.set(ref, sales.length);
      sales.push(sale);
    }
  });

  return { sales, errors };
}

// ── Exchange rates (ECB via frankfurter.dev, "1 EUR = x") ────────
// rates: { 'YYYY-MM-DD': { ISK: 140, USD: 1.1 } }. Weekends use the latest earlier rate.
export function rateOn(rates, date, currency) {
  if (currency === 'EUR') return 1;
  let best;
  for (const d of Object.keys(rates)) {
    if (d <= date && rates[d][currency] !== undefined && (!best || d > best)) best = d;
  }
  // Booking dated after the latest published rate (e.g. today before 16:00 CET).
  if (!best) {
    for (const d of Object.keys(rates)) {
      if (rates[d][currency] !== undefined && (!best || d > best)) best = d;
    }
  }
  return best ? rates[best][currency] : undefined;
}

const round2 = (n) => Math.round(n * 100) / 100;

export function convert(amount, currency, date, rates) {
  const eurIsk = rateOn(rates, date, 'ISK');
  if (!eurIsk) throw new Error(`No EUR/ISK rate for ${date}`);
  if (currency === 'ISK') return { amount_eur: round2(amount / eurIsk), amount_isk: Math.round(amount), fx_eur_isk: eurIsk };
  const curRate = rateOn(rates, date, currency);
  if (!curRate) throw new Error(`No EUR/${currency} rate for ${date}`);
  const eur = amount / curRate;
  return { amount_eur: round2(eur), amount_isk: Math.round(eur * eurIsk), fx_eur_isk: eurIsk };
}

// ── Sales analytics ────────────────────────────────────────────
export const saleValue = (s, cur) => Number(cur === 'EUR' ? s.amount_eur : s.amount_isk);
export const activeSales = (sales) => sales.filter((s) => !s.is_cancelled);

// Monday of the ISO week
export function weekStart(date) {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDate(date, -dow);
}

export function bucketKey(date, g) {
  if (g === 'day') return date;
  if (g === 'week') return weekStart(date);
  return date.slice(0, 7);
}

export function bucketKeys(start, end, g) {
  const keys = [];
  let cur = bucketKey(start, g);
  const last = bucketKey(end, g);
  while (cur <= last) {
    keys.push(cur);
    if (g === 'day') cur = shiftDate(cur, 1);
    else if (g === 'week') cur = shiftDate(cur, 7);
    else {
      const [y, m] = cur.split('-').map(Number);
      cur = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
    }
  }
  return keys;
}

export function revenueSeries(sales, start, end, g, cur) {
  const points = new Map(bucketKeys(start, end, g).map((k) => [k, { key: k, car: 0, camper: 0, bookings: 0 }]));
  for (const s of activeSales(sales)) {
    if (s.booking_date < start || s.booking_date > end) continue;
    const p = points.get(bucketKey(s.booking_date, g));
    if (!p) continue;
    // Bookings without a brand count as cars – Go Car Rentals is the larger business.
    if (s.brand === 'camper') p.camper += saleValue(s, cur);
    else p.car += saleValue(s, cur);
    p.bookings += 1;
  }
  return [...points.values()];
}

export function totals(sales, cur) {
  const active = activeSales(sales);
  const revenue = active.reduce((sum, s) => sum + saleValue(s, cur), 0);
  const withDays = active.filter((s) => s.rental_days);
  return {
    revenue,
    bookings: active.length,
    avgBooking: active.length ? revenue / active.length : 0,
    avgDays: withDays.length ? withDays.reduce((sum, s) => sum + s.rental_days, 0) / withDays.length : null,
    cancelled: sales.length - active.length,
  };
}

export const codeKey = (code) => String(code ?? '').trim().toLowerCase();

// Code → hotel. Front-line people's codes count for their hotel too.
export function partnerByCode(partners, affiliates = []) {
  const map = new Map();
  const byId = new Map(partners.map((p) => [p.id, p]));
  for (const p of partners) if (p.affiliate_code && p.affiliate_code.trim()) map.set(codeKey(p.affiliate_code), p);
  for (const a of affiliates) if (a.code && byId.has(a.partner_id)) map.set(codeKey(a.code), byId.get(a.partner_id));
  return map;
}

export const affiliateByCode = (affiliates = []) => new Map(affiliates.filter((a) => a.code).map((a) => [codeKey(a.code), a]));

export const isPartnerSale = (s, byCode) => byCode.has(codeKey(s.affiliate_code));

// Revenue per hotel (its own code + its people's codes). Codes that don't belong to anyone in
// the CRM are listed separately so nothing is silently lost; no code = "Direct".
export function revenueByPartner(sales, partners, cur, affiliates = []) {
  const byCode = partnerByCode(partners, affiliates);
  const people = affiliateByCode(affiliates);
  const rows = new Map();
  for (const s of activeSales(sales)) {
    const code = codeKey(s.affiliate_code);
    const partner = byCode.get(code) ?? null;
    const affiliate = partner ? null : people.get(code) ?? null; // a person without a hotel
    const key = partner ? `p:${partner.id}` : `c:${code}`;
    const row = rows.get(key) ?? { partner, affiliate, code: partner ? partner.affiliate_code ?? '' : (s.affiliate_code ?? '').trim(), bookings: 0, revenue: 0 };
    row.bookings += 1;
    row.revenue += saleValue(s, cur);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
}

// Revenue per code, naming the hotel and/or the person behind it.
export function revenueBySource(sales, partners, cur, affiliates = []) {
  const byCode = partnerByCode(partners, affiliates);
  const people = affiliateByCode(affiliates);
  const rows = new Map();
  for (const s of activeSales(sales)) {
    const code = codeKey(s.affiliate_code);
    const row = rows.get(code) ?? { partner: byCode.get(code) ?? null, affiliate: people.get(code) ?? null, code: (s.affiliate_code ?? '').trim(), bookings: 0, revenue: 0 };
    row.bookings += 1;
    row.revenue += saleValue(s, cur);
    rows.set(code, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
}

// ── Front-line affiliates & commission ─────────────────────────
export const AFFILIATE_STATUSES = [
  { value: 'offered', label: 'Offered', hint: 'Told about the program' },
  { value: 'confirmed', label: 'Confirmed', hint: 'Said yes – print their card' },
  { value: 'card_given', label: 'Card given', hint: 'Has the business card' },
  { value: 'inactive', label: 'Inactive', hint: 'Left / stopped' },
];
export const affiliateStatusLabel = (s) => find(AFFILIATE_STATUSES, s)?.label ?? s;

// Commission in EUR for one booking: a % of the booking value or a fixed amount.
export function saleCommission(sale, aff) {
  const v = Number(aff.commission_value) || 0;
  return Math.round((aff.commission_type === 'fixed' ? v : (Number(sale.amount_eur) * v) / 100) * 100) / 100;
}

// A booking is only paid out once the rental has happened (not cancelled, return / pickup date passed).
// Without rental dates in the export, the booking counts from its booking date.
export const isCompleted = (sale, t = today()) => !sale.is_cancelled && (sale.return_date ?? sale.pickup_date ?? sale.booking_date) <= t;

export function affiliateEarnings(aff, sales, payouts, t = today()) {
  const mine = activeSales(sales).filter((s) => codeKey(s.affiliate_code) === codeKey(aff.code));
  const done = mine.filter((s) => isCompleted(s, t));
  const waiting = mine.filter((s) => !isCompleted(s, t));
  const earned = done.reduce((sum, s) => sum + saleCommission(s, aff), 0);
  const pending = waiting.reduce((sum, s) => sum + saleCommission(s, aff), 0);
  const paid = payouts.filter((p) => p.affiliate_id === aff.id).reduce((sum, p) => sum + Number(p.amount_eur), 0);
  return {
    bookings: mine.length,
    completed: done.length,
    revenue_eur: mine.reduce((sum, s) => sum + Number(s.amount_eur), 0),
    earned: Math.round(earned * 100) / 100,
    pending: Math.round(pending * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    owed: Math.round((earned - paid) * 100) / 100,
  };
}

export const commissionLabel = (aff) => (aff.commission_type === 'fixed' ? `€${aff.commission_value} per booking` : `${aff.commission_value} % of booking`);

// ── Goals ──────────────────────────────────────────────────────
export const monthOf = (date) => date.slice(0, 7);

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthRange(month) {
  const next = shiftMonth(month, 1);
  return { from: `${month}-01`, to: shiftDate(`${next}-01`, -1) };
}

// Share of the month already gone – for the "expected by today" pace marker.
export function monthElapsed(month, t = today()) {
  const { from, to } = monthRange(month);
  if (t < from) return 0;
  if (t > to) return 1;
  return Number(t.slice(8, 10)) / Number(to.slice(8, 10));
}

// Activity timestamps are UTC ISO strings – compare months in local time.
const localMonth = (ts) => today(new Date(ts)).slice(0, 7);

export function actuals(month, { activities, partners, sales, affiliates = [] }) {
  const byCode = partnerByCode(partners, affiliates);
  const partnerSales = activeSales(sales).filter((s) => monthOf(s.booking_date) === month && isPartnerSale(s, byCode));
  // First visit per partner – "hotels reached" that month.
  const firstVisit = new Map();
  for (const a of activities) {
    if (a.type !== 'visit' && a.type !== 'meeting') continue;
    const prev = firstVisit.get(a.partner_id);
    if (!prev || a.happened_at < prev) firstVisit.set(a.partner_id, a.happened_at);
  }
  return {
    visits: activities.filter((a) => (a.type === 'visit' || a.type === 'meeting') && localMonth(a.happened_at) === month).length,
    hotels_visited: [...firstVisit.values()].filter((ts) => localMonth(ts) === month).length,
    new_partners: partners.filter((p) => p.stage === 'accepted' && p.accepted_at && monthOf(p.accepted_at) === month).length,
    bookings: partnerSales.length,
    revenue_eur: partnerSales.reduce((sum, s) => sum + Number(s.amount_eur), 0),
  };
}

// ── Tasks & calendar ───────────────────────────────────────────
const isOpenStage = (p) => p.stage !== 'accepted' && p.stage !== 'declined';

// Monday → Sunday of the week containing `date`.
export const weekDays = (date) => Array.from({ length: 7 }, (_, i) => shiftDate(weekStart(date), i));

// 6 weeks × 7 days covering the month, starting on a Monday.
export const monthGrid = (month) => Array.from({ length: 42 }, (_, i) => shiftDate(weekStart(`${month}-01`), i));

// What is on one day. category: '' (all) | 'sales' | 'marketing'.
//   visits    planned hotel visits, sorted by area = walking route (sales)
//   todos     tasks due that day (one-day tasks and deadlines)
//   ongoing   multi-day tasks running that day (start_date ≤ day < deadline)
//   followUps partner follow-ups not already covered by a planned visit (sales)
//   posts     marketing posts planned / published that day
export function agenda(date, { tasks, partners, posts = [], events = [] }, category = '') {
  const byId = new Map(partners.map((p) => [p.id, p]));
  const inCat = (t) => !category || (t.category || 'sales') === category;
  const onDay = tasks.filter((t) => t.due_date === date && inCat(t));
  const visits = onDay
    .filter((t) => t.type === 'visit')
    .map((t) => ({ ...t, partner: byId.get(t.partner_id) }))
    .filter((t) => t.partner)
    .sort((a, b) => a.done - b.done || (a.partner.area ?? '~').localeCompare(b.partner.area ?? '~') || a.partner.name.localeCompare(b.partner.name));
  const todos = onDay
    .filter((t) => t.type !== 'visit')
    .map((t) => ({ ...t, partner: byId.get(t.partner_id) ?? null }))
    .sort((a, b) => a.done - b.done || (a.due_time ?? '99').localeCompare(b.due_time ?? '99'));
  const ongoing = tasks
    .filter((t) => !t.done && t.type !== 'visit' && t.start_date && t.start_date <= date && t.due_date > date && inCat(t))
    .map((t) => ({ ...t, partner: byId.get(t.partner_id) ?? null }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const planned = new Set(onDay.filter((t) => t.type === 'visit').map((t) => t.partner_id));
  // A follow-up already covered by a planned visit that day isn't listed twice.
  const followUps = category === 'marketing' ? [] : partners.filter((p) => p.next_follow_up === date && isOpenStage(p) && !planned.has(p.id));
  const dayPosts =
    category === 'sales' ? [] : posts.filter((p) => p.publish_date === date && p.status !== 'idea').sort((a, b) => (a.publish_time ?? '99').localeCompare(b.publish_time ?? '99'));
  // Content that has to be ready that day.
  const readyBy = category === 'sales' ? [] : posts.filter((p) => p.deadline === date && postDeadlineOpen(p));
  // Meetings and other events on that day (multi-day ones on every day they cover).
  const dayEvents = events
    .filter((e) => e.date <= date && (e.end_date || e.date) >= date && inCat(e))
    .map((e) => ({ ...e, partner: byId.get(e.partner_id) ?? null }))
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.title.localeCompare(b.title));
  return { events: dayEvents, visits, todos, ongoing, followUps, posts: dayPosts, readyBy };
}

// "09:30 – 10:30", "From 14:00", "All day", "17–19 Oct" (multi-day), for an event on `day`.
export function eventTimeText(e, day = e.date) {
  const multi = e.end_date && e.end_date > e.date;
  const span = multi ? `${Number(e.date.slice(8))}.${Number(e.date.slice(5, 7))} – ${Number(e.end_date.slice(8))}.${Number(e.end_date.slice(5, 7))}` : '';
  const time = !e.start_time ? 'All day' : e.end_time ? `${e.start_time} – ${e.end_time}` : `From ${e.start_time}`;
  if (!multi) return time;
  return day === e.date && e.start_time ? `${span} · starts ${e.start_time}` : span;
}

// .ics text for one event (Iceland is on UTC all year, so local time = UTC).
export function eventIcs(e, { now = new Date(), url = '' } = {}) {
  const d = (date) => date.replace(/-/g, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const clean = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
  let start;
  let end;
  if (e.start_time) {
    start = `DTSTART:${d(e.date)}T${e.start_time.replace(':', '')}00Z`;
    const endTime = e.end_time ?? `${String(Math.min(23, Number(e.start_time.slice(0, 2)) + 1)).padStart(2, '0')}${e.start_time.slice(3)}`;
    end = `DTEND:${d(e.end_date || e.date)}T${endTime.replace(':', '')}00Z`;
  } else {
    start = `DTSTART;VALUE=DATE:${d(e.date)}`;
    end = `DTEND;VALUE=DATE:${d(shiftDate(e.end_date || e.date, 1))}`;
  }
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Go CRM//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}@go-crm`,
    `DTSTAMP:${stamp}`,
    start,
    end,
    `SUMMARY:${clean(e.title)}`,
    e.location ? `LOCATION:${clean(e.location)}` : '',
    e.notes || url ? `DESCRIPTION:${clean([e.notes, url].filter(Boolean).join('\n\n'))}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

// Finished tasks grouped by the (local) day they were ticked off, newest first.
// Each item gets `doneDay` and `lateBy` (days after the deadline it was done; 0 = on time).
export function groupDone(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const doneDay = t.done_at ? today(new Date(t.done_at)) : t.due_date;
    const item = { ...t, doneDay, lateBy: Math.max(0, daysBetween(t.due_date, doneDay)) };
    if (!groups.has(doneDay)) groups.set(doneDay, []);
    groups.get(doneDay).push(item);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, items]) => ({ day, items }));
}

// Checklist progress inside a task.
export function subtaskProgress(task) {
  const list = task.subtasks ?? [];
  return { done: list.filter((s) => s.done).length, total: list.length };
}

// A post's "ready by" deadline counts while the content isn't ready yet (idea / in progress).
export const postDeadlineOpen = (p) => !!p.deadline && (p.status === 'idea' || p.status === 'in_progress');

// Upcoming and overdue marketing deadlines: posts' "ready by" + open marketing tasks, soonest first.
export function marketingDeadlines({ tasks, posts = [] }, from = today(), days = 30) {
  const until = shiftDate(from, days);
  const items = [
    ...posts.filter((p) => postDeadlineOpen(p) && p.deadline <= until).map((p) => ({ kind: 'post', id: p.id, title: p.title, date: p.deadline, ref: p })),
    ...tasks
      .filter((t) => !t.done && t.type !== 'visit' && (t.category || 'sales') === 'marketing' && t.due_date <= until)
      .map((t) => ({ kind: 'task', id: t.id, title: t.title, date: t.due_date, ref: t })),
  ];
  return items.map((x) => ({ ...x, daysLeft: daysBetween(from, x.date) })).sort((a, b) => a.date.localeCompare(b.date));
}

// Days left until a deadline (negative = late).
export const daysLeft = (deadline, from = today()) => daysBetween(from, deadline);

// Everything left undone before `date`.
export function overdue(date, { tasks, partners, posts = [] }, category = '') {
  const byId = new Map(partners.map((p) => [p.id, p]));
  const inCat = (t) => !category || (t.category || 'sales') === category;
  return {
    tasks: tasks
      .filter((t) => !t.done && t.due_date < date && inCat(t) && (t.type !== 'visit' || byId.has(t.partner_id)))
      .map((t) => ({ ...t, partner: byId.get(t.partner_id) ?? null }))
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    followUps:
      category === 'marketing'
        ? []
        : partners.filter((p) => p.next_follow_up && p.next_follow_up < date && isOpenStage(p)).sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up)),
    // Posts that should have gone out but aren't marked published.
    posts:
      category === 'sales'
        ? []
        : posts.filter(
            (p) =>
              (p.publish_date && p.publish_date < date && ['in_progress', 'scheduled'].includes(p.status)) ||
              (postDeadlineOpen(p) && p.deadline < date && !(p.publish_date && p.publish_date < date))
          ),
  };
}

// Calendar markers: Map(date → { visits, todos, followUps, posts, open }).
export function dayCounts(dates, data, category = '') {
  const out = new Map();
  for (const d of dates) {
    const a = agenda(d, data, category);
    const open = a.visits.filter((t) => !t.done).length + a.todos.filter((t) => !t.done).length + a.followUps.length + a.posts.filter((p) => p.status !== 'published').length + a.readyBy.length;
    out.set(d, { events: a.events.length, visits: a.visits.length, todos: a.todos.length, followUps: a.followUps.length, posts: a.posts.length + a.readyBy.length, open });
  }
  return out;
}

// Next open planned visit for a partner (YYYY-MM-DD) or null.
export function nextPlannedVisit(partnerId, tasks) {
  let best = null;
  for (const t of tasks) if (t.type === 'visit' && !t.done && t.partner_id === partnerId && (!best || t.due_date < best)) best = t.due_date;
  return best;
}

// Open items due today or earlier – for the nav badge.
export function dueCount(date, { tasks, partners }) {
  const ids = new Set(partners.map((p) => p.id));
  return (
    tasks.filter((t) => !t.done && t.due_date <= date && (t.type !== 'visit' || ids.has(t.partner_id))).length +
    partners.filter((p) => p.next_follow_up && p.next_follow_up <= date && isOpenStage(p)).length
  );
}

// ── Collaborators (influencers / content creators) ─────────────
export const COLLAB_STATUSES = [
  { value: 'request', label: 'Request', hint: 'They asked / we offered' },
  { value: 'agreed', label: 'Agreed', hint: 'Deal + booking done' },
  { value: 'delivered', label: 'Content delivered', hint: 'Got the content, refund to pay' },
  { value: 'done', label: 'Refunded & done', hint: 'Refund paid, all finished' },
  { value: 'declined', label: 'Declined', hint: 'Not doing it' },
];
export const collabStatusLabel = (s) => find(COLLAB_STATUSES, s)?.label ?? s;

// Where an agreed collaboration is right now, from its rental dates.
// → 'upcoming' | 'on_trip' | 'overdue' (trip over, no content yet) | the stored status otherwise.
export function collabPhase(c, t = today()) {
  if (c.status !== 'agreed') return c.status;
  if (c.content_delivered) return 'delivered';
  if (c.dropoff_date && c.dropoff_date < t) return 'overdue';
  if (c.pickup_date && c.pickup_date <= t) return 'on_trip';
  return 'upcoming';
}

export const COLLAB_PHASE_LABELS = {
  request: 'Request',
  upcoming: 'Upcoming trip',
  on_trip: 'On the trip',
  overdue: 'Content overdue',
  delivered: 'Content delivered',
  done: 'Refunded & done',
  declined: 'Declined',
};

// The spreadsheet's totals row, plus what still needs action.
export function collabTotals(list, t = today()) {
  const active = list.filter((c) => c.status !== 'declined');
  const sum = (k, l = active) => l.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  const price = sum('price_eur');
  const refund = sum('refund_eur');
  const toRefund = active.filter((c) => c.status === 'delivered');
  return {
    count: active.length,
    followers: sum('followers'),
    price,
    refund,
    net: price - refund,
    refundPaid: sum('refund_eur', active.filter((c) => c.status === 'done')),
    refundPending: sum('refund_eur', toRefund),
    toRefund: toRefund.length,
    overdue: active.filter((c) => collabPhase(c, t) === 'overdue').length,
    onTrip: active.filter((c) => collabPhase(c, t) === 'on_trip').length,
  };
}

// Social links / handles from free text → [{ platform, url, label }].
export function parseSocials(text) {
  if (!text) return [];
  return String(text)
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== ':' && !/^(instagram|tiktok|youtube|facebook):?$/i.test(s))
    .map((s) => {
      const handle = s.startsWith('@') ? s : null;
      const url = handle ? `https://www.instagram.com/${handle.slice(1)}` : /^https?:\/\//i.test(s) ? s : /\./.test(s) ? `https://${s}` : `https://www.instagram.com/${s}`;
      const host = (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, '');
        } catch {
          return '';
        }
      })();
      const platform = /instagram/.test(host) ? 'instagram' : /tiktok/.test(host) ? 'tiktok' : /youtu/.test(host) ? 'youtube' : /facebook/.test(host) ? 'facebook' : 'web';
      const path = (() => {
        try {
          return new URL(url).pathname.split('/').filter(Boolean)[0] ?? '';
        } catch {
          return '';
        }
      })();
      const label = platform === 'web' ? host : path ? `@${path.replace(/^@/, '')}` : host;
      return { platform, url, label };
    });
}

// ── Collaborators spreadsheet import ───────────────────────────
// Reads the "Social Media collaboration" sheets (one per brand & year, e.g. "Campers 26").

// CSV bytes → text. Excel / Numbers often save CSV as Windows-1252, which breaks Þ, ð, á…
export function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// "Campers 26" → { brand: 'camper', year: 2026 }; "Car Rental 25" → { brand: 'car', year: 2025 }.
export function sheetInfo(name) {
  const brand = /camp/i.test(name) ? 'camper' : /car|rental|bíl|bil/i.test(name) ? 'car' : null;
  const y = String(name).match(/(?:^|\D)(20\d{2}|\d{2})(?!\d)/g);
  const last = y ? y.at(-1).replace(/\D/g, '') : null;
  const year = last ? (last.length === 2 ? 2000 + Number(last) : Number(last)) : null;
  return { brand, year };
}

// Excel booleans in English, Czech (PRAVDA/NEPRAVDA) or Icelandic (SATT/ÓSATT).
export function sheetBool(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return ['true', 'pravda', 'satt', 'yes', 'já', 'ja', 'x', '✓', '1'].includes(s);
}

// "€ 1,650.00" / "792" / "€ -" → number or null.
export function sheetMoney(v) {
  if (typeof v === 'number') return v;
  // Keep only digits, separators and the minus sign (drops €, ISK, spaces, mis-decoded symbols).
  const s = String(v ?? '').replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '');
  if (!s || s === '-') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const MONTH_PREFIXES = [
  ['ja', 1], ['f', 2], ['mar', 3], ['ap', 4], ['mai', 5], ['may', 5], ['jun', 6], ['jul', 7],
  ['ag', 8], ['au', 8], ['se', 9], ['ok', 10], ['oc', 10], ['no', 11], ['de', 12],
];
function monthOfName(word) {
  const w = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return MONTH_PREFIXES.find(([p]) => w.startsWith(p))?.[1] ?? null;
}

// "26 júní - 4 júlí", "20 sept - 30 Sept", "2 Jan - 10 Jan", "28.7 - 5.8" → { pickup, dropoff } (YYYY-MM-DD).
// A drop-off month before the pick-up month rolls into the next year (Dec → Jan).
export function sheetDateRange(text, year) {
  const parts = [...String(text ?? '').matchAll(/(\d{1,2})\s*(?:\.\s*(\d{1,2})\.?|\.?\s*([A-Za-zÀ-ÿ]+))/g)];
  if (!parts.length || !year) return { pickup: null, dropoff: null };
  const toDate = (m, y) => {
    const d = Number(m[1]);
    const mon = m[2] ? Number(m[2]) : monthOfName(m[3]);
    if (!mon || d < 1 || d > 31) return null;
    return `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  const pickup = toDate(parts[0], year);
  let dropoff = parts[1] ? toDate(parts[1], year) : null;
  if (pickup && dropoff && dropoff < pickup) dropoff = toDate(parts[1], year + 1);
  return { pickup, dropoff };
}

const COLLAB_COLUMNS = [
  ['name', /^(nafn|name)$/],
  ['socials', /social/],
  ['email', /mail/],
  ['followers', /follower/],
  ['content', /hvernig|content|efni\s*\?/],
  ['vehicle', /ltegund|vehicle|car type|bíll|bill/],
  ['dates', /pick|drop|dates?$/],
  ['handled_by', /umbo|handled|agent/],
  ['moodboard', /mood/],
  ['booking_ref', /booking/],
  ['comment', /comment|athugasemd/],
  ['price_eur', /^ver.?$|price/],
  ['refund_eur', /^refund$/],
  ['content_delivered', /skila|delivered/],
  ['in_onedrive', /onedrive/],
];

// rows: objects keyed by the sheet's header row. Returns { items, skipped }.
export function parseCollabSheet(rows, { brand, year }) {
  const items = [];
  let skipped = 0;
  const join = (v, sep) => String(v ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(sep);
  // Which column is which, from the header row. Some sheets lost the "Nafn" header (it reads
  // "2" or is empty) – then the first column holds the names.
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const colOf = new Map();
  for (const header of headers) {
    const col = COLLAB_COLUMNS.find(([, re]) => re.test(header.trim().toLowerCase()))?.[0];
    if (col && ![...colOf.values()].includes(col)) colOf.set(header, col);
  }
  if (headers.length && ![...colOf.values()].includes('name') && !colOf.has(headers[0])) colOf.set(headers[0], 'name');
  for (const row of rows) {
    const get = {};
    for (const [header, col] of colOf) get[col] = row[header];
    const name = join(get.name, ' & ');
    if (!name) {
      skipped++;
      continue; // empty and totals rows
    }
    const { pickup, dropoff } = sheetDateRange(get.dates, year);
    const delivered = sheetBool(get.content_delivered);
    const followers = sheetMoney(get.followers);
    items.push({
      name,
      email: join(get.email, ', ') || null,
      socials: join(get.socials, '\n') || null,
      followers: followers === null ? null : Math.round(followers),
      content: String(get.content ?? '').trim() || null,
      brand,
      vehicle: join(get.vehicle, ' + ') || null,
      pickup_date: pickup,
      dropoff_date: dropoff,
      handled_by: join(get.handled_by, ' / ') || null,
      booking_ref: join(get.booking_ref, ', ') || null,
      comment: String(get.comment ?? '').trim() || null,
      price_eur: sheetMoney(get.price_eur),
      refund_eur: sheetMoney(get.refund_eur),
      moodboard: sheetBool(get.moodboard),
      content_delivered: delivered,
      in_onedrive: sheetBool(get.in_onedrive),
      // "Efni skilað & endurgreitt" = content delivered AND refunded → done.
      status: delivered ? 'done' : 'agreed',
      import_key: [year, brand, name.toLowerCase(), join(get.booking_ref, ',').toLowerCase(), pickup ?? ''].join('|'),
    });
  }
  return { items, skipped };
}

// ── Social followers (typed in by hand) ─────────────────────────
export const SOCIAL_CHANNELS = ['instagram', 'facebook', 'tiktok'];
export const SOCIAL_BRANDS = ['car', 'camper'];

// Per channel: followers now (latest count of each brand's account added up), growth over the
// last 7 / 30 days and since the first entry, and the totals over time for a sparkline.
// Growth only compares accounts that already had a count back then, so adding the Campers
// account later doesn't look like a jump in followers.
export function socialSummary(rows = [], t = today()) {
  return SOCIAL_CHANNELS.map((channel) => {
    const history = Object.fromEntries(
      SOCIAL_BRANDS.map((b) => [b, rows.filter((r) => r.account === `${channel}:${b}` && r.date <= t).sort((x, y) => x.date.localeCompare(y.date))])
    );
    const on = (b, date) => history[b].filter((r) => r.date <= date).at(-1) ?? null;
    const latest = Object.fromEntries(SOCIAL_BRANDS.map((b) => [b, history[b].at(-1) ?? null]));
    const brands = SOCIAL_BRANDS.filter((b) => latest[b]);
    const total = brands.length ? brands.reduce((s, b) => s + latest[b].followers, 0) : null;
    const growth = (base) => {
      const with_ = brands.filter((b) => base(b));
      return with_.length ? with_.reduce((s, b) => s + latest[b].followers - base(b).followers, 0) : null;
    };
    const dates = [...new Set(brands.flatMap((b) => history[b].map((r) => r.date)))].sort();
    return {
      channel,
      total,
      byBrand: Object.fromEntries(SOCIAL_BRANDS.map((b) => [b, latest[b]?.followers ?? null])),
      updated: dates.at(-1) ?? null,
      first: dates[0] ?? null,
      change7: growth((b) => on(b, shiftDate(t, -7))),
      change30: growth((b) => on(b, shiftDate(t, -30))),
      sinceFirst: dates.length > 1 ? growth((b) => history[b][0]) : null,
      series: dates.map((d) => ({ date: d, total: brands.reduce((s, b) => s + (on(b, d)?.followers ?? 0), 0) })),
    };
  });
}

// 12345 → "12.3k", 1520000 → "1.52M"
export function compactNumber(n) {
  if (n === null || n === undefined) return '–';
  const a = Math.abs(n);
  if (a >= 1e6) return `${+(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${+(n / 1e3).toFixed(1)}k`;
  return new Intl.NumberFormat('en-GB').format(n);
}

// ── Weekly marketing report ─────────────────────────────────────
// Monday of the week a date falls in.
export function mondayOf(date) {
  const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDate(date, -wd);
}

// ISO week number (weeks start on Monday, week 1 holds the first Thursday).
export function isoWeek(date) {
  const thursday = shiftDate(mondayOf(date), 3);
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(jan1, thursday) / 7) + 1;
}

// The day a post actually went live (published_at), else its planned date.
const wentLive = (p) => (p.published_at ? today(new Date(p.published_at)) : p.publish_date);
const inRange = (d, from, to) => !!d && d >= from && d <= to;

// Which week the report opens on: early in the week (Mon–Tue) the meeting is about last week.
export const defaultReportWeek = (t = today()) => {
  const wd = (new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7;
  return wd <= 1 ? shiftDate(mondayOf(t), -7) : mondayOf(t);
};

// Everything for one week's marketing meeting (shown to the owners), from data the CRM already has.
// `reviews` is the /api/reviews payload (or null while it loads / without access).
export function weeklyReport({ posts = [], tasks = [], collaborators = [], social = [], partners = [] }, reviews, weekStart, t = today()) {
  const start = mondayOf(weekStart);
  const end = shiftDate(start, 6);
  const prevStart = shiftDate(start, -7);
  const prevEnd = shiftDate(start, -1);
  const nextStart = shiftDate(start, 7);
  const nextEnd = shiftDate(start, 13);
  const until = end < t ? end : t; // the current week only counts up to today
  const isTodo = (x) => x.type !== 'visit';

  // Followers: state at the end of the week, growth against the end of the week before.
  const nowS = socialSummary(social, until);
  const prevS = socialSummary(social, prevEnd);
  const followers = nowS.map((s, i) => ({
    channel: s.channel,
    total: s.total,
    byBrand: s.byBrand,
    week: s.change7,
    prevWeek: prevS[i].change7,
    change30: s.change30,
    series: s.series,
  }));
  const sum = (list, k) => (list.some((x) => x[k] !== null) ? list.reduce((a, x) => a + (x[k] ?? 0), 0) : null);
  const followersTotal = { total: sum(followers, 'total'), week: sum(followers, 'week'), prevWeek: sum(followers, 'prevWeek') };

  // Content
  const published = posts.filter((p) => p.status === 'published' && inRange(wentLive(p), start, end)).sort((a, b) => wentLive(a).localeCompare(wentLive(b)));
  const prevPublished = posts.filter((p) => p.status === 'published' && inRange(wentLive(p), prevStart, prevEnd)).length;
  const count = (list, key) => list.reduce((m, p) => ((m[key(p)] = (m[key(p)] ?? 0) + 1), m), {});
  const byChannel = {};
  for (const p of published) for (const c of p.channels ?? []) byChannel[c] = (byChannel[c] ?? 0) + 1;
  const nextPosts = posts
    .filter((p) => p.status !== 'idea' && p.status !== 'published' && inRange(p.publish_date, nextStart, nextEnd))
    .sort((a, b) => (a.publish_date + (a.publish_time ?? '')).localeCompare(b.publish_date + (b.publish_time ?? '')));

  // Tasks: every to-do the reader can see (marketing, plus sales ones for people with Sales access),
  // counted in the week it was ticked off.
  const doneOn = (x) => (x.done_at ? today(new Date(x.done_at)) : x.due_date);
  const doneTasks = tasks.filter((x) => isTodo(x) && x.done && inRange(doneOn(x), start, end)).sort((a, b) => doneOn(a).localeCompare(doneOn(b)));
  const prevDone = tasks.filter((x) => isTodo(x) && x.done && inRange(doneOn(x), prevStart, prevEnd)).length;
  const nextTasks = tasks.filter((x) => isTodo(x) && !x.done && inRange(x.due_date, nextStart, nextEnd)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  // Everything finished in the week, in one list: posts that went live, to-dos and hotel visits.
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const visits = tasks.filter((x) => x.type === 'visit' && x.done && partnerName.has(x.partner_id) && inRange(doneOn(x), start, end));
  const done = [
    ...published.map((p) => ({ kind: 'post', date: wentLive(p), title: p.title, ref: p })),
    ...doneTasks.map((x) => ({ kind: 'task', date: doneOn(x), title: x.title, ref: x })),
    ...visits.map((x) => ({ kind: 'visit', date: doneOn(x), title: partnerName.get(x.partner_id), ref: x })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  const nextDeadlines = posts.filter((p) => postDeadlineOpen(p) && inRange(p.deadline, nextStart, nextEnd)).sort((a, b) => a.deadline.localeCompare(b.deadline));

  // Google reviews: Business Profile reviews when connected (complete), else what Places returns.
  let google = null;
  if (reviews) {
    const all = reviews.reviews ?? [];
    const pool = all.some((r) => r.source === 'gbp') ? all.filter((r) => r.source === 'gbp') : all;
    const day = (r) => (r.published_at ?? '').slice(0, 10);
    const newReviews = pool.filter((r) => inRange(day(r), start, end)).sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
    const prevCount = pool.filter((r) => inRange(day(r), prevStart, prevEnd)).length;
    const loc = (reviews.google?.locations ?? []).filter((l) => l.active && l.total != null).sort((a, b) => b.total - a.total)[0];
    const place = (reviews.places ?? []).filter((p) => p.rating_count != null).sort((a, b) => b.rating_count - a.rating_count)[0];
    const snaps = place ? (reviews.snapshots ?? []).filter((s) => s.place_id === place.place_id) : [];
    const snapAt = (d) => snaps.filter((s) => s.day <= d).at(-1) ?? null;
    const a = snapAt(until);
    const b = snapAt(prevEnd);
    google = {
      rating: loc ? Number(loc.average) : place?.rating ?? null,
      total: loc ? loc.total : place?.rating_count ?? null,
      name: loc?.title ?? place?.name ?? null,
      countChange: a && b ? a.rating_count - b.rating_count : null,
      newReviews,
      prevCount,
      newAverage: newReviews.length ? newReviews.reduce((s, r) => s + (r.rating || 0), 0) / newReviews.length : null,
      complete: pool.some((r) => r.source === 'gbp'),
    };
  }

  // Collaborators
  const active = collaborators.filter((c) => c.status !== 'declined');
  const year = start.slice(0, 4);
  const collabs = {
    tripsThisWeek: active.filter((c) => inRange(c.pickup_date, start, end)),
    onTrip: active.filter((c) => collabPhase(c, t) === 'on_trip'),
    tripsNextWeek: active.filter((c) => inRange(c.pickup_date, nextStart, nextEnd)),
    thisYear: active.filter((c) => c.status !== 'request' && (c.pickup_date ?? '').startsWith(year)).length,
  };

  return {
    week: { start, end, number: isoWeek(start), prevStart, nextStart, nextEnd, current: inRange(t, start, end), future: start > t },
    followers,
    followersTotal,
    content: { published, prevPublished, byChannel, byBrand: count(published, (p) => p.brand || 'both'), nextPosts, nextDeadlines },
    tasks: { done: doneTasks, prevDone, next: nextTasks },
    done,
    visits: visits.length,
    google,
    collabs,
  };
}
