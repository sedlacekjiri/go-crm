// Small HTML snippets reused across views.
import { interestLabel, stageLabel, today } from './lib.js';
import { esc, relativeDays, shortDate } from './util.js';

export const stageBadge = (stage) => `<span class="stage ${esc(stage)}"><i></i>${esc(stageLabel(stage))}</span>`;

// Cold / warm / hot as 1–3 filled dots plus the word, so it never relies on color alone.
export function interestBadge(interest) {
  if (!interest) return '';
  return `<span class="interest" title="Interest: ${interestLabel(interest)}"><span class="dots">${[1, 2, 3]
    .map((i) => `<i class="${i <= interest ? 'on' : ''}"></i>`)
    .join('')}</span>${interestLabel(interest)}</span>`;
}

export function followUpPill(date) {
  if (!date) return '<span class="pill">No follow-up</span>';
  const t = today();
  const cls = date < t ? 'overdue' : date === t ? 'today' : '';
  return `<span class="pill ${cls}">${date < t ? '⚠ ' : ''}${shortDate(date)} · ${relativeDays(date)}</span>`;
}

export const pageHeader = (title, sub, controls = '') => `
  <header class="top">
    <div><h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div>
    ${controls ? `<div class="controls">${controls}</div>` : ''}
  </header>`;

export const kpi = (label, value, delta = '') => `
  <div class="kpi"><div class="label">${esc(label)}</div><div class="value num">${value}</div><div class="delta">${delta}</div></div>`;

export const miniKpi = (label, value, delta = '') => `
  <div class="mini-kpi"><div class="label">${esc(label)}</div><div class="value num">${value}</div>${delta ? `<div class="delta">${delta}</div>` : ''}</div>`;

export const seg = (name, value, opts) =>
  `<div class="seg" data-seg="${name}">${opts
    .map((o) => `<button type="button" data-value="${esc(o.value)}" aria-pressed="${String(o.value) === String(value)}">${esc(o.label)}</button>`)
    .join('')}</div>`;

// Wires a seg control: calls onChange(value) on click.
export function onSeg(root, name, onChange) {
  root.querySelector(`[data-seg="${name}"]`)?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (b) onChange(b.dataset.value);
  });
}

export const emptyBox = (title, body = '') => `<div class="empty-box"><b>${esc(title)}</b>${body}</div>`;

export const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  partners: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/></svg>',
  pipeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg>',
  sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M6 20V11M11 20V5M16 20v-6M21 20V9"/></svg>',
  goals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
};
