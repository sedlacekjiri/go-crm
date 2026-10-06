// Turns rows of a Caren booking export (CSV / Excel) into sales rows.
// The exact export layout is configurable: every CRM field is mapped to a column
// by the user, with a best guess based on the header names.

import type { Brand } from "./types";

export const IMPORT_FIELDS = [
  { key: "booking_ref", label: "Booking number", required: true, guess: [/booking.?(no|nr|number|id|ref)/, /^(booking|reservation|ref|reference|id|number|nr)$/, /reservation.?(no|nr|number|id)/] },
  { key: "booking_date", label: "Booking created (date)", required: true, guess: [/(created|booked|booking.?date|order.?date|date.?created)/, /^date$/] },
  { key: "amount", label: "Total price", required: true, guess: [/^(total|amount|price|total.?price|grand.?total|revenue)/, /(total|amount|price)/] },
  { key: "currency", label: "Currency", required: false, guess: [/^(currency|curr|ccy)$/, /currency/] },
  { key: "pickup_date", label: "Pickup date", required: false, guess: [/(pick.?up|start|from|delivery)/] },
  { key: "return_date", label: "Return date", required: false, guess: [/(return|drop.?off|end|to.?date)/] },
  { key: "rental_days", label: "Rental days", required: false, guess: [/(days|duration|length)/] },
  { key: "brand", label: "Brand / company", required: false, guess: [/(brand|company|branch)/] },
  { key: "vehicle", label: "Vehicle / category", required: false, guess: [/(vehicle|car|category|group|model|class)/] },
  { key: "affiliate_code", label: "Affiliate / source", required: false, guess: [/(affiliate|referr|promo|coupon|partner|agent|source|channel|campaign)/] },
  { key: "status", label: "Status", required: false, guess: [/status|state/] },
  { key: "customer_country", label: "Customer country", required: false, guess: [/(country|nationality)/] },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export type Mapping = Partial<Record<ImportField, string>>;
export type DateFormat = "auto" | "dmy" | "mdy" | "ymd";
export type BrandMode = "column" | Brand;

export interface ImportOptions {
  dateFormat: DateFormat;
  defaultCurrency: string;
  brandMode: BrandMode;
}

export interface ParsedSale {
  booking_ref: string;
  booking_date: string;
  pickup_date: string | null;
  return_date: string | null;
  brand: Brand | null;
  vehicle: string | null;
  rental_days: number | null;
  amount: number;
  currency: string;
  affiliate_code: string | null;
  status: string | null;
  is_cancelled: boolean;
  customer_country: string | null;
  raw: Record<string, string>;
}

const normalize = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").trim();

export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
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
export function parseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/[\s ]/g, "").replace(/[^0-9,.\-]/g, "");
  if (!s || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    s = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const isThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].replace("-", "").length > 0);
    s = isThousands ? parts.join("") : parts.join(".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const validDate = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

// Returns YYYY-MM-DD or null.
export function parseDate(input: unknown, format: DateFormat = "auto"): string | null {
  if (input === null || input === undefined || input === "") return null;
  // Excel cells come in as local-midnight Dates – read local parts, not UTC, so they don't shift a day.
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : validDate(input.getFullYear(), input.getMonth() + 1, input.getDate());
  }
  if (typeof input === "number") {
    // Excel serial date
    if (input > 20000 && input < 80000) return new Date(Math.round((input - 25569) * 86400000)).toISOString().slice(0, 10);
    return null;
  }
  const s = String(input).trim();
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso && format !== "dmy" && format !== "mdy") return validDate(+iso[1], +iso[2], +iso[3]);
  const parts = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (parts) {
    const a = +parts[1], b = +parts[2], y = +parts[3];
    if (format === "mdy") return validDate(y, a, b);
    if (format === "dmy") return validDate(y, b, a);
    // auto: European day-first unless that is impossible
    return validDate(y, b, a) ?? validDate(y, a, b);
  }
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);
  return null;
}

export function detectBrand(value: string | null | undefined): Brand | null {
  if (!value) return null;
  return /camp/i.test(value) ? "camper" : "car";
}

const CANCELLED = /cancel|annul|storn|void|deleted|refund/i;

export function buildSales(
  rows: Record<string, unknown>[],
  mapping: Mapping,
  options: ImportOptions,
): { sales: ParsedSale[]; errors: { row: number; message: string }[] } {
  const sales: ParsedSale[] = [];
  const errors: { row: number; message: string }[] = [];
  const seen = new Map<string, number>();
  const get = (row: Record<string, unknown>, key: ImportField) => {
    const col = mapping[key];
    if (!col) return undefined;
    const v = row[col];
    return v === null || v === undefined ? undefined : v;
  };
  const text = (row: Record<string, unknown>, key: ImportField) => {
    const v = get(row, key);
    const s = v === undefined ? "" : String(v).trim();
    return s || null;
  };

  rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    if (Object.values(row).every((v) => v === null || v === undefined || String(v).trim() === "")) return;

    const ref = text(row, "booking_ref");
    if (!ref) return void errors.push({ row: line, message: "Missing booking number" });
    const bookingDate = parseDate(get(row, "booking_date"), options.dateFormat);
    if (!bookingDate) return void errors.push({ row: line, message: `Invalid booking date "${get(row, "booking_date") ?? ""}"` });
    const amount = parseNumber(get(row, "amount"));
    if (amount === null) return void errors.push({ row: line, message: `Invalid price "${get(row, "amount") ?? ""}"` });

    const pickup = parseDate(get(row, "pickup_date"), options.dateFormat);
    const ret = parseDate(get(row, "return_date"), options.dateFormat);
    let days = parseNumber(get(row, "rental_days"));
    if (days === null && pickup && ret) {
      days = Math.max(1, Math.round((Date.parse(ret) - Date.parse(pickup)) / 86400000));
    }

    const currencyRaw = text(row, "currency");
    const currency = (currencyRaw?.match(/[A-Za-z]{3}/)?.[0] ?? (currencyRaw === "€" ? "EUR" : options.defaultCurrency)).toUpperCase();
    const status = text(row, "status");
    const vehicle = text(row, "vehicle");
    const brand =
      options.brandMode === "column" ? detectBrand(text(row, "brand") ?? vehicle) : options.brandMode;

    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined && v !== "") raw[k] = String(v);

    const sale: ParsedSale = {
      booking_ref: ref,
      booking_date: bookingDate,
      pickup_date: pickup,
      return_date: ret,
      brand,
      vehicle,
      rental_days: days === null ? null : Math.round(days),
      amount,
      currency,
      affiliate_code: text(row, "affiliate_code"),
      status,
      is_cancelled: status ? CANCELLED.test(status) : false,
      customer_country: text(row, "customer_country"),
      raw,
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
