// Global search (top bar / ⌘K): partners, tasks, posts, events and collaborators in one list.
import { eventModal } from './events.js';
import { typeLabel } from './lib.js';
import { can, state } from './store.js';
import { esc, shortDate } from './util.js';
import { postModal } from './views/marketing.js';
import { taskModal } from './views/tasks.js';

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const PER_GROUP = 5;

// Best matches first: the name starts with the query, then a word starts with it, then anywhere.
function score(text, q) {
  const t = norm(text);
  if (t.startsWith(q)) return 3;
  if (t.includes(` ${q}`)) return 2;
  return t.includes(q) ? 1 : 0;
}

function groups(query, { navigate, refresh }) {
  const q = norm(query.trim());
  if (!q) return [];
  const pick = (items, label, fields) =>
    items
      .map((x) => ({ x, s: Math.max(score(label(x), q) * 2, ...fields(x).map((f) => score(f, q))) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, PER_GROUP)
      .map((r) => r.x);
  const out = [];
  if (can('sales')) {
    const partners = pick(state.partners, (p) => p.name, (p) => [p.chain, p.area, p.city]);
    out.push({
      title: 'Partners',
      items: partners.map((p) => ({ label: p.name, meta: [typeLabel(p.type), p.area].filter(Boolean).join(' · '), open: () => navigate(`#/partner/${p.id}`) })),
    });
  }
  const partnerName = (t) => state.partners.find((p) => p.id === t.partner_id)?.name ?? '';
  const taskLabel = (t) => t.title || `Visit – ${partnerName(t)}`;
  const tasks = pick(
    [...state.tasks].sort((a, b) => Number(!!a.done) - Number(!!b.done)),
    taskLabel,
    (t) => [partnerName(t), t.notes]
  );
  out.push({
    title: 'Tasks',
    items: tasks.map((t) => ({ label: taskLabel(t), meta: t.done ? 'Done' : t.due_date ? `Due ${shortDate(t.due_date)}` : '', done: !!t.done, open: () => taskModal(t, refresh) })),
  });
  if (can('marketing')) {
    const posts = pick(state.posts, (p) => p.title, (p) => [p.caption]);
    out.push({
      title: 'Posts',
      items: posts.map((p) => ({ label: p.title, meta: p.publish_date ? shortDate(p.publish_date) : 'No date', open: () => postModal(p, refresh) })),
    });
    const collabs = pick(state.collaborators, (c) => c.name, (c) => [c.socials, c.booking_ref]);
    out.push({
      title: 'Collaborators',
      items: collabs.map((c) => ({ label: c.name, meta: c.vehicle ?? '', open: () => navigate('#/collaborators') })),
    });
  }
  const events = pick(state.events ?? [], (e) => e.title, (e) => [e.location]);
  out.push({
    title: 'Events',
    items: events.map((e) => ({ label: e.title, meta: [shortDate(e.date), e.location].filter(Boolean).join(' · '), open: () => eventModal(e, refresh) })),
  });
  return out.filter((g) => g.items.length);
}

// Wires an input + results box. `onDone` runs after a result is opened (e.g. close the phone sheet).
export function mountSearch(input, box, ctx, onDone = () => {}) {
  let flat = [];
  let active = 0;
  const show = (on) => (box.hidden = !on);
  const paint = () => {
    const list = groups(input.value, ctx);
    flat = list.flatMap((g) => g.items);
    active = Math.min(active, Math.max(0, flat.length - 1));
    if (!input.value.trim()) return show(false);
    let i = 0;
    box.innerHTML = flat.length
      ? list
          .map(
            (g) =>
              `<div class="sr-group">${g.title}</div>` +
              g.items
                .map((it) => {
                  const n = i++;
                  return `<button type="button" class="sr-item${n === active ? ' on' : ''}${it.done ? ' done' : ''}" data-i="${n}"><b>${esc(it.label)}</b>${it.meta ? `<small>${esc(it.meta)}</small>` : ''}</button>`;
                })
                .join('')
          )
          .join('')
      : `<div class="sr-empty">Nothing found for “${esc(input.value.trim())}”</div>`;
    show(true);
  };
  const open = (n) => {
    const it = flat[n];
    if (!it) return;
    input.value = '';
    show(false);
    input.blur();
    onDone();
    it.open();
  };
  input.addEventListener('input', () => {
    active = 0;
    paint();
  });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', () => setTimeout(() => show(false), 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length;
      paint();
      box.querySelector('.sr-item.on')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(active);
    } else if (e.key === 'Escape') {
      input.value = '';
      show(false);
      input.blur();
    }
  });
  // mousedown so the click lands before the input's blur hides the list
  box.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    e.preventDefault();
    open(Number(b.dataset.i));
  });
}
