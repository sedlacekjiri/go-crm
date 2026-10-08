// Pure logic (no DOM, no network): constants, Caren import parsing, exchange rates,
// sales analytics and goals. Covered by tests/lib.test.mjs.

// ── Constants ──────────────────────────────────────────────────
export const PARTNER_TYPES = [
  { value: 'hotel', label: 'Hotels', singular: 'Hotel' },
  { value: 'guesthouse', label: 'Guesthouses', singular: 'Guesthouse' },
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
export const typeLabel = (t) => find(PARTNER_TYPES, t)?.singular ?? t;
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
export function agenda(date, { tasks, partners, posts = [] }, category = '') {
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
  return { visits, todos, ongoing, followUps, posts: dayPosts, readyBy };
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
    out.set(d, { visits: a.visits.length, todos: a.todos.length, followUps: a.followUps.length, posts: a.posts.length + a.readyBy.length, open });
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
