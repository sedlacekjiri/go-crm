"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FollowUp, StageBadge } from "@/components/badges";
import { useAuth, useCurrency } from "@/components/providers";
import { RevenueChart } from "@/components/revenue-chart";
import { Card, ErrorBox, LinkButton, Loading, ProgressBar, StatTile } from "@/components/ui";
import { isPartnerSale, partnerByCode, revenueByPartner, revenueSeries, totals } from "@/lib/analytics";
import { api, useData } from "@/lib/data";
import { shiftDate } from "@/lib/fx";
import { activityLabel, GOAL_METRICS, STAGES, type GoalMetric } from "@/lib/types";
import { dateTime, money, num, today } from "@/lib/format";
import { actuals, monthElapsed, monthLabel, monthOf } from "@/lib/goals";

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { currency } = useCurrency();
  const t = today();
  const month = monthOf(t);
  const chartFrom = shiftDate(t, -7 * 12 + 1);
  const from = `${month}-01` < chartFrom ? `${month}-01` : chartFrom;

  const { data, error, loading } = useData(async () => {
    const [partners, activities, sales, goals] = await Promise.all([
      api.partners(),
      api.activities({ since: new Date(`${shiftDate(from, -1)}T00:00:00`).toISOString() }),
      api.sales({ from, to: t }),
      api.goals([month]),
    ]);
    return { partners, activities, sales, goals };
  }, [from, t, month]);

  const view = useMemo(() => {
    if (!data) return null;
    const byCode = partnerByCode(data.partners);
    const partnerSales = data.sales.filter((s) => isPartnerSale(s, byCode));
    const last30 = (s: { booking_date: string }) => s.booking_date >= shiftDate(t, -29);
    const open = data.partners.filter((p) => p.stage !== "accepted" && p.stage !== "declined");
    const followUps = open
      .filter((p) => p.next_follow_up && p.next_follow_up <= shiftDate(t, 7))
      .sort((a, b) => a.next_follow_up!.localeCompare(b.next_follow_up!));
    const partnersById = new Map(data.partners.map((p) => [p.id, p]));
    return {
      followUps,
      notVisited: data.partners.filter((p) => p.stage === "new").length,
      accepted: data.partners.filter((p) => p.stage === "accepted").length,
      funnel: STAGES.map((s) => ({ ...s, n: data.partners.filter((p) => p.stage === s.value).length })),
      partner30: totals(partnerSales.filter(last30), currency),
      all30: totals(data.sales.filter(last30), currency),
      series: revenueSeries(partnerSales, chartFrom, t, "week", currency),
      top: revenueByPartner(partnerSales, data.partners, currency).slice(0, 5),
      recent: data.activities.slice(0, 8).map((a) => ({ ...a, partner: partnersById.get(a.partner_id) })),
      actual: actuals(month, data),
      target: Object.fromEntries(data.goals.map((g) => [g.metric, g.target])) as Partial<Record<GoalMetric, number>>,
    };
  }, [data, currency, t, chartFrom, month]);

  if (error) return <ErrorBox error={error} />;
  if (loading || !view) return <Loading />;

  const maxFunnel = Math.max(1, ...view.funnel.map((f) => f.n));
  const elapsed = monthElapsed(month);
  const share = view.all30.revenue ? (view.partner30.revenue / view.all30.revenue) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Góðan daginn</h1>
          <p className="text-sm text-ink-2">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · Reykjavík partner network
          </p>
        </div>
        {isAdmin && (
          <LinkButton href="/partners/new" variant="primary">
            + Add partner
          </LinkButton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Active partners" value={view.accepted} sub={`${view.funnel.find((f) => f.value === "in_talks")?.n ?? 0} in talks`} />
        <StatTile label="Partner revenue · 30 d" value={money(view.partner30.revenue, currency)} sub={`${view.partner30.bookings} bookings`} />
        <StatTile label="Share of all sales · 30 d" value={share === null ? "–" : `${num(share, 1)} %`} sub={view.all30.revenue ? `of ${money(view.all30.revenue, currency)}` : "no sales imported"} />
        <StatTile label={`Visits · ${monthLabel(month).split(" ")[0]}`} value={view.actual.visits} sub={view.target.visits !== undefined ? `target ${num(view.target.visits)}` : `${view.notVisited} still to visit`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Revenue from partners · last 12 weeks" action={<Link href="/sales" className="text-xs font-medium text-accent">Sales →</Link>}>
          <RevenueChart data={view.series} currency={currency} granularity="week" height={220} />
        </Card>

        <Card title="Follow-ups" action={<span className="text-xs text-muted">next 7 days</span>}>
          {view.followUps.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing due. {view.notVisited > 0 && <Link href="/pipeline" className="text-accent">{view.notVisited} partners not visited yet →</Link>}
            </p>
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {view.followUps.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <Link href={`/partners/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                      <span className="text-xs text-muted">{STAGES.find((s) => s.value === p.stage)?.label}</span>
                    </span>
                    <FollowUp date={p.next_follow_up} />
                  </Link>
                </li>
              ))}
              {view.followUps.length > 8 && <li className="px-2 pt-2 text-xs text-muted">+ {view.followUps.length - 8} more</li>}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title={`Goals · ${monthLabel(month)}`} action={<Link href="/goals" className="text-xs font-medium text-accent">Edit →</Link>}>
          <ul className="space-y-3">
            {GOAL_METRICS.map((g) => {
              const target = view.target[g.value];
              const actual = view.actual[g.value];
              const fmt = (v: number) => (g.value === "revenue_eur" ? money(v, "EUR") : num(v));
              return (
                <li key={g.value}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-ink-2">{g.label}</span>
                    <span className="tabular font-medium text-ink">
                      {fmt(actual)}
                      {target !== undefined && <span className="font-normal text-muted"> / {fmt(target)}</span>}
                    </span>
                  </div>
                  {target !== undefined ? (
                    <ProgressBar value={actual} max={target} marker={elapsed < 1 ? target * elapsed : undefined} />
                  ) : (
                    <div className="h-2 rounded-full bg-surface-2" />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Pipeline" action={<Link href="/pipeline" className="text-xs font-medium text-accent">Open →</Link>}>
          <ul className="space-y-2">
            {view.funnel.map((f) => (
              <li key={f.value} className="grid grid-cols-[84px_1fr_32px] items-center gap-2 text-xs">
                <span className="text-ink-2">{f.label}</span>
                <div className="h-5 rounded bg-surface-2">
                  <div className="h-5 rounded bg-series-1" style={{ width: `${(f.n / maxFunnel) * 100}%`, minWidth: f.n ? 4 : 0 }} />
                </div>
                <span className="tabular text-right font-medium text-ink">{f.n}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Top partners · 12 weeks" className="md:col-span-2 lg:col-span-1">
          {view.top.length === 0 ? (
            <p className="text-sm text-muted">No partner bookings yet. Bookings show up here once a partner&apos;s affiliate code appears in imported sales.</p>
          ) : (
            <ol className="space-y-2">
              {view.top.map((r, i) => (
                <li key={r.code} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-xs text-muted">{i + 1}</span>
                  <Link href={`/partners/${r.partner!.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-accent">
                    {r.partner!.name}
                  </Link>
                  <span className="text-xs text-muted">{r.bookings}×</span>
                  <span className="tabular font-medium text-ink">{money(r.revenue, currency)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="Recent activity">
        {view.recent.length === 0 ? (
          <p className="text-sm text-muted">No visits logged yet. Open a partner and tap “Log activity” after each visit.</p>
        ) : (
          <ul className="divide-y divide-line">
            {view.recent.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="w-28 shrink-0 text-xs text-muted">{dateTime(a.happened_at)}</span>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  <span className="text-ink-2">{activityLabel(a.type)} · </span>
                  {a.partner ? (
                    <Link href={`/partners/${a.partner.id}`} className="font-medium hover:text-accent">
                      {a.partner.name}
                    </Link>
                  ) : (
                    "–"
                  )}
                  {a.summary && <span className="text-ink-2"> – {a.summary.length > 120 ? `${a.summary.slice(0, 120)}…` : a.summary}</span>}
                </span>
                {a.partner && (
                  <span className="self-start sm:self-auto">
                    <StageBadge stage={a.partner.stage} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
