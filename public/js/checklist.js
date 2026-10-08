// Checklist (subtasks) editor used in the post window, and the inline tick list on post cards.
import { subtaskProgress } from './lib.js';
import { esc } from './util.js';

export const progressPill = (item) => {
  const { done, total } = subtaskProgress(item);
  if (!total) return '';
  return `<span class="sub-toggle static ${done === total ? 'complete' : ''}"><span class="sub-bar"><i style="width:${(done / total) * 100}%"></i></span>${done}/${total}</span>`;
};

// Inline list with tick buttons. The page handles clicks on [data-cl-toggle] via toggleInList().
export const inlineChecklist = (item, canEdit) =>
  (item.subtasks ?? []).length
    ? `<ul class="cl-inline">${item.subtasks
        .map(
          (st) => `<li class="${st.done ? 'done' : ''}">${
            canEdit
              ? `<button type="button" class="tick sm ${st.done ? 'on' : ''}" data-cl-toggle="${esc(item.id)}" data-sub="${esc(st.id)}" aria-label="${st.done ? 'Mark not done' : 'Mark done'}">${st.done ? '✓' : ''}</button>`
              : `<span class="tick sm ${st.done ? 'on' : ''}">${st.done ? '✓' : ''}</span>`
          }<span>${esc(st.title)}</span></li>`
        )
        .join('')}</ul>`
    : '';

export const toggleInList = (list, subId) => (list ?? []).map((st) => (st.id === subId ? { ...st, done: !st.done } : st));

export const editorHtml = (templateLabel) => `
  <div class="field"><span>Checklist</span>
    <ul class="sub-edit" data-cl-list></ul>
    <div class="sub-add"><input class="input" data-cl-new placeholder="Add a step and press Enter" autocomplete="off" /><button class="btn secondary sm" type="button" data-cl-add>Add</button></div>
    ${templateLabel ? `<button type="button" class="link-btn" data-cl-template style="align-self:flex-start">${esc(templateLabel)}</button>` : ''}
  </div>`;

// Wires the editor inside `root`. getTemplate() returns step titles to add. Returns () => current list.
export function mountEditor(root, initial, getTemplate) {
  let items = (initial ?? []).map((s) => ({ ...s }));
  const list = root.querySelector('[data-cl-list]');
  const draw = () => {
    list.innerHTML = items
      .map(
        (s, i) => `<li><input type="checkbox" data-i="${i}" ${s.done ? 'checked' : ''} aria-label="Done" />
          <input class="input" data-t="${i}" value="${esc(s.title)}" /><button type="button" class="link-btn muted" data-x="${i}" aria-label="Remove">×</button></li>`
      )
      .join('');
  };
  draw();
  list.addEventListener('change', (e) => {
    if (e.target.dataset.i !== undefined) items[e.target.dataset.i].done = e.target.checked;
    if (e.target.dataset.t !== undefined) items[e.target.dataset.t].title = e.target.value;
  });
  list.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    items.splice(Number(x.dataset.x), 1);
    draw();
  });
  const input = root.querySelector('[data-cl-new]');
  const add = () => {
    const title = input.value.trim();
    if (!title) return;
    items.push({ title, done: false });
    input.value = '';
    draw();
    input.focus();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });
  root.querySelector('[data-cl-add]').addEventListener('click', add);
  root.querySelector('[data-cl-template]')?.addEventListener('click', () => {
    const have = new Set(items.map((s) => s.title.toLowerCase()));
    for (const title of getTemplate()) if (!have.has(title.toLowerCase())) items.push({ title, done: false });
    draw();
  });
  return () => items.filter((s) => s.title.trim());
}
