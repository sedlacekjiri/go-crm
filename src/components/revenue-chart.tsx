"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { Currency, Granularity, SeriesPoint } from "@/lib/analytics";
import { bucketLabel, money, num } from "@/lib/format";
import { cx } from "./ui";

const SERIES = [
  { key: "car", label: "Go Car Rentals", color: "var(--series-1)" },
  { key: "camper", label: "Go Campers", color: "var(--series-2)" },
] as const;

function ChartTooltip({ active, payload, currency, granularity }: TooltipContentProps<ValueType, NameType> & { currency: Currency; granularity: Granularity }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as SeriesPoint;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{granularity === "week" ? `Week of ${bucketLabel(p.key, "day")}` : bucketLabel(p.key, granularity)}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2 text-ink-2">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
          <span className="flex-1">{s.label}</span>
          <span className="tabular font-medium text-ink">{money(p[s.key], currency)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-line pt-1 text-ink-2">
        <span>
          Total · {p.bookings} booking{p.bookings === 1 ? "" : "s"}
        </span>
        <span className="tabular font-medium text-ink">{money(p.car + p.camper, currency)}</span>
      </div>
    </div>
  );
}

export function RevenueChart({ data, currency, granularity, height = 260 }: { data: SeriesPoint[]; currency: Currency; granularity: Granularity; height?: number }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const sums = { car: data.reduce((s, d) => s + d.car, 0), camper: data.reduce((s, d) => s + d.camper, 0) };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-ink-2">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
              <span className="tabular font-medium text-ink">{money(sums[s.key], currency)}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setView(view === "chart" ? "table" : "chart")} className="text-xs font-medium text-ink-2 hover:text-ink">
          {view === "chart" ? "Show table" : "Show chart"}
        </button>
      </div>
      {view === "chart" ? (
        <div style={{ height }} className="-ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis
                dataKey="key"
                tickFormatter={(k: string) => bucketLabel(k, granularity === "week" ? "day" : granularity)}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--axis)" }}
                minTickGap={16}
              />
              <YAxis
                tickFormatter={(v: number) => (currency === "EUR" ? `€${num(v / 1000, 1)}k` : `${num(v / 1_000_000, 1)}M`)}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip content={(props) => <ChartTooltip {...props} currency={currency} granularity={granularity} />} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="car" stackId="r" fill={SERIES[0].color} stroke="var(--surface)" strokeWidth={1} maxBarSize={36} isAnimationActive={false} />
              <Bar dataKey="camper" stackId="r" fill={SERIES[1].color} stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="tabular w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Period</th>
                <th className="py-1.5 text-right font-medium">Bookings</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-1.5 text-right font-medium">
                    {s.label}
                  </th>
                ))}
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((d) => (
                <tr key={d.key} className={cx("text-ink", !d.bookings && "text-muted")}>
                  <td className="py-1.5">{bucketLabel(d.key, granularity === "week" ? "day" : granularity)}</td>
                  <td className="py-1.5 text-right">{d.bookings}</td>
                  <td className="py-1.5 text-right">{money(d.car, currency)}</td>
                  <td className="py-1.5 text-right">{money(d.camper, currency)}</td>
                  <td className="py-1.5 text-right font-medium">{money(d.car + d.camper, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
