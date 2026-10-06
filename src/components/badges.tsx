import { interestLabel, stageLabel, type Stage } from "@/lib/types";
import { relativeDays, shortDate, today } from "@/lib/format";
import { cx } from "./ui";

const stageDot: Record<Stage, string> = {
  new: "bg-muted",
  contacted: "bg-series-1",
  in_talks: "bg-warn",
  accepted: "bg-good",
  declined: "bg-bad",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-2 whitespace-nowrap">
      <span className={cx("size-2 rounded-full", stageDot[stage])} aria-hidden />
      {stageLabel(stage)}
    </span>
  );
}

// Cold / warm / hot shown as 1–3 filled flames plus the word, so it never relies on color alone.
export function InterestBadge({ interest }: { interest: number | null }) {
  if (!interest) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-2 whitespace-nowrap" title={`Interest: ${interestLabel(interest)}`}>
      <span aria-hidden className="tracking-[-0.15em]">
        {[1, 2, 3].map((i) => (
          <span key={i} className={i <= interest ? "text-series-2" : "text-line"}>
            ●
          </span>
        ))}
      </span>
      {interestLabel(interest)}
    </span>
  );
}

export function FollowUp({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-muted">No follow-up</span>;
  const t = today();
  const overdue = date < t;
  const isToday = date === t;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        overdue ? "bg-bad-soft text-bad-text" : isToday ? "bg-warn-soft text-warn-text" : "bg-surface-2 text-ink-2",
      )}
    >
      {overdue ? "⚠ " : ""}
      {shortDate(date)} · {relativeDays(date)}
    </span>
  );
}
