"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FollowUp, InterestBadge, StageBadge } from "@/components/badges";
import { useAuth, useCurrency, useToast } from "@/components/providers";
import { Button, Card, cx, Empty, ErrorBox, Field, Input, LinkButton, Loading, Modal, Select, StatTile, Textarea } from "@/components/ui";
import { totals } from "@/lib/analytics";
import { api, useData } from "@/lib/data";
import { shiftDate } from "@/lib/fx";
import { dateTime, fullDate, money, shortDate, today } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import {
  ACTIVITY_TYPES,
  activityLabel,
  brandLabel,
  INTEREST,
  STAGES,
  typeLabel,
  type ActivityType,
  type Contact,
  type Partner,
  type Stage,
} from "@/lib/types";

const FOLLOW_UPS = [
  { label: "+3 days", days: 3 },
  { label: "+1 week", days: 7 },
  { label: "+2 weeks", days: 14 },
  { label: "+1 month", days: 30 },
];

export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { currency } = useCurrency();
  const [logOpen, setLogOpen] = useState(false);
  const [contactEdit, setContactEdit] = useState<Partial<Contact> | null>(null);

  const { data, error, loading, reload } = useData(async () => {
    const partner = await api.partner(id);
    if (!partner) return null;
    const [contacts, activities, sales] = await Promise.all([
      api.contacts(id),
      api.activities({ partnerId: id }),
      partner.affiliate_code ? api.sales({ affiliateCode: partner.affiliate_code.trim() }) : Promise.resolve([]),
    ]);
    return { partner, contacts, activities, sales };
  }, [id]);

  const perf = useMemo(() => {
    if (!data) return null;
    const since = shiftDate(today(), -30);
    return {
      all: totals(data.sales, currency),
      last30: totals(
        data.sales.filter((s) => s.booking_date >= since),
        currency,
      ),
      first: data.sales.filter((s) => !s.is_cancelled).at(-1)?.booking_date ?? null,
    };
  }, [data, currency]);

  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  if (!data) return <Empty title="Partner not found" />;
  const { partner: p, contacts, activities, sales } = data;

  const update = async (patch: Partial<Partner>, message = "Updated") => {
    const { error } = await supabase().from("partners").update(patch).eq("id", p.id);
    if (error) return toast(error.message, "error");
    toast(message);
    reload();
  };

  const remove = async () => {
    if (!confirm(`Delete ${p.name} including its contacts and activity log?`)) return;
    const { error } = await supabase().from("partners").delete().eq("id", p.id);
    if (error) return toast(error.message, "error");
    toast("Partner deleted");
    router.replace(`/partners?type=${p.type}`);
  };

  const deleteContact = async (c: Contact) => {
    if (!confirm(`Remove ${c.name}?`)) return;
    const { error } = await supabase().from("contacts").delete().eq("id", c.id);
    if (error) return toast(error.message, "error");
    reload();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Could not copy", "error");
    }
  };

  return (
    <>
      <Link href={`/partners?type=${p.type}`} className="mb-3 inline-block text-sm text-ink-2 hover:text-ink">
        ← {typeLabel(p.type)}s
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <StageBadge stage={p.stage} />
            <InterestBadge interest={p.interest} />
            <span className="text-muted">
              {[typeLabel(p.type), p.area, p.rooms ? `${p.rooms} rooms` : null, p.stars ? "★".repeat(p.stars) : null].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <LinkButton href={`/partners/${p.id}/edit`}>Edit</LinkButton>
            <Button variant="primary" onClick={() => setLogOpen(true)}>
              + Log activity
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {isAdmin && (
            <Card title="Pipeline">
              <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
                {STAGES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    title={s.hint}
                    onClick={() => s.value !== p.stage && update({ stage: s.value }, `Moved to ${s.label}`)}
                    className={cx(
                      "h-9 flex-1 rounded-lg border px-3 text-sm font-medium whitespace-nowrap",
                      p.stage === s.value ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-ink-2">Interest</span>
                  {INTEREST.map((i) => (
                    <button
                      key={i.value}
                      type="button"
                      onClick={() => update({ interest: p.interest === i.value ? null : i.value })}
                      className={cx(
                        "h-8 rounded-full border px-3 text-xs font-medium",
                        p.interest === i.value ? "border-series-2 bg-warn-soft text-ink" : "border-line text-ink-2",
                      )}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              </div>
              {p.stage !== "accepted" && p.stage !== "declined" && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-ink-2">Follow-up</span>
                  <FollowUp date={p.next_follow_up} />
                  {FOLLOW_UPS.map((f) => (
                    <button
                      key={f.days}
                      type="button"
                      onClick={() => update({ next_follow_up: shiftDate(today(), f.days) }, "Follow-up set")}
                      className="h-8 rounded-full border border-line px-2.5 text-xs text-ink-2 hover:bg-surface-2"
                    >
                      {f.label}
                    </button>
                  ))}
                  {p.next_follow_up && (
                    <button type="button" onClick={() => update({ next_follow_up: null }, "Follow-up cleared")} className="h-8 px-2 text-xs text-muted hover:text-ink">
                      Clear
                    </button>
                  )}
                </div>
              )}
              {p.stage === "declined" && p.declined_reason && <p className="mt-3 text-sm text-ink-2">Declined: {p.declined_reason}</p>}
            </Card>
          )}

          {p.stage === "accepted" || p.affiliate_code ? (
            <Card
              title="Affiliate performance"
              action={p.accepted_at && <span className="text-xs text-muted">Partner since {fullDate(p.accepted_at)}</span>}
            >
              {!p.affiliate_code ? (
                <p className="text-sm text-ink-2">
                  Add the affiliate code (Edit) so bookings from the Caren import are matched to this partner.
                </p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded bg-surface-2 px-2 py-1 font-mono text-ink">{p.affiliate_code}</span>
                    {p.affiliate_url && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-ink-2">{p.affiliate_url}</span>
                        <Button className="h-8" onClick={() => copy(p.affiliate_url!)}>
                          Copy link
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatTile label="Bookings" value={perf!.all.bookings} sub="all time" />
                    <StatTile label="Revenue" value={money(perf!.all.revenue, currency)} sub="all time" />
                    <StatTile label="Last 30 days" value={money(perf!.last30.revenue, currency)} sub={`${perf!.last30.bookings} bookings`} />
                    <StatTile label="First booking" value={perf!.first ? shortDate(perf!.first) : "–"} />
                  </div>
                  {sales.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted">
                            <th className="py-1.5 pr-3 font-medium">Booked</th>
                            <th className="py-1.5 pr-3 font-medium">Ref</th>
                            <th className="py-1.5 pr-3 font-medium">Brand</th>
                            <th className="py-1.5 text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="tabular divide-y divide-line">
                          {sales.slice(0, 10).map((s) => (
                            <tr key={s.id} className={s.is_cancelled ? "text-muted line-through" : "text-ink"}>
                              <td className="py-1.5 pr-3">{shortDate(s.booking_date)}</td>
                              <td className="py-1.5 pr-3 font-mono text-xs">{s.booking_ref}</td>
                              <td className="py-1.5 pr-3">{brandLabel(s.brand)}</td>
                              <td className="py-1.5 text-right">{money(currency === "EUR" ? s.amount_eur : s.amount_isk, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </Card>
          ) : null}

          <Card title={`Activity (${activities.length})`}>
            {activities.length === 0 ? (
              <p className="text-sm text-muted">Nothing logged yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-4">
                {activities.map((a) => {
                  const who = contacts.find((c) => c.id === a.contact_id);
                  return (
                    <li key={a.id} className="relative">
                      <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden />
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                        <span className="font-medium text-ink-2">{activityLabel(a.type)}</span>
                        <span>{dateTime(a.happened_at)}</span>
                        {who && <span>· with {who.name}</span>}
                        {isAdmin && (
                          <button
                            type="button"
                            className="ml-auto text-muted hover:text-bad-text"
                            onClick={async () => {
                              if (!confirm("Delete this entry?")) return;
                              await supabase().from("activities").delete().eq("id", a.id);
                              reload();
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      {a.summary && <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink">{a.summary}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Contact people"
            action={
              isAdmin && (
                <button type="button" className="text-sm font-medium text-accent" onClick={() => setContactEdit({ partner_id: p.id, is_primary: contacts.length === 0 })}>
                  + Add
                </button>
              )
            }
          >
            {contacts.length === 0 ? (
              <p className="text-sm text-muted">No contact people yet.</p>
            ) : (
              <ul className="space-y-3">
                {contacts.map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{c.name}</span>
                      {c.is_primary && <span className="rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent">Main</span>}
                      {isAdmin && (
                        <span className="ml-auto flex gap-2 text-xs">
                          <button type="button" className="text-ink-2 hover:text-ink" onClick={() => setContactEdit(c)}>
                            Edit
                          </button>
                          <button type="button" className="text-muted hover:text-bad-text" onClick={() => deleteContact(c)}>
                            Remove
                          </button>
                        </span>
                      )}
                    </div>
                    {c.role && <div className="text-xs text-muted">{c.role}</div>}
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="text-accent">
                          {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="truncate text-accent">
                          {c.email}
                        </a>
                      )}
                    </div>
                    {c.notes && <p className="mt-0.5 text-xs text-ink-2">{c.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ["Address", p.address],
                ["Phone", p.phone && <a href={`tel:${p.phone}`} className="text-accent">{p.phone}</a>],
                ["E-mail", p.email && <a href={`mailto:${p.email}`} className="text-accent">{p.email}</a>],
                [
                  "Website",
                  p.website && (
                    <a href={p.website} target="_blank" rel="noreferrer" className="break-all text-accent">
                      {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  ),
                ],
                ["Added", fullDate(p.created_at)],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string} className="flex gap-3">
                    <dt className="w-20 shrink-0 text-muted">{k}</dt>
                    <dd className="min-w-0 text-ink">{v}</dd>
                  </div>
                ))}
            </dl>
            {p.notes && <p className="mt-3 border-t border-line pt-3 text-sm whitespace-pre-wrap text-ink-2">{p.notes}</p>}
          </Card>

          {isAdmin && (
            <Button variant="danger" className="w-full" onClick={remove}>
              Delete partner
            </Button>
          )}
        </div>
      </div>

      {isAdmin && (
        <>
          {/* Floating quick action on phones – log a visit right after walking out of the hotel. */}
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="fixed right-4 bottom-20 z-30 flex h-12 items-center gap-1 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg shadow-lg md:hidden"
          >
            + Log
          </button>
          {/* Mounted only while open so the form starts from the partner's current stage each time. */}
          {logOpen && <LogActivity open onClose={() => setLogOpen(false)} partner={p} contacts={contacts} onDone={reload} />}
          <ContactForm contact={contactEdit} onClose={() => setContactEdit(null)} onDone={reload} />
        </>
      )}
    </>
  );
}

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function LogActivity({ open, onClose, partner, contacts, onDone }: { open: boolean; onClose: () => void; partner: Partner; contacts: Contact[]; onDone: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<ActivityType>("visit");
  const [when, setWhen] = useState(nowLocal);
  const [contactId, setContactId] = useState("");
  const [summary, setSummary] = useState("");
  const [stage, setStage] = useState<Stage>(partner.stage === "new" ? "contacted" : partner.stage);
  const [followUp, setFollowUp] = useState<string>(partner.next_follow_up ?? "");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase()
      .from("activities")
      .insert({ partner_id: partner.id, type, happened_at: new Date(when).toISOString(), contact_id: contactId || null, summary: summary.trim() || null });
    if (!error) {
      const patch: Partial<Partner> = {};
      if (stage !== partner.stage) patch.stage = stage;
      if ((followUp || null) !== partner.next_follow_up) patch.next_follow_up = followUp || null;
      if (Object.keys(patch).length) {
        const res = await supabase().from("partners").update(patch).eq("id", partner.id);
        if (res.error) toast(res.error.message, "error");
      }
    }
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Logged");
    setSummary("");
    setWhen(nowLocal());
    onClose();
    onDone();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Log activity – ${partner.name}`}>
      <form onSubmit={save} className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cx(
                "h-9 rounded-full border px-3.5 text-sm font-medium",
                type === t.value ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="When">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </Field>
          <Field label="With">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">–</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="What happened">
          <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Talked to the front office manager, left flyers, she will ask the GM…" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Stage after this">
            <Select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next follow-up">
            <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FOLLOW_UPS.map((f) => (
            <button key={f.days} type="button" onClick={() => setFollowUp(shiftDate(today(), f.days))} className="h-8 rounded-full border border-line px-2.5 text-xs text-ink-2">
              {f.label}
            </button>
          ))}
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
    </Modal>
  );
}

function ContactForm({ contact, onClose, onDone }: { contact: Partial<Contact> | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Contact>>({});
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | undefined | null>(null);
  // Reset the form whenever a different contact is opened.
  const key = contact ? (contact.id ?? "new") : null;
  if (key !== lastId) {
    setLastId(key);
    setForm(contact ?? {});
  }

  const set = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      partner_id: form.partner_id,
      name: form.name?.trim(),
      role: form.role?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      notes: form.notes?.trim() || null,
      is_primary: !!form.is_primary,
    };
    if (payload.is_primary) {
      await supabase().from("contacts").update({ is_primary: false }).eq("partner_id", payload.partner_id!).neq("id", form.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const { error } = form.id ? await supabase().from("contacts").update(payload).eq("id", form.id) : await supabase().from("contacts").insert(payload);
    setBusy(false);
    if (error) return toast(error.message, "error");
    onClose();
    onDone();
  };

  return (
    <Modal open={!!contact} onClose={onClose} title={form.id ? "Edit contact" : "New contact"}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Name *">
          <Input required value={form.name ?? ""} onChange={set("name")} autoFocus />
        </Field>
        <Field label="Role">
          <Input value={form.role ?? ""} onChange={set("role")} placeholder="Front office manager, concierge, GM…" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Phone">
            <Input type="tel" value={form.phone ?? ""} onChange={set("phone")} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={form.email ?? ""} onChange={set("email")} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={form.notes ?? ""} onChange={set("notes")} placeholder="Works mornings, prefers WhatsApp…" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={!!form.is_primary} onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))} className="size-4 accent-[var(--accent)]" />
          Main contact
        </label>
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !form.name?.trim()}>
          {busy ? "Saving…" : "Save contact"}
        </Button>
      </form>
    </Modal>
  );
}
