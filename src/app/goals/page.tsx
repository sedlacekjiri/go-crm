"use client";

import { useMemo, useState } from "react";
import { useAuth, useToast } from "@/components/providers";
import { Button, Card, ErrorBox, Input, Loading, PageHeader, ProgressBar } from "@/components/ui";
import { api, useData } from "@/lib/data";
import { money, num, today } from "@/lib/format";
import { actuals, monthElapsed, monthLabel, monthOf, monthRange, shiftMonth } from "@/lib/goals";
import { supabase } from "@/lib/supabase";
import { GOAL_METRICS, type GoalMetric } from "@/lib/types";

const HISTORY = 6;

const fmt = (metric: GoalMetric, v: number) => (metric === "revenue_eur" ? money(v, "EUR") : num(v));

export default function GoalsPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState(() => monthOf(today()));
  const months = useMemo(() => Array.from({ length: HISTORY }, (_, i) => shiftMonth(month, i - HISTORY + 1)), [month]);
  const [draft, setDraft] = useState<Partial<Record<GoalMetric, string>>>({});
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useData(async () => {
    const from = monthRange(months[0]).from;
    const to = monthRange(month).to;
    const [goals, partners, activities, sales] = await Promise.all([
      api.goals(months),
      api.partners(),
      api.activities({ since: new Date(`${from}T00:00:00`).toISOString() }),
      api.sales({ from, to }),
    ]);
    return { goals, partners, activities, sales };
  }, [month]);

  const rows = useMemo(() => {
    if (!data) return null;
    return months.map((m) => ({
      month: m,
      actual: actuals(m, data),
      target: Object.fromEntries(data.goals.filter((g) => g.month === m).map((g) => [g.metric, g.target])) as Partial<Record<GoalMetric, number>>,
    }));
  }, [data, months]);

  const current = rows?.at(-1);
  const elapsed = monthElapsed(month);
  const dirty = Object.keys(draft).length > 0;
  const changeMonth = (delta: number) => {
    setMonth(shiftMonth(month, delta));
    setDraft({});
  };

  const save = async () => {
    setBusy(true);
    const upserts = Object.entries(draft)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([metric, v]) => ({ month, metric, target: Number(v) }));
    const deletes = Object.entries(draft)
      .filter(([, v]) => v === "")
      .map(([metric]) => metric);
    const res = upserts.length ? await supabase().from("goals").upsert(upserts, { onConflict: "month,metric" }) : { error: null };
    const del = deletes.length ? await supabase().from("goals").delete().eq("month", month).in("metric", deletes) : { error: null };
    setBusy(false);
    if (res.error || del.error) return toast((res.error ?? del.error)!.message, "error");
    setDraft({});
    toast("Goals saved");
    reload();
  };

  const copyPrevious = () => {
    const prev = rows?.at(-2)?.target ?? {};
    setDraft(Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, String(v)])));
  };

  return (
    <>
      <PageHeader
        title="Goals"
        subtitle="Monthly targets – what we promise, what we deliver"
        actions={
          <div className="flex items-center gap-1">
            <Button className="w-10 px-0" onClick={() => changeMonth(-1)} aria-label="Previous month">
              ←
            </Button>
            <span className="min-w-36 text-center text-sm font-medium text-ink">{monthLabel(month)}</span>
            <Button className="w-10 px-0" onClick={() => changeMonth(1)} aria-label="Next month">
              →
            </Button>
          </div>
        }
      />
      {error ? <ErrorBox error={error} /> : null}
      {loading && !data ? (
        <Loading />
      ) : current ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {GOAL_METRICS.map((g) => {
              const target = current.target[g.value];
              const actual = current.actual[g.value];
              const expected = target !== undefined ? target * elapsed : undefined;
              const onPace = target !== undefined && expected !== undefined && actual >= expected;
              return (
                <div key={g.value} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-ink-2">{g.label}</div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                        {fmt(g.value, actual)}
                        {target !== undefined && <span className="text-base font-normal text-muted"> / {fmt(g.value, target)}</span>}
                      </div>
                    </div>
                    {target !== undefined && elapsed > 0 && elapsed < 1 && (
                      <span className={onPace ? "text-xs font-medium text-good-text" : "text-xs font-medium text-warn-text"}>
                        {onPace ? "✓ On pace" : "△ Behind pace"}
                      </span>
                    )}
                    {target !== undefined && elapsed === 1 && (
                      <span className={actual >= target ? "text-xs font-medium text-good-text" : "text-xs font-medium text-bad-text"}>
                        {actual >= target ? "✓ Achieved" : "✕ Missed"}
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    {target !== undefined ? (
                      <ProgressBar value={actual} max={target} marker={elapsed > 0 && elapsed < 1 ? expected : undefined} />
                    ) : (
                      <p className="text-xs text-muted">No target set</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted">Target</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        className="h-8 w-32"
                        value={draft[g.value] ?? (target !== undefined ? String(target) : "")}
                        onChange={(e) => setDraft((d) => ({ ...d, [g.value]: e.target.value }))}
                        placeholder="–"
                      />
                      {g.unit && <span className="text-xs text-muted">{g.unit}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!dirty || busy} onClick={save}>
                {busy ? "Saving…" : "Save targets"}
              </Button>
              <Button onClick={copyPrevious}>Copy last month&apos;s targets</Button>
              {dirty && (
                <Button variant="ghost" onClick={() => setDraft({})}>
                  Discard
                </Button>
              )}
            </div>
          )}

          <Card title="Last 6 months">
            <div className="overflow-x-auto">
              <table className="tabular w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1.5 pr-3 font-medium">Month</th>
                    {GOAL_METRICS.map((g) => (
                      <th key={g.value} className="py-1.5 pr-3 text-right font-medium">
                        {g.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows!
                    .slice()
                    .reverse()
                    .map((r) => (
                      <tr key={r.month} className="text-ink">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{monthLabel(r.month)}</td>
                        {GOAL_METRICS.map((g) => {
                          const t = r.target[g.value];
                          const hit = t !== undefined && r.actual[g.value] >= t;
                          return (
                            <td key={g.value} className="py-1.5 pr-3 text-right whitespace-nowrap">
                              {fmt(g.value, r.actual[g.value])}
                              {t !== undefined && (
                                <span className={hit ? "text-good-text" : "text-muted"}>
                                  {" "}
                                  / {fmt(g.value, t)}
                                  {hit ? " ✓" : ""}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Visits = visits + meetings logged. New partners = moved to Accepted that month. Bookings & revenue = bookings whose affiliate code belongs to a CRM partner, by booking date.
            </p>
          </Card>
        </div>
      ) : null}
    </>
  );
}
