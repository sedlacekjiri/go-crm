// Comments under a task or a post: the thread, @mentions with a people picker, emoji reactions.
import { avatar } from './components.js';
import { decodeMentions, encodeMentions, mentionLabel } from './lib.js';
import { api, isAdmin, isTeamAdmin, state, userById } from './store.js';
import { esc, toast } from './util.js';

export const REACTIONS = ['👍', '❤️', '🎉', '😂', '👀', '✅'];

export const commentsOf = (type, id) => (id ? (state.comments ?? []).filter((c) => c.parent_type === type && c.parent_id === id) : []);
const readAt = (type, id) => (state.commentReads ?? []).find((r) => r.parent_type === type && r.parent_id === id)?.read_at ?? '';
export const unreadCount = (type, id) => commentsOf(type, id).filter((c) => c.created_by !== state.me?.id && c.created_at > readAt(type, id)).length;

// "💬 3" in list rows; highlighted while there's something new.
export function commentChip(type, id) {
  const n = commentsOf(type, id).length;
  if (!n) return '';
  const fresh = unreadCount(type, id);
  return `<span class="c-chip${fresh ? ' new' : ''}" title="${fresh ? `${fresh} new comment${fresh > 1 ? 's' : ''}` : `${n} comment${n > 1 ? 's' : ''}`}">💬 ${n}</span>`;
}

