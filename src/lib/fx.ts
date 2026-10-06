// Exchange rates from the European Central Bank via frankfurter.dev (free, no key).
// All rates are "1 EUR = x <currency>". ECB publishes on working days only, so a
// weekend/holiday date uses the most recent earlier rate.

const API = "https://api.frankfurter.dev/v1";

export type DailyRates = Record<string, Record<string, number>>; // date -> currency -> rate

export async function fetchLatestEurIsk(): Promise<{ rate: number; date: string }> {
  const res = await fetch(`${API}/latest?from=EUR&to=ISK`);
  if (!res.ok) throw new Error(`Exchange rate request failed (${res.status})`);
  const json = await res.json();
  return { rate: json.rates.ISK, date: json.date };
}

export async function fetchDailyRates(start: string, end: string, currencies: string[]): Promise<DailyRates> {
  const symbols = Array.from(new Set(["ISK", ...currencies.filter((c) => c !== "EUR")])).join(",");
  // Start a week early so the first days of the range always have a previous rate.
  const from = shiftDate(start, -7);
  const res = await fetch(`${API}/${from}..${end}?from=EUR&to=${symbols}`);
  if (!res.ok) throw new Error(`Exchange rate request failed (${res.status})`);
  const json = await res.json();
  return json.rates as DailyRates;
}

export function rateOn(rates: DailyRates, date: string, currency: string): number | undefined {
  if (currency === "EUR") return 1;
  let best: string | undefined;
  for (const d of Object.keys(rates)) {
    if (d <= date && rates[d][currency] !== undefined && (!best || d > best)) best = d;
  }
  // Booking dated after the latest published rate (e.g. today before 16:00 CET).
  if (!best) {
    for (const d of Object.keys(rates)) {
      if (rates[d][currency] !== undefined && (!best || d > best)) best = d;
    }
  }
  return best ? rates[best][currency] : undefined;
}

export function convert(
  amount: number,
  currency: string,
  date: string,
  rates: DailyRates,
): { amount_eur: number; amount_isk: number; fx_eur_isk: number } {
  const eurIsk = rateOn(rates, date, "ISK");
  if (!eurIsk) throw new Error(`No EUR/ISK rate for ${date}`);
  if (currency === "ISK") {
    return { amount_eur: round(amount / eurIsk, 2), amount_isk: Math.round(amount), fx_eur_isk: eurIsk };
  }
  const curRate = rateOn(rates, date, currency);
  if (!curRate) throw new Error(`No EUR/${currency} rate for ${date}`);
  const eur = amount / curRate;
  return { amount_eur: round(eur, 2), amount_isk: Math.round(eur * eurIsk), fx_eur_isk: eurIsk };
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
