"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, useCurrency } from "./providers";
import { cx, Loading, Segmented } from "./ui";

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const NAV = [
  { href: "/", label: "Home", icon: icon("M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z") },
  { href: "/partners", label: "Partners", icon: icon("M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3") },
  { href: "/pipeline", label: "Pipeline", icon: icon("M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z") },
  { href: "/sales", label: "Sales", icon: icon("M4 20V10M10 20V4M16 20v-7M22 20H2") },
  { href: "/goals", label: "Goals", icon: icon("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01") },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function CurrencySwitch() {
  const { currency, setCurrency, eurIsk, rateDate } = useCurrency();
  return (
    <div className="flex items-center gap-2">
      <Segmented
        value={currency}
        onChange={setCurrency}
        options={[
          { value: "EUR", label: "EUR" },
          { value: "ISK", label: "ISK" },
        ]}
      />
      {eurIsk && (
        <span className="hidden text-xs text-muted lg:inline" title={`ECB reference rate ${rateDate}`}>
          1 € = {eurIsk.toFixed(1)} kr
        </span>
      )}
    </div>
  );
}

// Everything behind the login is per-user data fetched in the browser and depends on "today",
// so page content is rendered on the client only (the build would otherwise freeze the date).
const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mounted = useMounted();
  const router = useRouter();
  const { user, role } = useAuth();

  if (pathname.startsWith("/login")) return <>{children}</>;

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 pt-5 pb-6">
          <div className="text-lg font-semibold tracking-tight text-ink">Go CRM</div>
          <div className="text-xs text-muted">Reykjavík office</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                isActive(pathname, n.href) ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-4 text-xs">
          <div className="truncate text-ink-2" title={user?.email}>
            {user?.email}
          </div>
          <div className="mt-0.5 flex items-center justify-between text-muted">
            <span>{role === "viewer" ? "View only" : role === "admin" ? "Admin" : ""}</span>
            <button type="button" onClick={signOut} className="font-medium text-ink-2 hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-8">
        <div className="text-base font-semibold text-ink md:hidden">Go CRM</div>
        <div className="hidden md:block" />
        <div className="flex items-center gap-2">
          <CurrencySwitch />
          <button type="button" onClick={signOut} className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 md:hidden">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">{mounted ? children : <Loading />}</main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cx(
              "flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium",
              isActive(pathname, n.href) ? "text-accent" : "text-muted",
            )}
          >
            {n.icon}
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