export function timeAgo(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Escaped text with mentions as chips and links clickable.
export function bodyHtml(text) {
  return esc(text)
    .replace(/&lt;@([\w-]+)&gt;/g, (m, id) => {
      const u = userById(id);
      return `<span class="mention${id === state.me?.id ? ' me' : ''}">@${esc(u ? u.name.split(' ')[0] : 'someone')}</span>`;
    })
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`);
}

// People who can be mentioned: on posts only those with Marketing (they couldn't open it otherwise).
const mentionable = (type) => (state.users ?? []).filter((u) => type !== 'post' || (u.sections ?? []).includes('marketing'));

export const commentsHtml = (type, id) =>
  id
    ? `<section class="comments" data-comments>
        <h3 class="c-title">Comments <span class="muted" data-c-count></span></h3>
        <ul class="c-list" data-c-list></ul>
        ${
          isAdmin()
            ? `<div class="c-compose">${avatar(state.me, 30)}<div class="c-box">
                <textarea class="input" rows="2" data-c-input placeholder="Write a comment… type @ to mention someone"></textarea>
                <div class="mention-pop" data-c-pop hidden></div>
                <div class="c-actions"><small class="muted">⌘ + Enter to send</small><button type="button" class="btn sm" data-c-send>Comment</button></div>
              </div></div>`
            : ''
        }
      </section>`
    : `<p class="muted small c-later">Comments are available once it’s saved.</p>`;

// Wires the comments section inside `root` and marks the thread as read.
export function mountComments(root, type, id) {
  // The bell in the top bar and the 💬 counts in lists listen for this.
  const onChange = () => window.dispatchEvent(new Event('go-crm:comments'));
  const section = root.querySelector('[data-comments]');
  if (!section) return;
  const list = section.querySelector('[data-c-list]');
  const users = state.users ?? [];
  let editing = null;
  let picker = null; // comment id whose reaction picker is open

  const draw = () => {
    const items = commentsOf(type, id);
    section.querySelector('[data-c-count]').textContent = items.length ? `· ${items.length}` : '';
    list.innerHTML = items.length
      ? items
          .map((c) => {
            const u = userById(c.created_by);
            const mine = c.created_by === state.me?.id;
            const reacts = Object.entries(c.reactions ?? {})
              .filter(([, who]) => who.length)
              .map(
                ([e, who]) =>
                  `<button type="button" class="react${who.includes(state.me?.id) ? ' on' : ''}" data-react="${e}" data-id="${c.id}" title="${esc(who.map((w) => userById(w)?.name.split(' ')[0] ?? '?').join(', '))}">${e} ${who.length}</button>`
              )
              .join('');
            return `<li class="c-item${(c.mentions ?? []).includes(state.me?.id) ? ' for-me' : ''}">
              ${avatar(u ?? { name: '?' }, 30)}
              <div class="c-main">
                <div class="c-head"><b>${esc(u?.name ?? 'Former colleague')}</b><span class="muted">${timeAgo(c.created_at)}${c.edited_at ? ' · edited' : ''}</span>
                  ${isAdmin() ? `<span class="c-tools">${mine ? `<button type="button" class="link-btn muted" data-edit="${c.id}">Edit</button>` : ''}${mine || isTeamAdmin() ? `<button type="button" class="link-btn muted" data-del="${c.id}">Delete</button>` : ''}</span>` : ''}</div>
                ${
                  editing === c.id
                    ? `<div class="c-box"><textarea class="input c-edit" rows="2" data-edit-input>${esc(decodeMentions(c.body, users))}</textarea><div class="mention-pop" data-edit-pop hidden></div></div>
                       <div class="c-actions"><button type="button" class="link-btn muted" data-cancel>Cancel</button><button type="button" class="btn sm" data-save="${c.id}">Save</button></div>`
                    : `<div class="c-body">${bodyHtml(c.body)}</div>`
                }
                <div class="c-reacts">${reacts}${
                  isAdmin()
                    ? `<button type="button" class="react add" data-pick="${c.id}" aria-label="Add reaction">☺︎+</button>${
                        picker === c.id ? `<span class="react-pick">${REACTIONS.map((e) => `<button type="button" data-react="${e}" data-id="${c.id}">${e}</button>`).join('')}</span>` : ''
                      }`
                    : ''
                }</div>
              </div>
            </li>`;
          })
          .join('')
      : '<li class="muted small c-none">No comments yet.</li>';
    const ed = list.querySelector('[data-edit-input]');
    if (ed) {
      wireMentions(ed, ed.parentElement.querySelector('[data-edit-pop]'), type);
      ed.focus();
    }
  };

  const replace = (row) => {
    state.comments ??= [];
    const i = state.comments.findIndex((x) => x.id === row.id);
    if (i >= 0) state.comments[i] = row;
    else state.comments.push(row);
  };

  list.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.react) {
        replace(await api('/api/comments', { method: 'PATCH', body: { id: b.dataset.id, react: b.dataset.react } }));
        picker = null;
      } else if (b.dataset.pick) picker = picker === b.dataset.pick ? null : b.dataset.pick;
      else if (b.dataset.edit) editing = b.dataset.edit;
      else if ('cancel' in b.dataset) editing = null;
      else if (b.dataset.save) {
        const text = list.querySelector('[data-edit-input]').value.trim();
        if (!text) return;
        replace(await api('/api/comments', { method: 'PATCH', body: { id: b.dataset.save, body: encodeMentions(text, users) } }));
        editing = null;
      } else if (b.dataset.del) {
        if (!confirm('Delete this comment?')) return;
        await api(`/api/comments?id=${b.dataset.del}`, { method: 'DELETE' });
        state.comments = state.comments.filter((x) => x.id !== b.dataset.del);
      } else return;
      draw();
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  const input = section.querySelector('[data-c-input]');
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    try {
      const row = await api('/api/comments', { method: 'POST', body: { parent_type: type, parent_id: id, body: encodeMentions(text, users) } });
      (state.comments ??= []).push(row);
      markRead(type, id, row.created_at);
      input.value = '';
      draw();
      onChange();
      list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  if (input) {
    wireMentions(input, section.querySelector('[data-c-pop]'), type, send);
    section.querySelector('[data-c-send]').addEventListener('click', send);
  }
  draw();
  if (unreadCount(type, id)) {
    api('/api/comments', { method: 'PUT', body: { parent_type: type, parent_id: id } })
      .then((r) => {
        markRead(type, id, r.read_at);
        onChange();
      })
      .catch(() => {});
  }
}

function markRead(type, id, at) {
  const reads = (state.commentReads ??= []);
  const r = reads.find((x) => x.parent_type === type && x.parent_id === id);
  if (r) r.read_at = at;
  else reads.push({ parent_type: type, parent_id: id, read_at: at });
}

// "@" in a textarea opens a list of teammates; arrows / Enter / Tab pick one.
function wireMentions(input, pop, type, onSubmit) {
  const users = state.users ?? [];
  let matches = [];
  let active = 0;
  const query = () => {
    const before = input.value.slice(0, input.selectionStart);
    const m = before.match(/(^|\s)@([^\s@]{0,20})$/u);
    return m ? m[2] : null;
  };
  const close = () => {
    pop.hidden = true;
    matches = [];
  };
  const paint = () => {
    const q = query();
    if (q === null) return close();
    const nq = q.toLowerCase();
    matches = mentionable(type)
      .filter((u) => u.name.toLowerCase().split(' ').some((part) => part.startsWith(nq)))
      .slice(0, 6);
    if (!matches.length) return close();
    active = Math.min(active, matches.length - 1);
    pop.innerHTML = matches.map((u, i) => `<button type="button" class="${i === active ? 'on' : ''}" data-u="${i}">${avatar(u, 22)}<span>${esc(u.name)}</span></button>`).join('');
    pop.hidden = false;
  };
  const pick = (u) => {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos).replace(/@([^\s@]{0,20})$/u, `@${mentionLabel(u, users)} `);
    input.value = before + input.value.slice(pos);
    input.setSelectionRange(before.length, before.length);
    close();
    input.focus();
  };
  input.addEventListener('input', () => {
    active = 0;
    paint();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => {
    if (matches.length && !pop.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
        return paint();
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        return pick(matches[active]);
      }
      if (e.key === 'Escape') {
        e.stopPropagation(); // close the list, not the window
        return close();
      }
    }
    if (onSubmit && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  });
  pop.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-u]');
    if (!b) return;
    e.preventDefault();
    pick(matches[Number(b.dataset.u)]);
  });
}
