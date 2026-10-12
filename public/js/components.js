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

// Channel tags: short code + coloured dot, so identity never relies on colour alone.
export const channelTags = (channels = []) =>
  channels.map((c) => `<span class="ch ch-${esc(c)}" title="${esc(CHANNEL_NAMES[c] ?? c)}"><i></i>${esc(CHANNEL_SHORT[c] ?? c)}</span>`).join('');
const CHANNEL_NAMES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', google: 'Google', youtube: 'YouTube' };
const CHANNEL_SHORT = { instagram: 'IG', facebook: 'FB', tiktok: 'TikTok', google: 'Google', youtube: 'YT' };

export const categoryTag = (c) => `<span class="cat cat-${c === 'marketing' ? 'marketing' : 'sales'}">${c === 'marketing' ? 'Marketing' : 'Sales'}</span>`;

export const emptyBox = (title, body = '') => `<div class="empty-box"><b>${esc(title)}</b>${body}</div>`;

export const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  partners: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 14l2.5 2.5L16 12"/></svg>',
  marketing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  collab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/><circle cx="9.5" cy="12" r="2.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  pipeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg>',
  sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M6 20V11M11 20V5M16 20v-6M21 20V9"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 17v-3M12 17v-6M15 17v-4"/></svg>',
  goals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
};

// Profile photo, or initials on a colour picked from the person's id.
const AVATAR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#8b5cf6', '#e87ba4', '#c98500', '#4a3aa7'];
export function avatar(u, size = 28) {
  if (!u) return '';
  const style = `width:${size}px;height:${size}px`;
  if (u.photo) return `<img class="avatar-img" src="${esc(u.photo)}" alt="" style="${style}" />`;
  const initials = (u.name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const color = AVATAR_COLORS[[...String(u.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length];
  return `<span class="avatar-ini" style="${style};background:${color};font-size:${Math.round(size * 0.4)}px">${esc(initials || '?')}</span>`;
}

// Small round photo of whoever a task is assigned to (nothing when unassigned).
export const assigneeAvatar = (u, size = 22) => (u ? `<span class="who" title="${esc(u.name)}">${avatar(u, size)}</span>` : '');

export const roleLabel = (r) => ({ owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'View only' })[r] ?? r;
