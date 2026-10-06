"use client";

import { useState } from "react";
import { parseNumber } from "@/lib/import";
import { money } from "@/lib/format";
import { useCurrency } from "./providers";
import { Input } from "./ui";

// EUR ⇄ ISK with today's ECB reference rate. Typing in either box updates the other.
export function Converter() {
  const { eurIsk, rateDate } = useCurrency();
  const [eur, setEur] = useState("100");
  const [isk, setIsk] = useState("");

  if (!eurIsk) return <p className="text-sm text-muted">Loading today&apos;s rate…</p>;
  const iskValue = isk !== "" ? isk : String(Math.round((parseNumber(eur) ?? 0) * eurIsk));

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-2">EUR</span>
          <Input
            inputMode="decimal"
            value={eur}
            onChange={(e) => {
              setEur(e.target.value);
              setIsk("");
            }}
          />
        </label>
        <span className="pb-2.5 text-muted">⇄</span>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-2">ISK</span>
          <Input
            inputMode="numeric"
            value={iskValue}
            onChange={(e) => {
              setIsk(e.target.value);
              const n = parseNumber(e.target.value);
              setEur(n === null ? "" : String(Math.round((n / eurIsk) * 100) / 100));
            }}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">
        1 € = {eurIsk.toFixed(2)} kr · 1 000 kr = {money(1000 / eurIsk, "EUR")} · ECB {rateDate}
      </p>
    </div>
  );
}
