"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { AREAS, INTEREST, PARTNER_TYPES, STAGES, type Partner, type PartnerType } from "@/lib/types";
import { useToast } from "./providers";
import { Button, Card, Field, Input, Select, Textarea } from "./ui";

type FormState = Omit<Partner, "id" | "created_at" | "updated_at" | "accepted_at">;

const empty = (type: PartnerType): FormState => ({
  name: "",
  type,
  area: "101 Miðborg (Downtown)",
  address: null,
  website: null,
  phone: null,
  email: null,
  rooms: null,
  stars: null,
  stage: "new",
  interest: null,
  affiliate_code: null,
  affiliate_url: null,
  next_follow_up: null,
  declined_reason: null,
  notes: null,
});

export function PartnerForm({ partner, defaultType = "hotel" }: { partner?: Partner; defaultType?: PartnerType }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => {
    if (!partner) return empty(defaultType);
    const base = empty(partner.type);
    return Object.fromEntries(Object.keys(base).map((k) => [k, partner[k as keyof FormState]])) as FormState;
  });
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof FormState) => ({
    value: (form[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(key, (e.target.value.trim() === "" ? null : e.target.value) as never),
  });
  const int = (key: "rooms" | "stars" | "interest") => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(key, e.target.value === "" ? null : Number(e.target.value)),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = { ...form, name: form.name.trim(), affiliate_code: form.affiliate_code?.trim() || null };
    const res = partner
      ? await supabase().from("partners").update(payload).eq("id", partner.id).select("id").single()
      : await supabase().from("partners").insert(payload).select("id").single();
    setBusy(false);
    if (res.error) {
      const msg = res.error.message.includes("partners_affiliate_code_key") ? "This affiliate code is already used by another partner." : res.error.message;
      return toast(msg, "error");
    }
    toast(partner ? "Saved" : "Partner added");
    router.push(`/partners/${res.data.id}`);
  };

  const isOnline = form.type === "ota";

  return (
    <form onSubmit={save} className="space-y-4">
      <Card title="Basics">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input required value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={!partner} />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => set("type", e.target.value as PartnerType)}>
              {PARTNER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.singular}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area">
            <Select {...text("area")}>
              <option value="">–</option>
              {AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
          {!isOnline && (
            <Field label="Address" className="sm:col-span-2">
              <Input {...text("address")} placeholder="Pósthússtræti 11" />
            </Field>
          )}
          {(form.type === "hotel" || form.type === "guesthouse") && (
            <>
              <Field label="Rooms">
                <Input type="number" inputMode="numeric" min={0} {...int("rooms")} />
              </Field>
              <Field label="Stars">
                <Select {...int("stars")}>
                  <option value="">–</option>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <option key={s} value={s}>
                      {"★".repeat(s)}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card title="Pipeline">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Stage">
            <Select value={form.stage} onChange={(e) => set("stage", e.target.value as FormState["stage"])}>
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Interest">
            <Select {...int("interest")}>
              <option value="">–</option>
              {INTEREST.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next follow-up">
            <Input type="date" {...text("next_follow_up")} />
          </Field>
          {form.stage === "declined" && (
            <Field label="Why declined" className="sm:col-span-3">
              <Input {...text("declined_reason")} placeholder="Already partner with another rental, chain policy…" />
            </Field>
          )}
        </div>
      </Card>

      <Card title="Affiliate">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Affiliate code" hint="Exactly as it appears in the Caren booking export – links sales to this partner.">
            <Input {...text("affiliate_code")} className="font-mono" placeholder="HOTELBORG" />
          </Field>
          <Field label="Affiliate link">
            <Input type="url" {...text("affiliate_url")} placeholder="https://…" />
          </Field>
        </div>
      </Card>

      <Card title="Contact">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Phone">
            <Input type="tel" {...text("phone")} />
          </Field>
          <Field label="E-mail">
            <Input type="email" {...text("email")} />
          </Field>
          <Field label="Website">
            <Input type="url" {...text("website")} placeholder="https://" />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">Contact people (manager, reception…) are added on the partner page.</p>
      </Card>

      <Card title="Notes">
        <Textarea rows={4} {...text("notes")} />
      </Card>

      <div className="sticky bottom-16 z-10 flex gap-2 rounded-xl border border-line bg-surface p-2 md:bottom-4">
        <Button type="button" onClick={() => router.back()} className="flex-1 sm:flex-none">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy || !form.name.trim()} className="flex-1 sm:flex-none">
          {busy ? "Saving…" : partner ? "Save changes" : "Add partner"}
        </Button>
      </div>
    </form>
  );
}
