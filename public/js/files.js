// Files attached to a task or a post: the "Files" block in their windows, plus opening a file
// (text files show right in the CRM with a Copy button, everything else opens in a new tab).
import { api, fetchFile, state, uploadFile } from './store.js';
import { copyText, esc, openModal, toast } from './util.js';

const MAX_BYTES = 1.5 * 1024 * 1024;
const TEXT_EXT = /\.(txt|md|csv|srt|vtt|json)$/i;

export const filesOf = (type, id) => (id ? (state.files ?? []).filter((f) => f.parent_type === type && f.parent_id === id) : []);
export const fileCount = (type, id) => filesOf(type, id).length;
export const sizeText = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const fileIcon = (f) => (/^image\//.test(f.type) ? '🖼' : /pdf/.test(f.type) ? '📕' : /^text\//.test(f.type) || TEXT_EXT.test(f.name) ? '📝' : /^(video|audio)\//.test(f.type) ? '🎬' : '📄');

export const filesFieldHtml = (canEdit) => `
  <div class="field"><span>Files</span>
    <ul class="file-list" data-files></ul>
    ${
      canEdit
        ? `<label class="btn secondary sm file-add">📎 Add file<input type="file" multiple data-file-input /></label>
           <small>Scripts, PDFs, images – up to 1.5 MB each. For videos, paste a Google Drive / OneDrive link in Notes.</small>`
        : ''
    }
  </div>`;

// Wires the Files block inside `root`. For a task/post that isn't saved yet the chosen files wait
// and are uploaded by flush(newId) right after it's created.
export function mountFiles(root, type, id, canEdit) {
  const listEl = root.querySelector('[data-files]');
  const input = root.querySelector('[data-file-input]');
  let pending = [];
  const draw = () => {
    const saved = filesOf(type, id);
    listEl.innerHTML =
      [
        ...saved.map(
          (f) => `<li><button type="button" class="file-open" data-open="${f.id}">${fileIcon(f)} <span class="fname">${esc(f.name)}</span></button><span class="muted small">${sizeText(f.size)}</span>
            ${canEdit ? `<button type="button" class="link-btn muted" data-del="${f.id}" aria-label="Remove ${esc(f.name)}">×</button>` : ''}</li>`
        ),
        ...pending.map(
          (f, i) => `<li><span class="file-open">${fileIcon(f)} <span class="fname">${esc(f.name)}</span></span><span class="muted small">added when you save</span>
            <button type="button" class="link-btn muted" data-unpend="${i}" aria-label="Remove">×</button></li>`
        ),
      ].join('') || (canEdit ? '' : '<li class="muted small">No files</li>');
  };
  const send = async (file, parentId) => {
    const row = await uploadFile('/api/files', { file, parent_type: type, parent_id: parentId });
    (state.files ??= []).push(row);
  };
  input?.addEventListener('change', async () => {
    const chosen = [...input.files];
    input.value = '';
    for (const f of chosen) {
      if (f.size > MAX_BYTES) {
        toast(`“${f.name}” is too big (${sizeText(f.size)}). Max 1.5 MB – paste a link to bigger files.`, 'error');
        continue;
      }
      if (!id) {
        pending.push(f);
        continue;
      }
      try {
        await send(f, id);
        toast(`Added ${f.name}`);
      } catch (e) {
        toast(e.message, 'error');
      }
    }
    draw();
  });
  listEl.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open) openFile(filesOf(type, id).find((f) => f.id === b.dataset.open));
    else if (b.dataset.unpend) {
      pending.splice(Number(b.dataset.unpend), 1);
      draw();
    } else if (b.dataset.del) {
      const f = filesOf(type, id).find((x) => x.id === b.dataset.del);
      if (!f || !confirm(`Remove “${f.name}”?`)) return;
      try {
        await api(`/api/files?id=${f.id}`, { method: 'DELETE' });
        state.files = state.files.filter((x) => x.id !== f.id);
        draw();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  draw();
  return {
    async flush(newId) {
      for (const f of pending) {
        try {
          await send(f, newId);
        } catch (e) {
          toast(`${f.name}: ${e.message}`, 'error');
        }
      }
      pending = [];
    },
  };
}

export async function openFile(f) {
  if (!f) return;
  const isText = /^text\//.test(f.type) || TEXT_EXT.test(f.name);
  // Open the tab right away (browsers block pop-ups opened after a download finishes).
  const tab = isText ? null : window.open('', '_blank');
  try {
    const blob = await fetchFile(`/api/files?id=${f.id}`);
    if (isText) {
      const text = await blob.text();
      const m = openModal(f.name, `<pre class="file-text">${esc(text)}</pre>
        <div class="controls"><button type="button" class="btn" data-copy>Copy text</button><button type="button" class="btn secondary" data-download>Download</button></div>`);
      m.el.querySelector('.modal').classList.add('wide');
      m.el.querySelector('[data-copy]').addEventListener('click', () => copyText(text));
      m.el.querySelector('[data-download]').addEventListener('click', () => download(blob, f.name));
    } else {
      const url = URL.createObjectURL(blob);
      if (tab) tab.location = url;
      else download(blob, f.name);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch (e) {
    tab?.close();
    toast(e.message, 'error');
  }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
