// Your profile (photo, name, e-mail, password) and – for the owner/admins – the team:
// who can log in and which sections (Sales / Marketing) each person sees.
import { avatar, emptyBox, pageHeader, roleLabel } from '../components.js';
import { api, isTeamAdmin, loadData, state } from '../store.js';
import { esc, formData, fullDate, openModal, toast } from '../util.js';

const SECTION_LABELS = { sales: 'Sales', marketing: 'Marketing' };

// Square-crop and shrink a photo in the browser (256 px JPEG) before it's saved.
async function resizePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function profileModal(onSaved) {
  const me = state.me;
  if (!me || me.id === 'viewer') return toast('The shared viewer login has no profile', 'error');
  let photo = me.photo ?? null;
  const owner = me.role === 'owner';
  const m = openModal(
    'Edit profile',
    `<form>
      <div class="profile-photo">
        <span data-avatar>${avatar({ ...me, photo }, 84)}</span>
        <div class="stack" style="gap:6px">
          <label class="btn secondary sm" style="cursor:pointer">Upload photo<input type="file" accept="image/*" hidden data-photo /></label>
          <button type="button" class="link-btn muted" data-remove-photo ${photo ? '' : 'hidden'}>Remove photo</button>
        </div>
      </div>
      <label class="field"><span>Name</span><input class="input" name="name" required value="${esc(me.name ?? '')}" /></label>
      <label class="field"><span>E-mail</span><input class="input" type="email" name="email" value="${esc(me.email ?? '')}" ${owner ? '' : 'required'} />
        <small>${owner ? 'Optional – lets you log in with your e-mail + the admin password.' : 'Your login.'}</small></label>
      ${
        owner
          ? '<p class="muted small">Your password is the <code>ADMIN_PASSWORD</code> in Cloudflare – change it there.</p>'
          : `<details class="more-fields"><summary>Change password</summary>
              <div class="form-grid">
                <label class="field"><span>Current password</span><input class="input" type="password" name="current_password" autocomplete="current-password" /></label>
                <label class="field"><span>New password</span><input class="input" type="password" name="password" autocomplete="new-password" minlength="8" /></label>
              </div></details>`
      }
      <p class="muted small">${esc(roleLabel(me.role))} · access: ${me.sections.map((s) => SECTION_LABELS[s]).join(', ') || 'none'}</p>
      <button class="btn block" type="submit">Save profile</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  const drawAvatar = () => {
    m.el.querySelector('[data-avatar]').innerHTML = avatar({ ...me, name: form.name.value || me.name, photo }, 84);
    m.el.querySelector('[data-remove-photo]').hidden = !photo;
  };
  m.el.querySelector('[data-photo]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photo = await resizePhoto(file);
      drawAvatar();
    } catch {
      toast('Could not read that image', 'error');
    }
  });
  m.el.querySelector('[data-remove-photo]').addEventListener('click', () => {
    photo = null;
    drawAvatar();
  });
  form.name.addEventListener('input', drawAvatar);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    const body = { name: f.name, email: f.email, photo };
    if (f.password) Object.assign(body, { password: f.password, current_password: f.current_password });
    try {
      await api('/api/users', { method: 'POST', body: { profile: body } });
      m.close();
      toast('Profile saved');
      await loadData();
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// Team page (owner / admins).
export async function render(page, ctx) {
  if (!isTeamAdmin()) {
    page.innerHTML = emptyBox('Only the admin manages the team');
    return;
  }
  page.innerHTML = '<div class="loading">Loading…</div>';
  const users = await api('/api/users');
  if (!ctx.isCurrent()) return;
  page.innerHTML = `
    ${pageHeader('Team', 'Who can log in, and which sections each person sees', '<button class="btn" data-add>+ Add person</button>')}
    <section class="card">
      <ul class="team-list">${users
        .map(
          (u) => `<li class="${u.active ? '' : 'inactive'}" data-user="${u.id}">
            ${avatar(u, 40)}
            <div class="body"><b>${esc(u.name)}</b>${u.active ? '' : ' <span class="pill">deactivated</span>'}<div class="muted small">${esc(u.email ?? '–')}${u.last_login ? ` · last login ${esc(fullDate(u.last_login.slice(0, 10)))}` : ' · never logged in'}</div></div>
            <span class="role-pill ${u.role}">${esc(roleLabel(u.role))}</span>
            <span class="sections">${u.sections.map((s) => `<span class="cat cat-${s}">${SECTION_LABELS[s]}</span>`).join('') || '<span class="muted small">no access</span>'}</span>
            ${u.role === 'owner' ? '<span class="muted small" style="width:48px">you</span>' : '<button class="btn secondary sm" data-edit>Edit</button>'}
          </li>`
        )
        .join('')}</ul>
      <p class="muted small" style="margin-top:12px">Members can edit everything in their sections and the tasks assigned to them. Viewers can only look.
      Notes are always personal. Home and Tasks are there for everyone (Tasks shows only their sections and their own tasks).</p>
    </section>`;
  page.onclick = (e) => {
    if (e.target.closest('[data-add]')) return userModal({ role: 'member', sections: ['marketing'], active: true }, () => render(page, ctx));
    const li = e.target.closest('[data-edit]')?.closest('[data-user]');
    if (li) userModal(users.find((u) => u.id === li.dataset.user), () => render(page, ctx));
  };
}

function userModal(u, done) {
  const isNew = !u.id;
  const m = openModal(
    isNew ? 'Add a person' : `Edit ${u.name}`,
    `<form>
      <div class="form-grid">
        <label class="field"><span>Name *</span><input class="input" name="name" required value="${esc(u.name ?? '')}" /></label>
        <label class="field"><span>E-mail (login) *</span><input class="input" type="email" name="email" required value="${esc(u.email ?? '')}" /></label>
      </div>
      <div class="field"><span>Sees these sections</span>
        <label class="check"><input type="checkbox" name="s_sales" ${u.sections?.includes('sales') ? 'checked' : ''} /> Sales – Partners, Pipeline, Sales, Goals, Sales tasks</label>
        <label class="check"><input type="checkbox" name="s_marketing" ${u.sections?.includes('marketing') ? 'checked' : ''} /> Marketing – Marketing, Collaborators, Marketing tasks</label>
      </div>
      <div class="field"><span>Role</span>
        <select class="input" name="role">
          <option value="member" ${u.role === 'member' ? 'selected' : ''}>Member – can edit in their sections</option>
          <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer – can only look</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin – everything, incl. the team</option>
        </select>
      </div>
      <label class="field"><span>${isNew ? 'First password *' : 'New password (leave empty to keep)'}</span>
        <input class="input" type="text" name="password" ${isNew ? 'required' : ''} minlength="8" autocomplete="off" placeholder="at least 8 characters" />
        <small>Send it to them – they can change it in Edit profile.</small></label>
      ${isNew ? '' : `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} /> Can log in (untick to deactivate)</label>`}
      <button class="btn block" type="submit">${isNew ? 'Add person' : 'Save'}</button>
      ${isNew ? '' : '<button class="btn danger block" type="button" data-delete>Remove from team</button>'}
    </form>`
  );
  const form = m.el.querySelector('form');
  const syncAdmin = () => {
    const admin = form.role.value === 'admin';
    form.s_sales.disabled = admin;
    form.s_marketing.disabled = admin;
    if (admin) form.s_sales.checked = form.s_marketing.checked = true;
  };
  form.role.addEventListener('change', syncAdmin);
  syncAdmin();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    const sections = [f.s_sales && 'sales', f.s_marketing && 'marketing'].filter(Boolean);
    const body = { id: u.id, name: f.name, email: f.email, role: f.role, sections, ...(f.password ? { password: f.password } : {}) };
    if (!isNew) body.active = f.active;
    try {
      await api('/api/users', { method: 'POST', body });
      m.close();
      toast(isNew ? `${f.name} added – send them their e-mail and password` : 'Saved');
      await loadData();
      done();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm(`Remove ${u.name}? Their tasks become unassigned and their personal notes are deleted.`)) return;
    try {
      await api(`/api/users?id=${u.id}`, { method: 'DELETE' });
      m.close();
      await loadData();
      done();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
