import { shiftDate } from "./fx";
import type { Partner, Sale } from "./types";

export type Currency = "EUR" | "ISK";
export type Granularity = "day" | "week" | "month";

export const saleValue = (s: Pick<Sale, "amount_eur" | "amount_isk">, cur: Currency) =>
  Number(cur === "EUR" ? s.amount_eur : s.amount_isk);

export const activeSales = <T extends Pick<Sale, "is_cancelled">>(sales: T[]) => sales.filter((s) => !s.is_cancelled);

// Monday of the ISO week
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return shiftDate(date, -dow);
}

export function bucketKey(date: string, g: Granularity): string {
  if (g === "day") return date;
  if (g === "week") return weekStart(date);
  return date.slice(0, 7);
}

export function bucketKeys(start: string, end: string, g: Granularity): string[] {
  const keys: string[] = [];
  let cur = bucketKey(start, g);
  const last = bucketKey(end, g);
  while (cur <= last) {
    keys.push(cur);
    if (g === "day") cur = shiftDate(cur, 1);
    else if (g === "week") cur = shiftDate(cur, 7);
    else {
      const [y, m] = cur.split("-").map(Number);
      cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }
  }
  return keys;
}

export interface SeriesPoint {
  key: string;
  car: number;
  camper: number;
  bookings: number;
}

export function revenueSeries(
  sales: Sale[],
  start: string,
  end: string,
  g: Granularity,
  cur: Currency,
): SeriesPoint[] {
  const points = new Map(bucketKeys(start, end, g).map((k) => [k, { key: k, car: 0, camper: 0, bookings: 0 }]));
  for (const s of activeSales(sales)) {
    if (s.booking_date < start || s.booking_date > end) continue;
    const p = points.get(bucketKey(s.booking_date, g));
    if (!p) continue;
    // Bookings without a brand count as cars – Go Car Rentals is the larger business.
    if (s.brand === "camper") p.camper += saleValue(s, cur);
    else p.car += saleValue(s, cur);
    p.bookings += 1;
  }
  return Array.from(points.values());
}

export interface Totals {
  revenue: number;
  bookings: number;
  avgBooking: number;
  avgDays: number | null;
  cancelled: number;
}

export function totals(sales: Sale[], cur: Currency): Totals {
  const active = activeSales(sales);
  const revenue = active.reduce((sum, s) => sum + saleValue(s, cur), 0);
  const withDays = active.filter((s) => s.rental_days);
  return {
    revenue,
    bookings: active.length,
    avgBooking: active.length ? revenue / active.length : 0,
    avgDays: withDays.length ? withDays.reduce((sum, s) => sum + (s.rental_days ?? 0), 0) / withDays.length : null,
    cancelled: sales.length - active.length,
  };
}

export const codeKey = (code: string | null | undefined) => (code ?? "").trim().toLowerCase();

export function partnerByCode(partners: Partner[]): Map<string, Partner> {
  const map = new Map<string, Partner>();
  for (const p of partners) if (p.affiliate_code?.trim()) map.set(codeKey(p.affiliate_code), p);
  return map;
}

export const isPartnerSale = (s: Sale, byCode: Map<string, Partner>) => byCode.has(codeKey(s.affiliate_code));

export interface PartnerRow {
  partner: Partner | null;
  code: string;
  bookings: number;
  revenue: number;
}

// Revenue grouped by affiliate code. Codes not belonging to any CRM partner are
// listed separately so nothing gets silently lost; bookings without a code are "Direct".
export function revenueByPartner(sales: Sale[], partners: Partner[], cur: Currency): PartnerRow[] {
  const byCode = partnerByCode(partners);
  const rows = new Map<string, PartnerRow>();
  for (const s of activeSales(sales)) {
    const key = codeKey(s.affiliate_code);
    const row = rows.get(key) ?? { partner: byCode.get(key) ?? null, code: s.affiliate_code?.trim() ?? "", bookings: 0, revenue: 0 };
    row.bookings += 1;
    row.revenue += saleValue(s, cur);
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue);
}
