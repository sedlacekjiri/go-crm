// Partner list with type tabs, search, area / stage filters and bulk add.
import { emptyBox, followUpPill, interestBadge, pageHeader, stageBadge } from '../components.js';
import { AREAS, PARTNER_TYPES, STAGES, visitStats } from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { renderOverview } from './affiliates.js';
import { esc, openModal, options, shortDate, toast } from '../util.js';

// Filters survive navigating to a partner and back.
const filters = { query: '', stage: '', area: '', sort: 'name' };

export function render(page, { query, refresh, isCurrent }) {
  const isAffiliates = query.get('type') === 'affiliates';
  const type = PARTNER_TYPES.some((t) => t.value === query.get('type')) ? query.get('type') : 'hotel';
  const typeInfo = PARTNER_TYPES.find((t) => t.value === type);
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
      'Hotels, guesthouses, OTAs and cafés in the capital region',
      isAdmin() ? `<button class="btn secondary" data-bulk>Add many at once</button><a class="btn" href="#/partners/new?type=${type}">+ Add ${esc(typeInfo.singular.toLowerCase())}</a>` : ''
    )}
    ${tabs}
    <div class="toolbar">
      <input class="input grow" type="search" placeholder="Search name, address, code…" value="${esc(filters.query)}" data-f="query" />
      <select class="input" data-f="area" aria-label="Area">${options(AREAS, filters.area, { empty: 'All areas' })}</select>
      <select class="input" data-f="sort" aria-label="Sort">${options(
        [
          { value: 'name', label: 'Sort: Name' },
          { value: 'follow_up', label: 'Sort: Next follow-up' },
          { value: 'last_activity', label: 'Sort: Last visit / contact' },
          { value: 'rooms', label: 'Sort: Rooms' },
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
    <div id="list"></div>`;

  const drawList = () => {
    const q = filters.query.trim().toLowerCase();
    const rows = state.partners.filter(
      (p) =>
        p.type === type &&
        (!filters.stage || p.stage === filters.stage) &&
        (!filters.area || p.area === filters.area) &&
        (!q || [p.name, p.address, p.affiliate_code, p.notes].some((v) => v && v.toLowerCase().includes(q)))
    );
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name),
      follow_up: (a, b) => (a.next_follow_up ?? '9999').localeCompare(b.next_follow_up ?? '9999'),
      last_activity: (a, b) => (lastContact.get(b.id) ?? '').localeCompare(lastContact.get(a.id) ?? ''),
      rooms: (a, b) => (b.rooms ?? -1) - (a.rooms ?? -1),
    }[filters.sort];
    rows.sort(cmp);
    page.querySelector('#list').innerHTML = rows.length
      ? `<div class="plist">${rows
          .map((p) => {
            const v = visits.get(p.id);
            const meta = [p.area, p.rooms ? `${p.rooms} rooms` : null, v ? `${v.count}× visited, last ${shortDate(v.last)}` : 'not visited yet'].filter(Boolean).join(' · ');
            return `<a class="prow" href="#/partner/${p.id}">
              <div class="main"><div class="name"><span>${esc(p.name)}</span>${p.stars ? `<em class="stars">${'★'.repeat(p.stars)}</em>` : ''}</div><div class="meta">${esc(meta)}</div></div>
              <div class="tags">${stageBadge(p.stage)}${interestBadge(p.interest)}${
                p.stage === 'accepted' ? (p.affiliate_code ? `<span class="code">${esc(p.affiliate_code)}</span>` : '') : p.stage !== 'declined' ? followUpPill(p.next_follow_up) : ''
              }</div></a>`;
          })
          .join('')}</div>`
      : emptyBox(`No ${typeInfo.label.toLowerCase()} here yet`, isAdmin() ? 'Add one, or use Bulk add to paste a whole list of names.' : '');
  };
  drawList();

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

function bulkAdd(type, refresh) {
  const m = openModal(
    'Bulk add partners',
    `<form>
      <label class="field"><span>Names – one per line</span><textarea class="input" name="names" rows="8" placeholder="Hotel Borg&#10;CenterHotel Plaza&#10;KEX Hostel"></textarea><small data-hint></small></label>
      <div class="form-grid">
        <label class="field"><span>Type</span><select class="input" name="type">${options(PARTNER_TYPES.map((t) => ({ value: t.value, label: t.singular })), type)}</select></label>
        <label class="field"><span>Area (optional)</span><select class="input" name="area">${options(AREAS, '', { empty: '–' })}</select></label>
      </div>
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
      const { added } = await api('/api/partners', { method: 'POST', body: { bulk: names(), type: form.type.value, area: form.area.value || null } });
      m.close();
      toast(`Added ${added} partners`);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
