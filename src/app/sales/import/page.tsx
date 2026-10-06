"use client";

import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useState } from "react";
import { storage, useAuth, useToast } from "@/components/providers";
import { Button, Card, cx, ErrorBox, Field, PageHeader, Select, StatTile } from "@/components/ui";
import { codeKey, partnerByCode } from "@/lib/analytics";
import { api, useData } from "@/lib/data";
import { convert, fetchDailyRates } from "@/lib/fx";
import { money, shortDate } from "@/lib/format";
import { buildSales, guessMapping, IMPORT_FIELDS, type BrandMode, type DateFormat, type ImportOptions, type Mapping } from "@/lib/import";
import { supabase } from "@/lib/supabase";

type Sheet = { name: string; headers: string[]; rows: Record<string, unknown>[] };

async function readFile(file: File): Promise<Sheet> {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
    const headers = (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] ?? []).map(String);
    return { name: file.name, headers, rows };
  }
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
  return { name: file.name, headers: parsed.meta.fields ?? [], rows: parsed.data };
}

const mappingKey = (headers: string[]) => `importMapping:${headers.join("|")}`;

export default function ImportPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [options, setOptions] = useState<ImportOptions>({ dateFormat: "auto", defaultCurrency: "EUR", brandMode: "column" });
  const [readError, setReadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ count: number; from: string; to: string } | null>(null);
  const { data: partners } = useData(() => api.partners());

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    setResult(null);
    try {
      const s = await readFile(file);
      if (!s.rows.length) throw new Error("The file has no rows.");
      setSheet(s);
      const saved = storage.get(mappingKey(s.headers));
      if (saved) {
        const parsed = JSON.parse(saved) as { mapping: Mapping; options: ImportOptions };
        setMapping(parsed.mapping);
        setOptions(parsed.options);
      } else {
        setMapping(guessMapping(s.headers));
      }
    } catch (e) {
      setReadError(e);
    }
  };

  const parsed = useMemo(() => (sheet ? buildSales(sheet.rows, mapping, options) : null), [sheet, mapping, options]);
  const missing = IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]);

  const stats = useMemo(() => {
    if (!parsed) return null;
    const byCode = partnerByCode(partners ?? []);
    const codes = new Map<string, { code: string; n: number; matched: boolean }>();
    for (const s of parsed.sales) {
      if (!s.affiliate_code) continue;
      const k = codeKey(s.affiliate_code);
      const e = codes.get(k) ?? { code: s.affiliate_code, n: 0, matched: byCode.has(k) };
      e.n++;
      codes.set(k, e);
    }
    const dates = parsed.sales.map((s) => s.booking_date).sort();
    return {
      codes: Array.from(codes.values()).sort((a, b) => b.n - a.n),
      from: dates[0],
      to: dates.at(-1),
      cancelled: parsed.sales.filter((s) => s.is_cancelled).length,
      currencies: Array.from(new Set(parsed.sales.map((s) => s.currency))),
      campers: parsed.sales.filter((s) => s.brand === "camper").length,
    };
  }, [parsed, partners]);

  const runImport = async () => {
    if (!parsed || !stats?.from || !stats.to || !sheet) return;
    setBusy(true);
    try {
      const rates = await fetchDailyRates(stats.from, stats.to, stats.currencies);
      const rows = parsed.sales.map(({ raw, ...s }) => ({ ...s, ...convert(s.amount, s.currency, s.booking_date, rates), raw, imported_at: new Date().toISOString() }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase().from("sales").upsert(rows.slice(i, i + 500), { onConflict: "booking_ref" });
        if (error) throw error;
      }
      storage.set(mappingKey(sheet.headers), JSON.stringify({ mapping, options }));
      setResult({ count: rows.length, from: stats.from, to: stats.to });
      toast(`Imported ${rows.length} bookings`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return <ErrorBox error="Only admins can import sales." />;

  return (
    <>
      <Link href="/sales" className="mb-3 inline-block text-sm text-ink-2 hover:text-ink">
        ← Sales
      </Link>
      <PageHeader title="Import bookings" subtitle="CSV or Excel export from booking.caren.is" />

      <div className="space-y-4">
        <Card title="1 · Choose file">
          <p className="mb-3 text-sm text-ink-2">
            In Caren, open the bookings list, filter the period you want and export it (CSV or Excel). Importing the same bookings again is safe –
            they are matched by booking number and updated, never duplicated.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-4 py-8 text-center hover:bg-surface-2">
            <span className="text-sm font-medium text-ink">{sheet ? sheet.name : "Tap to choose a file"}</span>
            <span className="mt-1 text-xs text-muted">{sheet ? `${sheet.rows.length} rows · ${sheet.headers.length} columns` : ".csv, .xlsx, .xls"}</span>
            <input type="file" accept=".csv,.txt,.xlsx,.xls,.ods" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {readError ? <div className="mt-3"><ErrorBox error={readError} /></div> : null}
        </Card>

        {sheet && (
          <Card title="2 · Match columns">
            <p className="mb-3 text-sm text-ink-2">Guessed from the column names – check them. Your choice is remembered for this export layout.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => (
                <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                  <Select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                    className={cx(f.required && !mapping[f.key] && "border-bad")}
                  >
                    <option value="">– not in file –</option>
                    {sheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <Field label="Date format">
                <Select value={options.dateFormat} onChange={(e) => setOptions((o) => ({ ...o, dateFormat: e.target.value as DateFormat }))}>
                  <option value="auto">Automatic (day first)</option>
                  <option value="dmy">DD.MM.YYYY</option>
                  <option value="mdy">MM/DD/YYYY</option>
                  <option value="ymd">YYYY-MM-DD</option>
                </Select>
              </Field>
              <Field label="Currency if not in file">
                <Select value={options.defaultCurrency} onChange={(e) => setOptions((o) => ({ ...o, defaultCurrency: e.target.value }))}>
                  <option>EUR</option>
                  <option>ISK</option>
                  <option>USD</option>
                  <option>GBP</option>
                </Select>
              </Field>
              <Field label="Brand" hint={options.brandMode === "column" ? "“camp” in brand/vehicle → Go Campers, else Go Car Rentals" : undefined}>
                <Select value={options.brandMode} onChange={(e) => setOptions((o) => ({ ...o, brandMode: e.target.value as BrandMode }))}>
                  <option value="column">Detect from column</option>
                  <option value="car">Whole file is Go Car Rentals</option>
                  <option value="camper">Whole file is Go Campers</option>
                </Select>
              </Field>
            </div>
          </Card>
        )}

        {sheet && parsed && (
          <Card title="3 · Check & import">
            {missing.length > 0 ? (
              <ErrorBox error={`Choose a column for: ${missing.map((f) => f.label).join(", ")}`} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <StatTile label="Bookings ready" value={parsed.sales.length} sub={stats?.from ? `${shortDate(stats.from)} – ${shortDate(stats.to)}` : undefined} />
                  <StatTile label="Rows with errors" value={parsed.errors.length} sub="skipped" />
                  <StatTile label="Cancelled" value={stats?.cancelled ?? 0} sub="kept, excluded from revenue" />
                  <StatTile label="Go Campers" value={stats?.campers ?? 0} sub={`of ${parsed.sales.length}`} />
                </div>

                {stats && stats.codes.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 text-xs font-medium text-ink-2">Affiliate codes in file</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.codes.slice(0, 30).map((c) => (
                        <span
                          key={c.code}
                          className={cx("rounded-full border px-2 py-0.5 text-xs", c.matched ? "border-good/40 bg-good-soft text-good-text" : "border-line text-ink-2")}
                          title={c.matched ? "Matches a CRM partner" : "No partner with this code yet"}
                        >
                          {c.matched ? "✓ " : ""}
                          <span className="font-mono">{c.code}</span> · {c.n}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted">✓ = matched to a partner. Unmatched codes are imported too and link up as soon as you add the code to a partner.</p>
                  </div>
                )}

                {parsed.errors.length > 0 && (
                  <details className="mt-4 text-sm">
                    <summary className="cursor-pointer text-bad-text">{parsed.errors.length} rows can&apos;t be read</summary>
                    <ul className="mt-2 max-h-40 overflow-auto text-xs text-ink-2">
                      {parsed.errors.slice(0, 100).map((e) => (
                        <li key={e.row}>
                          Row {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="mt-4 overflow-x-auto">
                  <table className="tabular w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="py-1.5 pr-3 font-medium">Ref</th>
                        <th className="py-1.5 pr-3 font-medium">Booked</th>
                        <th className="py-1.5 pr-3 font-medium">Pickup</th>
                        <th className="py-1.5 pr-3 font-medium">Brand</th>
                        <th className="py-1.5 pr-3 font-medium">Affiliate</th>
                        <th className="py-1.5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {parsed.sales.slice(0, 8).map((s) => (
                        <tr key={s.booking_ref} className={s.is_cancelled ? "text-muted line-through" : "text-ink"}>
                          <td className="py-1.5 pr-3 font-mono text-xs">{s.booking_ref}</td>
                          <td className="py-1.5 pr-3">{shortDate(s.booking_date)}</td>
                          <td className="py-1.5 pr-3">{shortDate(s.pickup_date)}</td>
                          <td className="py-1.5 pr-3">{s.brand === "camper" ? "Campers" : s.brand === "car" ? "Cars" : "–"}</td>
                          <td className="py-1.5 pr-3">{s.affiliate_code ?? "–"}</td>
                          <td className="py-1.5 text-right">{s.currency === "ISK" ? money(s.amount, "ISK") : s.currency === "EUR" ? money(s.amount, "EUR") : `${s.amount} ${s.currency}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-xs text-muted">First 8 rows. Amounts are converted to EUR and ISK with the ECB rate of each booking date.</p>
                </div>

                {result ? (
                  <div className="mt-4 rounded-lg bg-good-soft px-3 py-2 text-sm text-good-text">
                    ✓ Imported {result.count} bookings ({shortDate(result.from)} – {shortDate(result.to)}).{" "}
                    <Link href="/sales" className="font-medium underline">
                      Open sales
                    </Link>
                  </div>
                ) : (
                  <Button variant="primary" className="mt-4 w-full sm:w-auto" disabled={busy || !parsed.sales.length} onClick={runImport}>
                    {busy ? "Importing…" : `Import ${parsed.sales.length} bookings`}
                  </Button>
                )}
              </>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
