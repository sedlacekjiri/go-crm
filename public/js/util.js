// DOM + formatting helpers shared by all views.
import { today } from './lib.js';

// Escape text before putting it into innerHTML – every user-entered value goes through this.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const storage = {
  get(key, fallback = null) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {}
  },
};

// ── Numbers & money ─────────────────────────────────────────────
export function money(value, cur, compact = false) {
  const v = Number(value) || 0;
  if (cur === 'ISK') {
    return `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard' }).format(v)} kr`;
  }
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: compact || Math.abs(v) >= 1000 ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(v);
}

export const num = (value, digits = 0) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(Number(value) || 0);
export const pct = (part, whole) => (whole ? `${num((part / whole) * 100, 1)} %` : '–');

// ── Dates ──────────────────────────────────────────────────────
const asDate = (d) => new Date(d.length === 10 ? `${d}T00:00:00` : d);

export const shortDate = (d) => (d ? asDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–');
export const fullDate = (d) => (d ? asDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const dateTime = (d) => asDate(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export function bucketLabel(key, g) {
  if (g === 'month') return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  return shortDate(key);
}

export function relativeDays(date) {
  const diff = Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${today()}T00:00:00`)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff < 0 ? `${-diff} days overdue` : `in ${diff} days`;
}

// Value for <input type="datetime-local"> in local time.
export function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ── Feedback ───────────────────────────────────────────────────
export function toast(text, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind === 'error' ? 'error' : ''}`;
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 2500);
}

// Modal dialog (a bottom sheet on phones). Returns { el, close }.
export function openModal(title, bodyHtml) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="modal-close" aria-label="Close">×</button></div>
      ${bodyHtml}
    </div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    if (!$('.modal-wrap')) document.documentElement.classList.remove('modal-open');
  };
  const onKey = (e) => e.key === 'Escape' && close();
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('.modal-close')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  document.documentElement.classList.add('modal-open');
  const first = wrap.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea');
  if (first && window.matchMedia('(min-width: 861px)').matches) first.focus();
  return { el: wrap, close };
}

// Read a <form> into a plain object (checkboxes → boolean).
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Could not copy', 'error');
  }
}

export const options = (list, selected, { empty } = {}) =>
  (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
  list
    .map((o) => {
      const value = typeof o === 'object' ? o.value : o;
      const label = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(value)}"${String(value) === String(selected ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
    })
    .join('');
