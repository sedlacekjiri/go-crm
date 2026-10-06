"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Converter } from "@/components/converter";
import { DateRange, presetRange, type Preset } from "@/components/date-range";
import { useAuth, useCurrency } from "@/components/providers";
import { RevenueChart } from "@/components/revenue-chart";
import { Card, Empty, ErrorBox, LinkButton, Loading, PageHeader, Segmented, Select, StatTile } from "@/components/ui";
import { isPartnerSale, partnerByCode, revenueByPartner, revenueSeries, saleValue, totals, type Granularity } from "@/lib/analytics";
import { api, useData } from "@/lib/data";
import { money, num, shortDate } from "@/lib/format";
import { brandLabel } from "@/lib/types";

const defaultGranularity = (from: string, to: string): Granularity => {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  return days <= 45 ? "day" : days <= 200 ? "week" : "month";
};

export default function SalesPage() {
  const { isAdmin } = useAuth();
  const { currency } = useCurrency();
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState(() => presetRange("30d"));
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [brand, setBrand] = useState("");
  const [source, setSource] = useState<"all" | "partners" | "other">("all");
  const [showAll, setShowAll] = useState(false);

  const { data, error, loading } = useData(async () => {
    const [sales, partners] = await Promise.all([api.sales({ from: range.from, to: range.to }), api.partners()]);
    return { sales, partners };
  }, [range.from, range.to]);

  const view = useMemo(() => {
    if (!data) return null;
    const byCode = partnerByCode(data.partners);
    const sales = data.sales.filter(
      (s) =>
        (!brand || (brand === "car" ? s.brand !== "camper" : s.brand === "camper")) &&
        (source === "all" || (source === "partners") === isPartnerSale(s, byCode)),
    );
    const partnerSales = sales.filter((s) => isPartnerSale(s, byCode));
    return {
      sales,
      byCode,
      totals: totals(sales, currency),
      partnerTotals: totals(partnerSales, currency),
      series: revenueSeries(sales, range.from, range.to, granularity, currency),
      byPartner: revenueByPartner(sales, data.partners, currency),
    };
  }, [data, brand, source, currency, range, granularity]);

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="Bookings imported from Caren"
        actions={
          isAdmin && (
            <LinkButton href="/sales/import" variant="primary">
              Import bookings
            </LinkButton>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRange
          preset={preset}
          range={range}
          onChange={(p, r) => {
            setPreset(p);
            setRange(r);
            setGranularity(defaultGranularity(r.from, r.to));
          }}
        />
        <Segmented
          value={granularity}
          onChange={setGranularity}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />
        <Select value={brand} onChange={(e) => setBrand(e.target.value)} className="w-auto" aria-label="Brand">
          <option value="">Both brands</option>
          <option value="car">Go Car Rentals</option>
          <option value="camper">Go Campers</option>
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="w-auto" aria-label="Source">
          <option value="all">All bookings</option>
          <option value="partners">Via CRM partners</option>
          <option value="other">Not via partners</option>
        </Select>
      </div>

      {error ? <ErrorBox error={error} /> : null}
      {loading && !data ? (
        <Loading />
      ) : !view ? null : data!.sales.length === 0 ? (
        <Empty title="No bookings in this period">
          {isAdmin ? (
            <>
              Export bookings from Caren and{" "}
              <Link href="/sales/import" className="text-accent">
                import them
              </Link>
              .
            </>
          ) : (
            "Try a longer period."
          )}
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile label="Revenue" value={money(view.totals.revenue, currency)} sub={`${view.totals.bookings} bookings${view.totals.cancelled ? ` · ${view.totals.cancelled} cancelled` : ""}`} />
            <StatTile label="Avg. booking" value={money(view.totals.avgBooking, currency)} sub={view.totals.avgDays ? `${num(view.totals.avgDays, 1)} days on average` : undefined} />
            <StatTile
              label="Via partners"
              value={money(view.partnerTotals.revenue, currency)}
              sub={`${view.partnerTotals.bookings} bookings`}
            />
            <StatTile
              label="Partner share"
              value={view.totals.revenue ? `${num((view.partnerTotals.revenue / view.totals.revenue) * 100, 1)} %` : "–"}
              sub="of revenue"
            />
          </div>

          <Card title="Revenue by booking date">
            <RevenueChart data={view.series} currency={currency} granularity={granularity} />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card title="By source">
              <div className="overflow-x-auto">
                <table className="tabular w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1.5 pr-3 font-medium">Partner / code</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Bookings</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Revenue</th>
                      <th className="py-1.5 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {view.byPartner.slice(0, 25).map((r) => (
                      <tr key={r.code || "direct"} className="text-ink">
                        <td className="py-1.5 pr-3">
                          {r.partner ? (
                            <Link href={`/partners/${r.partner.id}`} className="font-medium text-accent">
                              {r.partner.name}
                            </Link>
                          ) : r.code ? (
                            <span className="text-ink-2">
                              <span className="font-mono text-xs">{r.code}</span> <span className="text-xs text-muted">(no partner in CRM)</span>
                            </span>
                          ) : (
                            <span className="text-ink-2">Direct / no affiliate</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{r.bookings}</td>
                        <td className="py-1.5 pr-3 text-right">{money(r.revenue, currency)}</td>
                        <td className="py-1.5 text-right whitespace-nowrap text-ink-2">{view.totals.revenue ? `${num((r.revenue / view.totals.revenue) * 100, 1)} %` : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Converter">
              <Converter />
            </Card>
          </div>

          <Card title={`Bookings (${view.sales.length})`}>
            <div className="overflow-x-auto">
              <table className="tabular w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1.5 pr-3 font-medium">Booked</th>
                    <th className="py-1.5 pr-3 font-medium">Ref</th>
                    <th className="hidden py-1.5 pr-3 font-medium sm:table-cell">Brand</th>
                    <th className="hidden py-1.5 pr-3 font-medium md:table-cell">Vehicle</th>
                    <th className="hidden py-1.5 pr-3 font-medium sm:table-cell">Pickup</th>
                    <th className="py-1.5 pr-3 font-medium">Source</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(showAll ? view.sales : view.sales.slice(0, 30)).map((s) => {
                    const partner = view.byCode.get((s.affiliate_code ?? "").trim().toLowerCase());
                    return (
                      <tr key={s.id} className={s.is_cancelled ? "text-muted line-through" : "text-ink"}>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{shortDate(s.booking_date)}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{s.booking_ref}</td>
                        <td className="hidden py-1.5 pr-3 sm:table-cell">{brandLabel(s.brand)}</td>
                        <td className="hidden max-w-48 truncate py-1.5 pr-3 md:table-cell">{s.vehicle ?? "–"}</td>
                        <td className="hidden py-1.5 pr-3 whitespace-nowrap sm:table-cell">
                          {shortDate(s.pickup_date)}
                          {s.rental_days ? <span className="text-muted"> · {s.rental_days}d</span> : null}
                        </td>
                        <td className="max-w-40 truncate py-1.5 pr-3">{partner?.name ?? s.affiliate_code ?? <span className="text-muted">Direct</span>}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">{money(saleValue(s, currency), currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {view.sales.length > 30 && (
              <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 text-sm font-medium text-accent">
                {showAll ? "Show less" : `Show all ${view.sales.length}`}
              </button>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
