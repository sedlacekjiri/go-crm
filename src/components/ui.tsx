"use client";

import Link from "next/link";
import { useEffect, type ComponentProps, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-bad-text border border-line hover:bg-bad-soft",
};
const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 h-10 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "secondary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={cx(buttonBase, variants[variant], className)} {...props} />;
}

export function LinkButton({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, variants[variant], className)} {...props} />;
}

const control =
  "w-full rounded-lg border border-line bg-surface px-3 h-10 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(control, "h-auto py-2 min-h-20", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(control, "pr-8", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className, children, title, action }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4 pt-2">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cx("inline-flex rounded-lg border border-line bg-surface p-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors",
            value === o.value ? "bg-accent-soft text-accent" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-muted" role="status">
      <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      Loading…
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
  return <div className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad-text">{message}</div>;
}

// Bottom sheet on phones, centered dialog on larger screens.
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, marker }: { value: number; max: number; marker?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const markerPct = marker !== undefined && max > 0 ? Math.min(100, (marker / max) * 100) : undefined;
  return (
    <div className="relative h-2 rounded-full bg-surface-2" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cx("h-2 rounded-full", pct >= 100 ? "bg-good" : "bg-accent")} style={{ width: `${pct}%` }} />
      {markerPct !== undefined && (
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink-2" style={{ left: `calc(${markerPct}% - 1px)` }} title="Expected by today" />
      )}
    </div>
  );
}
