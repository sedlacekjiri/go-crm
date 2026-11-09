// Partner list with type tabs, search, area / stage filters and bulk add.
import { emptyBox, followUpPill, interestBadge, pageHeader, stageBadge } from '../components.js';
import { AREAS, capacityText, chainCounts, chainSuggestions, INTEREST, PARTNER_TYPES, STAGES, today, visitStats } from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { renderOverview } from './affiliates.js';
import { esc, formData, openModal, options, shortDate, toast } from '../util.js';

// Filters survive navigating to a partner and back.
const filters = { query: '', stage: '', area: '', chain: '', welcome: '', sort: 'name' };
// Select mode: tick several partners and change them at once.
let selecting = false;
const selected = new Set();

export function render(page, { query, refresh, isCurrent }) {
  const isAffiliates = query.get('type') === 'affiliates';
  const type = PARTNER_TYPES.some((t) => t.value === query.get('type')) ? query.get('type') : 'hotel';
  const typeInfo = PARTNER_TYPES.find((t) => t.value === type);
  // A chain filter from another tab doesn't apply here (and its select may not even be shown).
  const typeChains = new Set(state.partners.filter((x) => x.type === type && x.chain).map((x) => x.chain));
  if (filters.chain && (!typeChains.size || (filters.chain !== '__none' && !typeChains.has(filters.chain)))) filters.chain = '';
  const lastContact = new Map();
  for (const a of state.activities) if (!lastContact.has(a.partner_id)) lastContact.set(a.partner_id, a.happened_at);
  const visits = visitStats(state.activities);
  const count = (pred) => state.partners.filter(pred).length;

  const tabs = `<nav class="tabs">${PARTNER_TYPES.map(
      (t) => `<a href="#/partners?type=${t.value}" class="${t.value === type && !isAffiliates ? 'active' : ''}">${t.label}<span class="count">${count((p) => p.type === t.value)}</span></a>`
    ).join('')}<a href="#/partners?type=affiliates" class="${isAffiliates ? 'active' : ''}">Staff codes<span class="count">${state.affiliates.length}</span></a></nav>`;

  if (isAffiliates) {
    page.innerHTML = `${pageHeader('Partners', 'Receptionists and concierges with their own booking code and commission')}${tabs}<div id="affOverview"></div>`;
    return renderOverview(page.querySelector('#affOverview'), refresh, isCurrent);
  }

  page.innerHTML = `
    ${pageHeader(
      'Partners',
      'Hotels, guesthouses, hostels, campsites, OTAs and cafés',
      isAdmin() ? `<button class="btn secondary" data-select-mode>${selecting ? 'Done selecting' : 'Select'}</button><button class="btn secondary" data-bulk>Add many at once</button><a class="btn" href="#/partners/new?type=${type}">+ Add ${esc(typeInfo.singular.toLowerCase())}</a>` : ''
    )}
    ${tabs}
    <div class="toolbar">
      <input class="input grow" type="search" placeholder="Search name, chain, address, code…" value="${esc(filters.query)}" data-f="query" />
      <select class="input" data-f="area" aria-label="Area">${options(AREAS, filters.area, { empty: 'All areas' })}</select>
      ${(() => {
        const chains = chainCounts(state.partners.filter((x) => x.type === type));
        if (!chains.length) return '';
        const independent = state.partners.filter((x) => x.type === type && !x.chain).length;
        return `<select class="input" data-f="chain" aria-label="Chain">${options(
          [{ value: '__none', label: `Independent (${independent})` }, ...chains.map((c) => ({ value: c.chain, label: `${c.chain} (${c.n})` }))],
          filters.chain,
          { empty: 'All chains' }
        )}</select>`;
      })()}
      <select class="input" data-f="welcome" aria-label="Welcome e-mail">${options(
        [
          { value: 'sent', label: 'Welcome e-mail sent' },
          { value: 'not_sent', label: 'No welcome e-mail yet' },
        ],
        filters.welcome,
        { empty: 'Welcome e-mail: any' }
      )}</select>
      <select class="input" data-f="sort" aria-label="Sort">${options(
        [
          { value: 'name', label: 'Sort: Name' },
          { value: 'follow_up', label: 'Sort: Next follow-up' },
          { value: 'last_activity', label: 'Sort: Last visit / contact' },
          { value: 'rooms', label: 'Sort: Size (rooms / beds / pitches)' },
        ],
        filters.sort
      )}</select>
    </div>
    <div class="chips" style="margin-bottom:14px">${[{ value: '', label: 'All' }, ...STAGES]
      .map(
        (s) =>
          `<button type="button" data-stage="${s.value}" aria-pressed="${filters.stage === s.value}">${s.label}${
            s.value ? `<span class="count">${count((p) => p.type === type && p.stage === s.value)}</span>` : ''
          }</button>`
      )
      .join('')}</div>
    <div class="bulk-bar" data-bulk-bar hidden></div>
    <div id="list"></div>`;

  const drawList = () => {
    const q = filters.query.trim().toLowerCase();
    const rows = state.partners.filter(
      (p) =>
        p.type === type &&
        (!filters.stage || p.stage === filters.stage) &&
        (!filters.area || p.area === filters.area) &&
        (!filters.chain || (filters.chain === '__none' ? !p.chain : p.chain === filters.chain)) &&
        (!filters.welcome || (filters.welcome === 'sent') === !!p.welcome_sent) &&
        (!q || [p.name, p.chain, p.address, p.affiliate_code, p.notes].some((v) => v && v.toLowerCase().includes(q)))
    );
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name),
      follow_up: (a, b) => (a.next_follow_up ?? '9999').localeCompare(b.next_follow_up ?? '9999'),
      last_activity: (a, b) => (lastContact.get(b.id) ?? '').localeCompare(lastContact.get(a.id) ?? ''),
      rooms: (a, b) => (b.rooms ?? -1) - (a.rooms ?? -1),
    }[filters.sort];
    rows.sort(cmp);
    shown = rows;
    const bar = page.querySelector('[data-bulk-bar]');
    bar.hidden = !selecting;
    if (selecting) {
      const allOn = rows.length && rows.every((p) => selected.has(p.id));
      bar.innerHTML = `<b>${selected.size} selected</b>
        <button type="button" class="link-btn" data-sel-all>${allOn ? 'Unselect' : 'Select'} all shown (${rows.length})</button>
        ${selected.size ? '<button type="button" class="link-btn muted" data-sel-none>Clear</button>' : ''}
        <button type="button" class="btn sm" data-sel-edit ${selected.size ? '' : 'disabled'}>Change ${selected.size || ''} at once…</button>`;
    }
    page.querySelector('#list').innerHTML = rows.length
      ? `<div class="plist">${rows
          .map((p) => {
            const v = visits.get(p.id);
            const meta = [p.area, capacityText(p), v ? `${v.count}× visited, last ${shortDate(v.last)}` : 'not visited yet'].filter(Boolean).join(' · ');
            return `<a class="prow${selecting ? ' selecting' : ''}${selected.has(p.id) ? ' on' : ''}" href="#/partner/${p.id}" data-pid="${p.id}">
              ${selecting ? '<span class="pick" aria-hidden="true"></span>' : ''}<div class="main"><div class="name"><span>${esc(p.name)}</span>${p.chain ? `<em class="chain-tag">${esc(p.chain)}</em>` : ''}${p.stars ? `<em class="stars">${'★'.repeat(p.stars)}</em>` : ''}</div><div class="meta">${esc(meta)}</div></div>
              <div class="tags">${p.welcome_sent ? `<span class="pill good" title="Welcome e-mail sent ${shortDate(p.welcome_sent)}">✉️ ${shortDate(p.welcome_sent)}</span>` : ''}${stageBadge(p.stage)}${interestBadge(p.interest)}${
                p.stage === 'accepted' ? (p.affiliate_code ? `<span class="code">${esc(p.affiliate_code)}</span>` : '') : p.stage !== 'declined' ? followUpPill(p.next_follow_up) : ''
              }</div></a>`;
          })
          .join('')}</div>`
      : emptyBox(`No ${typeInfo.label.toLowerCase()} here yet`, isAdmin() ? 'Add one, or use Bulk add to paste a whole list of names.' : '');
  };
  let shown = [];
  drawList();

  page.querySelector('#list').addEventListener('click', (e) => {
    const row = selecting && e.target.closest('[data-pid]');
    if (!row) return;
    e.preventDefault();
    if (selected.has(row.dataset.pid)) selected.delete(row.dataset.pid);
    else selected.add(row.dataset.pid);
    drawList();
  });
  page.querySelector('[data-bulk-bar]').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('selAll' in b.dataset) {
      const allOn = shown.every((p) => selected.has(p.id));
      shown.forEach((p) => (allOn ? selected.delete(p.id) : selected.add(p.id)));
    } else if ('selNone' in b.dataset) selected.clear();
    else if ('selEdit' in b.dataset)
      return bulkEdit(
        state.partners.filter((p) => selected.has(p.id)),
        () => {
          selected.clear();
          selecting = false;
          refresh();
        }
      );
    drawList();
  });
  page.querySelector('[data-select-mode]')?.addEventListener('click', () => {
    selecting = !selecting;
    if (!selecting) selected.clear();
    render(page, { query, refresh, isCurrent });
  });

  page.querySelector('[data-f="query"]').addEventListener('input', (e) => {
    filters.query = e.target.value;
    drawList();
  });
  page.querySelectorAll('select[data-f]').forEach((sel) =>
    sel.addEventListener('change', (e) => {
      filters[sel.dataset.f] = e.target.value;
      drawList();
    })
  );
  page.querySelector('.chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stage]');
    if (!b) return;
    filters.stage = b.dataset.stage;
    page.querySelectorAll('[data-stage]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawList();
  });
  page.querySelector('[data-bulk]')?.addEventListener('click', () => bulkAdd(type, refresh));
}

