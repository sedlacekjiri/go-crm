// Sticky notes in Tasks: quick things to remember that aren't really tasks.
// Colours, pin to top (pinned ones also show above the calendar), link to a partner, turn into a task.
import { categoryTag } from '../components.js';
import { TASK_CATEGORIES, today } from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { esc, openModal, options, shortDate, toast } from '../util.js';

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'];
const SAMPLES = ['Ask Anna at Borg about the GM’s day off', 'Flyers almost gone at KEX – bring 50', 'Idea: winter tyre checklist for guests'];

const sticky = (n, { compact = false } = {}) => {
  const partner = state.partners.find((p) => p.id === n.partner_id);
  return `<article class="sticky c-${esc(n.color)} ${compact ? 'compact' : ''}" data-note="${n.id}" tabindex="0">
    ${n.pinned ? '<span class="pin" title="Pinned">📌</span>' : ''}
    <p>${esc(n.text)}</p>
    <footer>
      <span>${[n.category ? categoryTag(n.category) : '', partner ? `<a href="#/partner/${partner.id}">${esc(partner.name)}</a>` : '', compact ? '' : esc(shortDate(n.updated_at.slice(0, 10)))].filter(Boolean).join(' ')}</span>
      ${
        isAdmin() && !compact
          ? `<span class="sticky-acts">
              <button type="button" data-pin="${n.id}" title="${n.pinned ? 'Unpin' : 'Pin to top'}" aria-label="${n.pinned ? 'Unpin' : 'Pin'}">${n.pinned ? 'Unpin' : '📌 Pin'}</button>
              <button type="button" data-to-task="${n.id}" title="Turn into a task" aria-label="Turn into a task">→ Task</button>
              <button type="button" data-del-note="${n.id}" title="Delete" aria-label="Delete">×</button>
            </span>`
          : ''
      }
    </footer>
  </article>`;
};

// Pinned notes above the calendar.
export function pinnedStrip(category) {
  const pinned = state.notes.filter((n) => n.pinned && (!category || !n.category || n.category === category));
  if (!pinned.length) return '';
  return `<div class="pinned-strip">${pinned.map((n) => sticky(n, { compact: true })).join('')}<a class="pinned-more" href="#/tasks?tab=notes">All notes →</a></div>`;
}

export function renderBoard(el, category, refresh) {
  const admin = isAdmin();
  const list = state.notes.filter((n) => !category || !n.category || n.category === category);
  let color = 'yellow';
  el.innerHTML = `
    ${
      admin
        ? `<form class="sticky-new c-yellow" data-new-note>
            <textarea name="text" rows="3" placeholder="${esc(SAMPLES[Math.floor(Math.random() * SAMPLES.length)])}…" aria-label="New note"></textarea>
            <div class="sticky-new-foot">
              <span class="colors">${NOTE_COLORS.map((c) => `<button type="button" class="dot c-${c}" data-color="${c}" aria-pressed="${c === color}" aria-label="${c}"></button>`).join('')}</span>
              <span class="muted small">⌘/Ctrl + Enter</span>
              <button class="btn sm" type="submit">Stick it</button>
            </div>
          </form>`
        : ''
    }
    ${list.length ? `<div class="sticky-board">${list.map((n) => sticky(n)).join('')}</div>` : `<p class="empty" style="margin-top:12px">No notes yet${admin ? ' – write the first one above.' : '.'}</p>`}`;

  const form = el.querySelector('[data-new-note]');
  if (form) {
    form.querySelector('.colors').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      color = b.dataset.color;
      form.className = `sticky-new c-${color}`;
      form.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    const submit = async () => {
      const text = form.text.value.trim();
      if (!text) return form.text.focus();
      try {
        await api('/api/notes', { method: 'POST', body: { text, color, category: category || null } });
        toast('Note added');
        await refresh();
        document.querySelector('[data-new-note] textarea')?.focus(); // the board was redrawn
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    form.text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    });
  }
}

// Click handling for both the board and the pinned strip (call from the page's click handler).
// Returns true when the click was about a note.
export async function handleNoteClick(e, refresh) {
  const b = e.target.closest('button');
  const d = b?.dataset ?? {};
  if (d.pin || d.toTask || d.delNote) {
    const n = state.notes.find((x) => x.id === (d.pin || d.toTask || d.delNote));
    try {
      if (d.pin) await api('/api/notes', { method: 'POST', body: { id: n.id, pinned: !n.pinned } });
      else if (d.delNote) {
        if (!confirm('Delete this note?')) return true;
        await api(`/api/notes?id=${n.id}`, { method: 'DELETE' });
      } else {
        // Turn into a task for today; the note goes away.
        const title = n.text.split('\n')[0].slice(0, 200);
        const rest = n.text.slice(title.length).trim();
        await api('/api/tasks', { method: 'POST', body: { type: 'todo', title, notes: rest || null, category: n.category || 'sales', partner_id: n.partner_id, due_date: today() } });
        await api(`/api/notes?id=${n.id}`, { method: 'DELETE' });
        toast('Moved to today’s tasks');
      }
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
    return true;
  }
  const card = e.target.closest('[data-note]');
  if (card && !e.target.closest('a') && isAdmin()) {
    noteModal(state.notes.find((x) => x.id === card.dataset.note), refresh);
    return true;
  }
  return false;
}

function noteModal(n, refresh) {
  let color = n.color;
  const m = openModal(
    'Note',
    `<form>
      <textarea class="input sticky-edit c-${esc(color)}" name="text" rows="6" required>${esc(n.text)}</textarea>
      <div class="colors">${NOTE_COLORS.map((c) => `<button type="button" class="dot c-${c}" data-color="${c}" aria-pressed="${c === color}" aria-label="${c}"></button>`).join('')}</div>
      <div class="form-grid">
        <label class="field"><span>About a partner</span><select class="input" name="partner_id">${options(
          state.partners.map((p) => ({ value: p.id, label: p.name })),
          n.partner_id,
          { empty: '–' }
        )}</select></label>
        <label class="field"><span>Category</span><select class="input" name="category">${options(TASK_CATEGORIES, n.category, { empty: 'Both' })}</select></label>
      </div>
      <label class="check"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''} /> Pin to the top of Tasks</label>
      <button class="btn block" type="submit">Save</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  m.el.querySelector('.colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    color = b.dataset.color;
    form.text.className = `input sticky-edit c-${color}`;
    m.el.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/notes', {
        method: 'POST',
        body: { id: n.id, text: form.text.value, color, pinned: form.pinned.checked, partner_id: form.partner_id.value || null, category: form.category.value || null },
      });
      m.close();
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
