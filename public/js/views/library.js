// Marketing → Files: every file in the CRM in one place – uploaded here, or attached to a task or a
// post – sorted into folders, with search and sorting. Drop files anywhere on the page to upload.
import { avatar, emptyBox, pageHeader } from '../components.js';
import { fileIcon, openFile, sizeText } from '../files.js';
import { api, isAdmin, state, uploadFile, userById } from '../store.js';
import { esc, formData, openModal, options, shortDate, toast } from '../util.js';
import { postModal } from './marketing.js';
import { taskModal } from './tasks.js';

const MAX_BYTES = 1.5 * 1024 * 1024;
const v = { folder: '', q: '', sort: 'new', source: '' }; // folder: '' all | 'none' | folder id

const SORTS = [
  { value: 'new', label: 'Newest first' },
  { value: 'old', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'size', label: 'Biggest first' },
];
const SOURCES = [
  { value: 'library', label: 'Uploaded here' },
  { value: 'task', label: 'From tasks' },
  { value: 'post', label: 'From posts' },
];
const SORTERS = {
  new: (a, b) => b.created_at.localeCompare(a.created_at),
  old: (a, b) => a.created_at.localeCompare(b.created_at),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  size: (a, b) => b.size - a.size,
};

// What a file is attached to: { label, open } or null for files uploaded on this page.
function source(f) {
  if (f.parent_type === 'task') {
    const t = state.tasks.find((x) => x.id === f.parent_id);
    return t ? { kind: 'Task', title: t.title ?? 'Visit', open: (refresh) => taskModal(t, refresh) } : { kind: 'Task', title: '(done long ago)' };
  }
  if (f.parent_type === 'post') {
    const p = (state.posts ?? []).find((x) => x.id === f.parent_id);
    return p ? { kind: 'Post', title: p.title, open: (refresh) => postModal(p, refresh) } : { kind: 'Post', title: '(removed)' };
  }
  return null;
}

export function render(page, ctx) {
  const admin = isAdmin();
  const folders = state.folders ?? [];
  if (v.folder && v.folder !== 'none' && !folders.some((x) => x.id === v.folder)) v.folder = '';
  const all = state.files ?? [];
  const inFolder = (f) => (!v.folder ? true : v.folder === 'none' ? !f.folder_id : f.folder_id === v.folder);
  const q = v.q.trim().toLowerCase();
  const list = all
    .filter((f) => inFolder(f) && (!v.source || f.parent_type === v.source) && (!q || f.name.toLowerCase().includes(q) || (source(f)?.title ?? '').toLowerCase().includes(q)))
    .sort(SORTERS[v.sort] ?? SORTERS.new);
  const folderName = (id) => folders.find((x) => x.id === id)?.name;
  const current = folders.find((x) => x.id === v.folder);
  const total = all.reduce((s, f) => s + f.size, 0);

  page.innerHTML = `
    ${pageHeader(
      'Files',
      `Scripts, briefs, photos – everything shared in the CRM · ${all.length} file${all.length === 1 ? '' : 's'}${all.length ? `, ${sizeText(total)}` : ''}`,
      admin
        ? `<button class="btn secondary" data-new-folder>+ Folder</button>
           <label class="btn file-add">Upload${current ? ` to ${esc(current.name)}` : ''}<input type="file" multiple data-upload /></label>`
        : ''
    )}
    <div class="chips folder-chips">
      ${[
        { value: '', label: 'All files', n: all.length, icon: '🗂' },
        ...folders.map((x) => ({ value: x.id, label: x.name, n: all.filter((f) => f.folder_id === x.id).length, icon: '📁' })),
        ...(folders.length ? [{ value: 'none', label: 'Not in a folder', n: all.filter((f) => !f.folder_id).length, icon: '' }] : []),
      ]
        .map((x) => `<button type="button" data-folder="${x.value}" aria-pressed="${v.folder === x.value}">${x.icon ? `${x.icon} ` : ''}${esc(x.label)}<span class="count">${x.n}</span></button>`)
        .join('')}
    </div>
    ${current && admin ? `<div class="folder-head"><h2>📁 ${esc(current.name)}</h2><button class="link-btn" data-edit-folder>Rename / delete folder</button></div>` : ''}
    <div class="toolbar">
      <input class="input grow" type="search" placeholder="Search file name or task / post…" value="${esc(v.q)}" data-q />
      <select class="input" data-f="source" aria-label="Where from">${options(SOURCES, v.source, { empty: 'Everywhere' })}</select>
      <select class="input" data-f="sort" aria-label="Sort">${options(SORTS, v.sort)}</select>
    </div>
    ${
      !all.length
        ? emptyBox('No files yet', admin ? '<p>Upload scripts, briefs or photos here – or attach them to a task or post. You can also drop files onto this page.</p>' : '')
        : !list.length
          ? emptyBox(v.folder && !q && !v.source ? 'This folder is empty' : 'Nothing matches', admin && v.folder && v.folder !== 'none' ? '<p>Upload into it, or move files here with ⋯ → Move.</p>' : '')
          : `<section class="card file-card"><ul class="lib-list">${list
              .map((f) => {
                const src = source(f);
                const who = userById(f.created_by);
                return `<li>
                  <button type="button" class="lib-main" data-open="${f.id}">
                    <span class="lib-icon">${fileIcon(f)}</span>
                    <span class="lib-text"><b class="fname">${esc(f.name)}</b>
                      <span class="muted small">${[
                        !v.folder && f.folder_id ? `📁 ${esc(folderName(f.folder_id) ?? '')}` : '',
                        src ? `${src.kind}: ${esc(src.title)}` : '',
                        sizeText(f.size),
                        esc(shortDate(f.created_at.slice(0, 10))),
                      ]
                        .filter(Boolean)
                        .join(' · ')}</span></span>
                  </button>
                  ${who ? `<span class="who" title="Added by ${esc(who.name)}">${avatar(who, 22)}</span>` : ''}
                  ${src?.open ? `<button type="button" class="btn secondary sm lib-src" data-src="${f.id}">Open ${src.kind.toLowerCase()}</button>` : ''}
                  ${admin ? `<button type="button" class="icon-btn" data-edit="${f.id}" aria-label="Rename or move ${esc(f.name)}">⋯</button>` : ''}
                </li>`;
              })
              .join('')}</ul></section>`
    }
    ${admin ? '<div class="drop-hint" hidden>Drop to upload</div>' : ''}`;

  const redraw = () => render(page, ctx);
  const upload = async (files) => {
    let ok = 0;
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        toast(`“${file.name}” is too big (${sizeText(file.size)}). Max 1.5 MB – put videos on Drive and link them.`, 'error');
        continue;
      }
      try {
        const row = await uploadFile('/api/files', { file, parent_type: 'library', parent_id: '', folder_id: v.folder && v.folder !== 'none' ? v.folder : '' });
        (state.files ??= []).push(row);
        ok += 1;
      } catch (e) {
        toast(e.message, 'error');
      }
    }
    if (ok) toast(ok === 1 ? 'File uploaded' : `${ok} files uploaded`);
    if (ctx.isCurrent()) redraw();
  };

  page.querySelector('[data-upload]')?.addEventListener('change', (e) => upload([...e.target.files]));
  page.querySelector('[data-q]').addEventListener('input', (e) => {
    v.q = e.target.value;
    const pos = e.target.selectionStart;
    redraw();
    const input = page.querySelector('[data-q]');
    input.focus();
    input.setSelectionRange(pos, pos);
  });
  page.querySelectorAll('[data-f]').forEach((s) =>
    s.addEventListener('change', () => {
      v[s.dataset.f] = s.value;
      redraw();
    })
  );

  page.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('folder' in d) {
      v.folder = d.folder;
      redraw();
    } else if (d.open) openFile(all.find((f) => f.id === d.open));
    else if (d.src) source(all.find((f) => f.id === d.src))?.open?.(ctx.refresh);
    else if (d.edit) fileModal(all.find((f) => f.id === d.edit), redraw);
    else if ('newFolder' in d) folderModal(null, redraw);
    else if ('editFolder' in d) folderModal(current, redraw);
  };

  // Drag & drop anywhere on the page.
  if (admin) {
    const hint = page.querySelector('.drop-hint');
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    page.ondragenter = (e) => {
      if (!hasFiles(e)) return;
      depth += 1;
      hint.hidden = false;
    };
    page.ondragleave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) hint.hidden = true;
    };
    page.ondragover = (e) => hasFiles(e) && e.preventDefault();
    page.ondrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      hint.hidden = true;
      upload([...e.dataTransfer.files]);
    };
  }
}

