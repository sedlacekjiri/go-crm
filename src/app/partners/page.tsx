"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { FollowUp, InterestBadge, StageBadge } from "@/components/badges";
import { useAuth, useToast } from "@/components/providers";
import { Button, cx, Empty, ErrorBox, Field, Input, LinkButton, Loading, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { api, useData } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { AREAS, PARTNER_TYPES, STAGES, type Partner, type PartnerType } from "@/lib/types";

type Sort = "name" | "follow_up" | "last_activity" | "rooms";

function PartnersList() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const type = (params.get("type") as PartnerType) || "hotel";
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<string>("");
  const [area, setArea] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data, error, loading, reload } = useData(async () => {
    const [partners, activities] = await Promise.all([api.partners(), api.activities()]);
    const last = new Map<string, string>();
    for (const a of activities) if (!last.has(a.partner_id)) last.set(a.partner_id, a.happened_at);
    return { partners, last };
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of data?.partners ?? []) c[p.type] = (c[p.type] ?? 0) + 1;
    return c;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.partners.filter(
      (p) =>
        p.type === type &&
        (!stage || p.stage === stage) &&
        (!area || p.area === area) &&
        (!q || [p.name, p.address, p.affiliate_code, p.notes].some((v) => v?.toLowerCase().includes(q))),
    );
    const cmp: Record<Sort, (a: Partner, b: Partner) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      follow_up: (a, b) => (a.next_follow_up ?? "9999").localeCompare(b.next_follow_up ?? "9999"),
      last_activity: (a, b) => (data.last.get(b.id) ?? "").localeCompare(data.last.get(a.id) ?? ""),
      rooms: (a, b) => (b.rooms ?? -1) - (a.rooms ?? -1),
    };
    return list.sort(cmp[sort]);
  }, [data, type, stage, area, query, sort]);

  const setType = (t: string) => router.replace(`${pathname}?type=${t}`, { scroll: false });
  const stageCounts = (s: string) => data?.partners.filter((p) => p.type === type && p.stage === s).length ?? 0;
  const typeInfo = PARTNER_TYPES.find((t) => t.value === type)!;

  return (
    <>
      <PageHeader
        title="Partners"
        subtitle="Hotels, guesthouses, OTAs and cafés in the capital region"
        actions={
          isAdmin && (
            <>
              <Button onClick={() => setBulkOpen(true)}>Bulk add</Button>
              <LinkButton href={`/partners/new?type=${type}`} variant="primary">
                + Add {typeInfo.singular.toLowerCase()}
              </LinkButton>
            </>
          )
        }
      />

      {/* Type tabs */}
      <div className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {PARTNER_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
              type === t.value ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-muted">{counts[t.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-[1fr_auto_auto]">
        <Input className="col-span-2 md:col-span-1" placeholder="Search name, address, code…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
          <option value="">All areas</option>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="name">Sort: Name</option>
          <option value="follow_up">Sort: Next follow-up</option>
          <option value="last_activity">Sort: Last activity</option>
          <option value="rooms">Sort: Rooms</option>
        </Select>
      </div>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        {[{ value: "", label: "All" }, ...STAGES].map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStage(s.value)}
            className={cx(
              "h-8 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
              stage === s.value ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2",
            )}
          >
            {s.label}
            {s.value && <span className="ml-1 text-muted">{stageCounts(s.value)}</span>}
          </button>
        ))}
      </div>

      {error ? <ErrorBox error={error} /> : null}
      {loading && !data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty title={`No ${typeInfo.label.toLowerCase()} here yet`}>
          {isAdmin ? "Add one, or use Bulk add to paste a whole list of names." : "Nothing to show."}
        </Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/partners/${p.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-2 md:flex-row md:items-center md:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{p.name}</span>
                    {p.stars ? <span className="text-xs text-muted">{"★".repeat(p.stars)}</span> : null}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {[p.area, p.rooms ? `${p.rooms} rooms` : null, data?.last.get(p.id) ? `last contact ${shortDate(data.last.get(p.id))}` : "never contacted"]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={p.stage} />
                  <InterestBadge interest={p.interest} />
                  {p.stage !== "declined" && p.stage !== "accepted" && <FollowUp date={p.next_follow_up} />}
                  {p.stage === "accepted" && p.affiliate_code && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink-2">{p.affiliate_code}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BulkAdd open={bulkOpen} onClose={() => setBulkOpen(false)} type={type} onDone={reload} existing={data?.partners ?? []} />
    </>
  );
}

function BulkAdd({ open, onClose, type, onDone, existing }: { open: boolean; onClose: () => void; type: PartnerType; onDone: () => void; existing: Partner[] }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [t, setT] = useState<PartnerType>(type);
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);

  const known = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const names = Array.from(new Set(text.split("\n").map((l) => l.trim()).filter(Boolean)));
  const fresh = names.filter((n) => !known.has(n.toLowerCase()));

  const save = async () => {
    setBusy(true);
    const { error } = await supabase()
      .from("partners")
      .insert(fresh.map((name) => ({ name, type: t, area: area || null })));
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`Added ${fresh.length} partners`);
    setText("");
    onClose();
    onDone();
  };

  return (
    <Modal open={open} onClose={onClose} title="Bulk add partners">
      <div className="space-y-3">
        <Field label="Names – one per line" hint={names.length ? `${fresh.length} new${names.length - fresh.length ? `, ${names.length - fresh.length} already in CRM (skipped)` : ""}` : undefined}>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Hotel Borg\nCenterHotel Plaza\nKEX Hostel"} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <Select value={t} onChange={(e) => setT(e.target.value as PartnerType)}>
              {PARTNER_TYPES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.singular}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area (optional)">
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">–</option>
              {AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button variant="primary" className="w-full" disabled={!fresh.length || busy} onClick={save}>
          {busy ? "Adding…" : `Add ${fresh.length || ""} partners`}
        </Button>
      </div>
    </Modal>
  );
}

export default function PartnersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PartnersList />
    </Suspense>
  );
}
