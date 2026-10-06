import { activeSales, isPartnerSale, partnerByCode } from "./analytics";
import { today } from "./format";
import type { Activity, GoalMetric, Partner, Sale } from "./types";

export const monthOf = (date: string) => date.slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string): { from: string; to: string } {
  const next = shiftMonth(month, 1);
  const last = new Date(Date.parse(`${next}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: last };
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Share of the month already gone – used for the "expected by today" pace marker.
export function monthElapsed(month: string): number {
  const t = today();
  const { from, to } = monthRange(month);
  if (t < from) return 0;
  if (t > to) return 1;
  return Number(t.slice(8, 10)) / Number(to.slice(8, 10));
}

// Activities' happened_at is a timestamp – compare it in local time.
const localMonth = (ts: string) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function actuals(
  month: string,
  data: { activities: Pick<Activity, "type" | "happened_at">[]; partners: Partner[]; sales: Sale[] },
): Record<GoalMetric, number> {
  const byCode = partnerByCode(data.partners);
  const partnerSales = activeSales(data.sales).filter((s) => monthOf(s.booking_date) === month && isPartnerSale(s, byCode));
  return {
    visits: data.activities.filter((a) => (a.type === "visit" || a.type === "meeting") && localMonth(a.happened_at) === month).length,
    new_partners: data.partners.filter((p) => p.stage === "accepted" && p.accepted_at && monthOf(p.accepted_at) === month).length,
    bookings: partnerSales.length,
    revenue_eur: partnerSales.reduce((sum, s) => sum + Number(s.amount_eur), 0),
  };
}
