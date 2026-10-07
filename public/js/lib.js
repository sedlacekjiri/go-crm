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

export const GOAL_METRICS = [
  { value: 'visits', label: 'Visits & meetings', unit: '' },
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

export function partnerByCode(partners) {
  const map = new Map();
  for (const p of partners) if (p.affiliate_code && p.affiliate_code.trim()) map.set(codeKey(p.affiliate_code), p);
  return map;
}

export const isPartnerSale = (s, byCode) => byCode.has(codeKey(s.affiliate_code));

// Revenue grouped by affiliate code. Codes that don't belong to a CRM partner are listed
// separately so nothing is silently lost; bookings without a code are "Direct".
export function revenueByPartner(sales, partners, cur) {
  const byCode = partnerByCode(partners);
  const rows = new Map();
  for (const s of activeSales(sales)) {
    const key = codeKey(s.affiliate_code);
    const row = rows.get(key) ?? { partner: byCode.get(key) ?? null, code: (s.affiliate_code ?? '').trim(), bookings: 0, revenue: 0 };
    row.bookings += 1;
    row.revenue += saleValue(s, cur);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
}

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

export function actuals(month, { activities, partners, sales }) {
  const byCode = partnerByCode(partners);
  const partnerSales = activeSales(sales).filter((s) => monthOf(s.booking_date) === month && isPartnerSale(s, byCode));
  return {
    visits: activities.filter((a) => (a.type === 'visit' || a.type === 'meeting') && localMonth(a.happened_at) === month).length,
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

// What is on one day: planned visits (sorted by area = walking route), to-dos and partner follow-ups.
export function agenda(date, { tasks, partners }) {
  const byId = new Map(partners.map((p) => [p.id, p]));
  const onDay = tasks.filter((t) => t.due_date === date);
  const visits = onDay
    .filter((t) => t.type === 'visit')
    .map((t) => ({ ...t, partner: byId.get(t.partner_id) }))
    .filter((t) => t.partner)
    .sort((a, b) => a.done - b.done || (a.partner.area ?? '~').localeCompare(b.partner.area ?? '~') || a.partner.name.localeCompare(b.partner.name));
  const todos = onDay
    .filter((t) => t.type !== 'visit')
    .map((t) => ({ ...t, partner: byId.get(t.partner_id) ?? null }))
    .sort((a, b) => a.done - b.done || (a.due_time ?? '99').localeCompare(b.due_time ?? '99'));
  const planned = new Set(onDay.filter((t) => t.type === 'visit').map((t) => t.partner_id));
  // A follow-up already covered by a planned visit that day isn't listed twice.
  const followUps = partners.filter((p) => p.next_follow_up === date && isOpenStage(p) && !planned.has(p.id));
  return { visits, todos, followUps };
}

// Everything left undone before `date`.
export function overdue(date, { tasks, partners }) {
  const byId = new Map(partners.map((p) => [p.id, p]));
  return {
    tasks: tasks
      .filter((t) => !t.done && t.due_date < date && (t.type !== 'visit' || byId.has(t.partner_id)))
      .map((t) => ({ ...t, partner: byId.get(t.partner_id) ?? null }))
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    followUps: partners.filter((p) => p.next_follow_up && p.next_follow_up < date && isOpenStage(p)).sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up)),
  };
}

// Calendar markers: Map(date → { visits, todos, followUps, open }).
export function dayCounts(dates, data) {
  const out = new Map();
  for (const d of dates) {
    const a = agenda(d, data);
    const open = a.visits.filter((t) => !t.done).length + a.todos.filter((t) => !t.done).length + a.followUps.length;
    out.set(d, { visits: a.visits.length, todos: a.todos.length, followUps: a.followUps.length, open });
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
