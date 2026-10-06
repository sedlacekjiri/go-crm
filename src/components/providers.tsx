"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Currency } from "@/lib/analytics";
import { fetchLatestEurIsk } from "@/lib/fx";
import { supabase } from "@/lib/supabase";

// ── Auth ────────────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  role: "admin" | "viewer" | null;
  isAdmin: boolean;
  ready: boolean;
}
const AuthContext = createContext<AuthState>({ user: null, role: null, isAdmin: false, ready: false });
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, role: null, isAdmin: false, ready: false });

  useEffect(() => {
    const load = async (user: User | null) => {
      if (!user) return setState({ user: null, role: null, isAdmin: false, ready: true });
      const { data } = await supabase().from("app_users").select("role").eq("user_id", user.id).maybeSingle();
      const role = (data?.role as AuthState["role"]) ?? null;
      setState({ user, role, isAdmin: role === "admin", ready: true });
    };
    supabase()
      .auth.getUser()
      .then(({ data }) => load(data.user));
    const { data: sub } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") load(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

// ── Currency (EUR / ISK toggle + today's ECB rate) ───────────────
interface CurrencyState {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  eurIsk: number | null;
  rateDate: string | null;
}
const CurrencyContext = createContext<CurrencyState>({ currency: "EUR", setCurrency: () => {}, eurIsk: null, rateDate: null });
export const useCurrency = () => useContext(CurrencyContext);

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};
export { storage };

// Currency choice lives in localStorage; useSyncExternalStore keeps server render ("EUR") and client in sync.
const currencyListeners = new Set<() => void>();
const currencyStore = {
  subscribe(cb: () => void) {
    currencyListeners.add(cb);
    return () => currencyListeners.delete(cb);
  },
  get: (): Currency => (storage.get("currency") === "ISK" ? "ISK" : "EUR"),
  set(c: Currency) {
    storage.set("currency", c);
    currencyListeners.forEach((cb) => cb());
  },
};

function CurrencyProvider({ children }: { children: ReactNode }) {
  const currency = useSyncExternalStore(currencyStore.subscribe, currencyStore.get, () => "EUR" as Currency);
  const [rate, setRate] = useState<{ rate: number; date: string } | null>(null);

  useEffect(() => {
    (async () => {
      const cached = storage.get("eurIsk");
      const parsed = cached ? (JSON.parse(cached) as { rate: number; date: string; fetched: number }) : null;
      if (parsed) setRate(parsed);
      if (parsed && Date.now() - parsed.fetched < 6 * 3600_000) return;
      try {
        const fresh = await fetchLatestEurIsk();
        setRate(fresh);
        storage.set("eurIsk", JSON.stringify({ ...fresh, fetched: Date.now() }));
      } catch {
        // Offline – keep the cached rate.
      }
    })();
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency: currencyStore.set, eurIsk: rate?.rate ?? null, rateDate: rate?.date ?? null }}>
      {children}
    </CurrencyContext.Provider>
  );
}

// ── Toasts ──────────────────────────────────────────────────────
type Toast = { id: number; text: string; kind: "ok" | "error" };
const ToastContext = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 2500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "pointer-events-auto max-w-sm rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg " +
              (t.kind === "error" ? "bg-bad text-white" : "bg-ink text-bg")
            }
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <ToastProvider>{children}</ToastProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
}
