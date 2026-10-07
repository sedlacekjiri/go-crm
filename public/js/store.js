// Password, API calls, loaded data and the EUR/ISK setting.
import { storage } from './util.js';

const TOKEN_KEY = 'go-crm-password';

let token = null;
try {
  token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
} catch {}

export const hasToken = () => !!token;

export function setToken(value, remember) {
  token = value;
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (value) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, value);
  } catch {}
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('go-crm:logout'));
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

// ── Loaded data ────────────────────────────────────────────────
export const state = {
  role: null,
  partners: [],
  contacts: [],
  activities: [],
  tasks: [],
  posts: [],
  affiliates: [],
  payouts: [],
  notes: [],
  goals: [],
  salesInfo: null,
};

export const isAdmin = () => state.role === 'admin';

export async function loadData() {
  const data = await api('/api/data');
  Object.assign(state, data);
  return state;
}

// Sales are loaded per period and cached until the next import.
const salesCache = new Map();
export async function loadSales(from, to) {
  const key = `${from}|${to}`;
  if (!salesCache.has(key)) salesCache.set(key, api(`/api/sales?from=${from}&to=${to}`).catch((e) => (salesCache.delete(key), Promise.reject(e))));
  return salesCache.get(key);
}
export const clearSalesCache = () => salesCache.clear();

// ── Currency ───────────────────────────────────────────────────
export const currency = {
  value: storage.get('go-crm-currency') === 'ISK' ? 'ISK' : 'EUR',
  rate: null, // today's EUR→ISK
  rateDate: null,
  set(c) {
    this.value = c;
    storage.set('go-crm-currency', c);
    window.dispatchEvent(new Event('go-crm:currency'));
  },
};

const FX = 'https://api.frankfurter.dev/v1';

export async function loadTodayRate() {
  try {
    const cached = JSON.parse(storage.get('go-crm-eurisk') || 'null');
    if (cached) Object.assign(currency, { rate: cached.rate, rateDate: cached.date });
    if (cached && Date.now() - cached.fetched < 6 * 3600_000) return;
    const res = await fetch(`${FX}/latest?from=EUR&to=ISK`);
    const json = await res.json();
    Object.assign(currency, { rate: json.rates.ISK, rateDate: json.date });
    storage.set('go-crm-eurisk', JSON.stringify({ rate: json.rates.ISK, date: json.date, fetched: Date.now() }));
  } catch {
    // offline – keep cached rate
  }
}

// Daily ECB rates for an import: { 'YYYY-MM-DD': { ISK, USD, … } }. Starts a week early so
// bookings on the first days (weekends) still have an earlier rate.
export async function fetchDailyRates(start, end, currencies) {
  const symbols = [...new Set(['ISK', ...currencies.filter((c) => c !== 'EUR')])].join(',');
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  const res = await fetch(`${FX}/${d.toISOString().slice(0, 10)}..${end}?from=EUR&to=${symbols}`);
  if (!res.ok) throw new Error(`Exchange rate request failed (${res.status})`);
  return (await res.json()).rates;
}
