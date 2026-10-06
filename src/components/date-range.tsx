"use client";

import { shiftDate } from "@/lib/fx";
import { today } from "@/lib/format";
import { Input, Select } from "./ui";

export const PRESETS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "mtd", label: "This month" },
  { value: "lm", label: "Last month" },
  { value: "ytd", label: "This year" },
  { value: "12m", label: "Last 12 months" },
  { value: "custom", label: "Custom…" },
] as const;
export type Preset = (typeof PRESETS)[number]["value"];

export function presetRange(p: Preset): { from: string; to: string } {
  const t = today();
  switch (p) {
    case "7d":
      return { from: shiftDate(t, -6), to: t };
    case "30d":
      return { from: shiftDate(t, -29), to: t };
    case "90d":
      return { from: shiftDate(t, -89), to: t };
    case "mtd":
      return { from: `${t.slice(0, 7)}-01`, to: t };
    case "lm": {
      const firstThis = `${t.slice(0, 7)}-01`;
      const lastPrev = shiftDate(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case "ytd":
      return { from: `${t.slice(0, 4)}-01-01`, to: t };
    default:
      return { from: `${shiftDate(t, -364).slice(0, 7)}-01`, to: t };
  }
}

export function DateRange({
  preset,
  range,
  onChange,
}: {
  preset: Preset;
  range: { from: string; to: string };
  onChange: (preset: Preset, range: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={preset}
        onChange={(e) => {
          const p = e.target.value as Preset;
          onChange(p, p === "custom" ? range : presetRange(p));
        }}
        className="w-auto"
        aria-label="Period"
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      {preset === "custom" && (
        <>
          <Input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onChange("custom", { ...range, from: e.target.value })} className="w-auto" aria-label="From" />
          <span className="text-muted">–</span>
          <Input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && onChange("custom", { ...range, to: e.target.value })} className="w-auto" aria-label="To" />
        </>
      )}
    </div>
  );
}