// One window for many partners: stage (with the visit date), a note for their history, interest,
// follow-up, welcome e-mail. Empty fields stay as they are.
function bulkEdit(list, done) {
  const toVisit = list.filter((p) => p.stage === 'new').length;
  const m = openModal(
    `Change ${list.length} partners`,
    `<form>
      <p class="muted small" style="margin:0 0 12px">${esc(list.slice(0, 6).map((p) => p.name).join(', '))}${list.length > 6 ? ` and ${list.length - 6} more` : ''}</p>
      <div class="form-grid">
        <label class="field"><span>Stage</span><select class="input" name="stage">${options(STAGES, '', { empty: 'No change' })}</select></label>
        <label class="field"><span>Date of the visit / meeting</span><input class="input" type="date" name="day" value="${today()}" max="${today()}" /></label>
      </div>
      <small class="muted" data-visit-hint></small>
      <label class="field"><span>Note for their history (optional)</span><textarea class="input" name="note" rows="3" placeholder="Met the Center Hotels sales manager – talked about all their hotels, flyers to every reception…"></textarea></label>
      <div class="form-grid">
        <label class="field"><span>Interest</span><select class="input" name="interest">${options(INTEREST, '', { empty: 'No change' })}</select></label>
        <label class="field"><span>Next follow-up</span><input class="input" type="date" name="next_follow_up" /></label>
      </div>
      <div class="form-grid">
        <label class="field"><span>Welcome e-mail sent on</span><input class="input" type="date" name="welcome_sent" max="${today()}" /></label>
        <label class="field"><span>Follow-up e-mail sent on</span><input class="input" type="date" name="followup_mail" max="${today()}" /></label>
      </div>
      <fieldset class="also-add"><legend>Add a contact person to all (optional)</legend>
        <div class="form-grid">
          <label class="field"><span>Name</span><input class="input" name="c_name" placeholder="e.g. Anna Jónsdóttir" /></label>
          <label class="field"><span>Role</span><input class="input" name="c_role" placeholder="Sales manager" /></label>
          <label class="field"><span>Phone</span><input class="input" type="tel" name="c_phone" /></label>
          <label class="field"><span>E-mail</span><input class="input" type="email" name="c_email" /></label>
        </div>
      </fieldset>
      <p class="muted small">Empty fields stay as they are.</p>
      <button class="btn block" type="submit">Save for all ${list.length}</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  const hint = () => {
    const leaving = form.stage.value && form.stage.value !== 'new' && toVisit;
    m.el.querySelector('[data-visit-hint]').textContent = leaving
      ? `${toVisit} of them are “To visit” – each gets a visit logged on this date.`
      : !form.note.value.trim()
        ? ''
        : form.followup_mail.value
          ? 'The note is saved with the follow-up e-mail.'
          : 'The note is saved as a meeting on this date.';
  };
  form.stage.addEventListener('change', hint);
  form.note.addEventListener('input', hint);
  form.followup_mail.addEventListener('input', hint);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    const set = {};
    if (f.stage) set.stage = f.stage;
    if (f.interest) set.interest = Number(f.interest);
    if (f.next_follow_up) set.next_follow_up = f.next_follow_up;
    if (f.welcome_sent) set.welcome_sent = f.welcome_sent;
    const contact = f.c_name.trim() ? { name: f.c_name, role: f.c_role, phone: f.c_phone, email: f.c_email } : null;
    if ((f.c_role || f.c_phone || f.c_email) && !contact) return toast('Add the contact person’s name', 'error');
    if (!Object.keys(set).length && !f.note.trim() && !contact && !f.followup_mail) return toast('Nothing to change', 'error');
    if (f.day > today() || f.followup_mail > today()) return toast('Pick a day up to today', 'error');
    try {
      const { updated } = await api('/api/partners', { method: 'POST', body: { ids: list.map((p) => p.id), set, visited_on: f.day || null, note: f.note, contact, followup_mail: f.followup_mail || null } });
      m.close();
      toast(`Updated ${updated} partners`);
      done();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function bulkAdd(type, refresh) {
  const m = openModal(
    'Bulk add partners',
    `<form>
      <label class="field"><span>Names – one per line</span><textarea class="input" name="names" rows="8" placeholder="Hotel Borg&#10;CenterHotel Plaza&#10;KEX Hostel"></textarea><small data-hint></small></label>
      <div class="form-grid">
        <label class="field"><span>Type</span><select class="input" name="type">${options(PARTNER_TYPES.map((t) => ({ value: t.value, label: t.singular })), type)}</select></label>
        <label class="field"><span>Area (optional)</span><select class="input" name="area">${options(AREAS, '', { empty: '–' })}</select></label>
      </div>
      <label class="field"><span>Hotel chain (optional)</span><input class="input" name="chain" list="bulkChains" placeholder="e.g. Center Hotels" autocomplete="off" />
        <datalist id="bulkChains">${chainSuggestions(state.partners).map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
      <button class="btn block" type="submit">Add partners</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  const known = new Set(state.partners.map((p) => p.name.trim().toLowerCase()));
  const names = () => [...new Set(form.names.value.split('\n').map((l) => l.trim()).filter(Boolean))];
  form.names.addEventListener('input', () => {
    const all = names();
    const fresh = all.filter((n) => !known.has(n.toLowerCase()));
    m.el.querySelector('[data-hint]').textContent = all.length ? `${fresh.length} new${all.length - fresh.length ? `, ${all.length - fresh.length} already in the CRM (skipped)` : ''}` : '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { added } = await api('/api/partners', { method: 'POST', body: { bulk: names(), type: form.type.value, area: form.area.value || null, chain: form.chain.value.trim() || null } });
      m.close();
      toast(`Added ${added} partners`);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
