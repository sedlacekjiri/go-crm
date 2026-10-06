"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Activity, Contact, Goal, Partner, Sale } from "./types";

// Supabase returns at most 1000 rows per request – page through everything.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
}

const SALE_COLUMNS =
  "id,booking_ref,booking_date,pickup_date,return_date,brand,vehicle,rental_days,amount,currency,amount_eur,amount_isk,fx_eur_isk,affiliate_code,status,is_cancelled,customer_country";

export const api = {
  partners: () => fetchAll<Partner>((a, b) => supabase().from("partners").select("*").order("name").range(a, b)),
  partner: async (id: string) => {
    const { data, error } = await supabase().from("partners").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data as Partner | null;
  },
  contacts: async (partnerId: string) => {
    const { data, error } = await supabase()
      .from("contacts")
      .select("*")
      .eq("partner_id", partnerId)
      .order("is_primary", { ascending: false })
      .order("name");
    if (error) throw error;
    return data as Contact[];
  },
  activities: (opts: { partnerId?: string; since?: string } = {}) =>
    fetchAll<Activity>((a, b) => {
      let q = supabase().from("activities").select("id,partner_id,contact_id,type,happened_at,summary").order("happened_at", { ascending: false });
      if (opts.partnerId) q = q.eq("partner_id", opts.partnerId);
      if (opts.since) q = q.gte("happened_at", opts.since);
      return q.range(a, b);
    }),
  sales: (opts: { from?: string; to?: string; affiliateCode?: string } = {}) =>
    fetchAll<Sale>((a, b) => {
      let q = supabase().from("sales").select(SALE_COLUMNS).order("booking_date", { ascending: false }).order("booking_ref");
      if (opts.from) q = q.gte("booking_date", opts.from);
      if (opts.to) q = q.lte("booking_date", opts.to);
      if (opts.affiliateCode) q = q.ilike("affiliate_code", opts.affiliateCode.replace(/[%_\\]/g, "\\$&"));
      return q.range(a, b);
    }).then((rows) => rows.map((s) => ({ ...s, amount: Number(s.amount), amount_eur: Number(s.amount_eur), amount_isk: Number(s.amount_isk) }))),
  goals: async (months: string[]) => {
    const { data, error } = await supabase().from("goals").select("*").in("month", months);
    if (error) throw error;
    return (data as Goal[]).map((g) => ({ ...g, target: Number(g.target) }));
  },
};

export async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

// Tiny data hook: loads on mount / when deps change, exposes reload().
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    try {
      const data = await run();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [run]);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    run().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error) => !cancelled && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => {
      cancelled = true;
    };
  }, [run]);

  return { ...state, reload };
}
