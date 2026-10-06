"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FollowUp, InterestBadge } from "@/components/badges";
import { useAuth, useToast } from "@/components/providers";
import { cx, ErrorBox, Loading, PageHeader, Select, StatTile } from "@/components/ui";
import { api, useData } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { PARTNER_TYPES, STAGES, type Partner, type Stage } from "@/lib/types";

export default function PipelinePage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [type, setType] = useState("");
  const { data, error, loading, reload } = useData(() => api.partners());
  const [moving, setMoving] = useState<string | null>(null);

  const partners = useMemo(() => (data ?? []).filter((p) => !type || p.type === type), [data, type]);
  const byStage = (s: Stage) =>
    partners
      .filter((p) => p.stage === s)
      .sort((a, b) => (b.interest ?? 0) - (a.interest ?? 0) || (a.next_follow_up ?? "9999").localeCompare(b.next_follow_up ?? "9999"));

  const count = (s: Stage) => partners.filter((p) => p.stage === s).length;
  const decided = count("accepted") + count("declined");
  const reached = partners.length - count("new");

  const move = async (p: Partner, dir: 1 | -1) => {
    const order = STAGES.map((s) => s.value);
    const next = order[order.indexOf(p.stage) + dir];
    if (!next) return;
    setMoving(p.id);
    const { error } = await supabase().from("partners").update({ stage: next }).eq("id", p.id);
    setMoving(null);
    if (error) return toast(error.message, "error");
    reload();
  };

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="From first visit to signed partner"
        actions={
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40" aria-label="Partner type">
            <option value="">All types</option>
            {PARTNER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        }
      />
      {error ? <ErrorBox error={error} /> : null}
      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile label="In pipeline" value={partners.length} sub={`${count("new")} not visited yet`} />
            <StatTile label="Reached" value={reached} sub={partners.length ? `${Math.round((reached / partners.length) * 100)} % of the list` : "–"} />
            <StatTile label="Partners" value={count("accepted")} sub={`${count("in_talks")} in talks`} />
            <StatTile
              label="Win rate"
              value={decided ? `${Math.round((count("accepted") / decided) * 100)} %` : "–"}
              sub={`${count("accepted")} accepted / ${count("declined")} declined`}
            />
          </div>

          <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
            {STAGES.map((s) => {
              const items = byStage(s.value);
              return (
                <section key={s.value} className="w-[80vw] max-w-xs shrink-0 snap-start rounded-xl bg-surface-2 p-2 md:w-auto md:max-w-none">
                  <header className="flex items-baseline justify-between px-1.5 pt-1 pb-2">
                    <h2 className="text-sm font-semibold text-ink">{s.label}</h2>
                    <span className="text-xs text-muted">{items.length}</span>
                  </header>
                  <p className="px-1.5 pb-2 text-[11px] text-muted">{s.hint}</p>
                  <ul className="space-y-2">
                    {items.map((p) => (
                      <li key={p.id} className={cx("rounded-lg border border-line bg-surface p-2.5", moving === p.id && "opacity-50")}>
                        <Link href={`/partners/${p.id}`} className="block">
                          <div className="text-sm font-medium text-ink">{p.name}</div>
                          <div className="truncate text-xs text-muted">{[p.area?.replace(/\s*\(.*\)/, ""), p.rooms ? `${p.rooms} rooms` : null].filter(Boolean).join(" · ") || " "}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <InterestBadge interest={p.interest} />
                            {(s.value === "contacted" || s.value === "in_talks" || s.value === "new") && p.next_follow_up && <FollowUp date={p.next_follow_up} />}
                          </div>
                        </Link>
                        {isAdmin && (
                          <div className="mt-2 flex justify-between border-t border-line pt-1.5">
                            <button
                              type="button"
                              disabled={s.value === "new"}
                              onClick={() => move(p, -1)}
                              className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:invisible"
                              aria-label={`Move ${p.name} back`}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              disabled={s.value === "declined"}
                              onClick={() => move(p, 1)}
                              className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:invisible"
                              aria-label={`Move ${p.name} forward`}
                            >
                              →
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                    {items.length === 0 && <li className="px-1.5 py-4 text-center text-xs text-muted">Empty</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
