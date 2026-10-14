// "Assigned to" picker (team photos) used in the task and post windows. Tap a person to assign,
// tap them again to leave it unassigned.
import { avatar } from './components.js';
import { isTeamAdmin, state, userById } from './store.js';
import { esc } from './util.js';

export const assigneeFieldHtml = (assigned, what = 'tasks') => `
  <div class="field"><span>Assigned to</span><div class="chips wrap-chips people" data-assignee>${state.users
    .map((u) => `<button type="button" data-v="${u.id}" aria-pressed="${u.id === assigned}">${avatar(u, 22)}${esc(u.id === state.me?.id ? `${u.name.split(' ')[0]} (me)` : u.name.split(' ')[0])}</button>`)
    .join('')}</div><small>${
    state.users.length < 2 ? `Only you so far${isTeamAdmin() ? ` – add colleagues in Team (sidebar) to hand ${what} over` : ''}.` : 'Tap the selected person again to leave it unassigned.'
  }</small></div>`;

// Returns () => the chosen user id (or null).
export function mountAssignee(root, assigned) {
  let current = userById(assigned) ? assigned : null;
  root.querySelector('[data-assignee]')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    current = current === b.dataset.v ? null : b.dataset.v;
    root.querySelectorAll('[data-assignee] button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === current)));
  });
  return () => current;
}

// Per-subtask person: a compact select in the editors, a small photo in the lists.
export const subAssigneeSelect = (i, value) =>
  state.users.length > 1
    ? `<select class="input sub-who" data-w="${i}" aria-label="Subtask assigned to">${['<option value="">Anyone</option>', ...state.users.map((u) => `<option value="${esc(u.id)}" ${u.id === value ? 'selected' : ''}>${esc(u.name.split(' ')[0])}</option>`)].join('')}</select>`
    : '';
export const subPerson = (st) => {
  const u = userById(st.assignee_id);
  return u ? `<span class="who" title="${esc(u.name)}">${avatar(u, 18)}</span>` : '';
};