// Rename a file, move it to a folder, or delete it.
function fileModal(f, redraw) {
  if (!f) return;
  const m = openModal(
    'File',
    `<form>
      <label class="field"><span>Name</span><input class="input" name="name" required value="${esc(f.name)}" /></label>
      <label class="field"><span>Folder</span><select class="input" name="folder_id">${options(
        (state.folders ?? []).map((x) => ({ value: x.id, label: x.name })),
        f.folder_id,
        { empty: 'Not in a folder' }
      )}</select>${(state.folders ?? []).length ? '' : '<small>Create folders with “+ Folder” on the Files page.</small>'}</label>
      <button class="btn block" type="submit">Save</button>
      <button class="btn danger block" type="button" data-remove>Delete file</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formData(form);
    try {
      const row = await api('/api/files', { method: 'PATCH', body: { id: f.id, name: body.name, folder_id: body.folder_id || null } });
      Object.assign(f, row);
      m.close();
      toast('Saved');
      redraw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-remove]').addEventListener('click', async () => {
    const where = f.parent_type === 'library' ? '' : ` It will also disappear from its ${f.parent_type}.`;
    if (!confirm(`Delete “${f.name}”?${where}`)) return;
    try {
      await api(`/api/files?id=${f.id}`, { method: 'DELETE' });
      state.files = state.files.filter((x) => x.id !== f.id);
      m.close();
      toast('Deleted');
      redraw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// Create or rename a folder (and delete an existing one – its files stay).
function folderModal(folder, redraw) {
  const m = openModal(
    folder ? 'Folder' : 'New folder',
    `<form>
      <label class="field"><span>Folder name</span><input class="input" name="name" required value="${esc(folder?.name ?? '')}" placeholder="Voiceover scripts, Brand assets, Briefs…" /></label>
      <button class="btn block" type="submit">${folder ? 'Save' : 'Create folder'}</button>
      ${folder ? '<button class="btn danger block" type="button" data-remove>Delete folder</button><p class="muted small">Deleting a folder keeps its files – they just won’t be in a folder anymore.</p>' : ''}
    </form>`
  );
  const form = m.el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const row = await api('/api/folders', { method: 'POST', body: { id: folder?.id, name: form.name.value } });
      const list = (state.folders ??= []);
      if (folder) Object.assign(folder, row);
      else {
        list.push(row);
        v.folder = row.id; // open the new folder, ready for uploads
      }
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      m.close();
      redraw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-remove]')?.addEventListener('click', async () => {
    if (!confirm(`Delete the folder “${folder.name}”? Its files stay.`)) return;
    try {
      await api(`/api/folders?id=${folder.id}`, { method: 'DELETE' });
      state.folders = state.folders.filter((x) => x.id !== folder.id);
      for (const f of state.files ?? []) if (f.folder_id === folder.id) f.folder_id = null;
      v.folder = '';
      m.close();
      redraw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
