import type { Currency } from "./analytics";

export function money(value: number, cur: Currency, compact = false): string {
  if (cur === "ISK") {
    return `${new Intl.NumberFormat("en-GB", {
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard",
    }).format(value)} kr`;
  }
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: compact || Math.abs(value) >= 1000 ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export const num = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);

export function shortDate(date: string | null | undefined): string {
  if (!date) return "–";
  return new Date(date.length === 10 ? `${date}T00:00:00` : date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function fullDate(date: string | null | undefined): string {
  if (!date) return "–";
  return new Date(date.length === 10 ? `${date}T00:00:00` : date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function dateTime(date: string): string {
  return new Date(date).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Local calendar date, YYYY-MM-DD (not UTC – Iceland is UTC anyway, but the laptop may not be).
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function bucketLabel(key: string, g: "day" | "week" | "month"): string {
  if (g === "month") {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }
  return shortDate(key);
}

export function relativeDays(date: string): string {
  const diff = Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${today()}T00:00:00`)) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff < 0 ? `${-diff} days overdue` : `in ${diff} days`;
}
