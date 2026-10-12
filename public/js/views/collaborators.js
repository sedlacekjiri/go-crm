// Collaborators: influencers / content creators who get a camper or car deal in exchange for content.
// Flow: Request → Agreed (booking) → [upcoming / on the trip / content overdue – from the dates]
//       → Content delivered (refund to pay) → Refunded & done.
import { emptyBox, kpi, pageHeader } from '../components.js';
import { COLLAB_PHASE_LABELS, COLLAB_STATUSES, collabPhase, collabTotals, parseSocials, today } from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { esc, formData, money, num, openModal, options, shortDate, toast } from '../util.js';

const v = { phase: '', q: '', brand: '', handler: '' };

const PHASE_FILTERS = ['request', 'upcoming', 'on_trip', 'overdue', 'delivered', 'done', 'declined'];
const phaseBadge = (phase) => `<span class="cphase ${phase}">${esc(COLLAB_PHASE_LABELS[phase] ?? phase)}</span>`;

const dates = (c) =>
  c.pickup_date || c.dropoff_date ? `${c.pickup_date ? shortDate(c.pickup_date) : '?'} – ${c.dropoff_date ? shortDate(c.dropoff_date) : '?'}` : '–';

const socialIcons = (c) =>
  parseSocials(c.socials)
    .map((s) => `<a class="soc soc-${s.platform}" href="${esc(s.url)}" target="_blank" rel="noreferrer" title="${esc(s.label)}">${esc(s.label)}</a>`)
    .join('');

const flags = (c) =>
  [
    [c.moodboard, 'Moodboard'],
    [c.content_delivered, 'Content'],
    [c.in_onedrive, 'OneDrive'],
  ]
    .map(([on, label]) => `<span class="flag ${on ? 'on' : ''}" title="${label}${on ? ' ✓' : ' – not yet'}">${on ? '✓' : '·'} ${label}</span>`)
    .join('');

export function render(page, ctx) {
  const t = today();
  const admin = isAdmin();
  const all = state.collaborators ?? [];
  const totals = collabTotals(all, t);
  const handlers = [...new Set(all.map((c) => c.handled_by).filter(Boolean))].sort();
  const count = (phase) => all.filter((c) => collabPhase(c, t) === phase).length;
  const q = v.q.trim().toLowerCase();
  const list = all.filter(
    (c) =>
      (!v.phase || collabPhase(c, t) === v.phase) &&
      (!v.brand || c.brand === v.brand) &&
      (!v.handler || c.handled_by === v.handler) &&
      (!q || [c.name, c.email, c.socials, c.vehicle, c.booking_ref, c.content, c.comment].some((x) => x && x.toLowerCase().includes(q)))
  );
  const lt = collabTotals(list, t);

  page.innerHTML = `
    ${pageHeader('Collaborators', 'Influencers & content creators – deals, trips, content and refunds', admin ? '<button class="btn" data-new>+ Collaborator</button>' : '')}
    ${
      totals.overdue
        ? `<button type="button" class="banner warn-banner" data-phase-jump="overdue">⚠ <b>${totals.overdue} trip${totals.overdue === 1 ? ' is' : 's are'} over</b> but the content hasn’t arrived yet – follow up →</button>`
        : ''
    }
    <div class="kpis">
      ${kpi('Collaborations', totals.count, `${totals.onTrip} on a trip now · ${count('upcoming')} upcoming`)}
      ${kpi('Total reach', num(totals.followers), 'followers')}
      ${kpi('Booking value', money(totals.price, 'EUR'), `${money(totals.net, 'EUR')} after refunds`)}
      ${kpi(
        'Refunds',
        money(totals.refundPaid, 'EUR'),
        totals.toRefund
          ? `paid · <b class="owed">${totals.refundPending ? `${money(totals.refundPending, 'EUR')} to pay` : 'refund amount not set'} (${totals.toRefund})</b>`
          : 'paid · nothing pending'
      )}
    </div>
    <div class="toolbar">
      <input class="input grow" type="search" placeholder="Search name, @handle, vehicle, booking…" value="${esc(v.q)}" data-q />
      <select class="input" data-f="brand" aria-label="Brand">${options(
        [
          { value: 'camper', label: 'Go Campers' },
          { value: 'car', label: 'Go Car Rentals' },
        ],
        v.brand,
        { empty: 'Both brands' }
      )}</select>
      ${handlers.length ? `<select class="input" data-f="handler" aria-label="Handled by">${options(handlers, v.handler, { empty: 'Anyone' })}</select>` : ''}
    </div>
    <div class="chips" style="margin-bottom:14px">${[{ value: '', label: 'All', n: all.length }, ...PHASE_FILTERS.map((p) => ({ value: p, label: COLLAB_PHASE_LABELS[p], n: count(p) }))]
      .map((f) => `<button type="button" data-phase="${f.value}" aria-pressed="${v.phase === f.value}" class="${f.value === 'overdue' && f.n ? 'alert' : ''}">${esc(f.label)}<span class="count">${f.n}</span></button>`)
      .join('')}</div>
    ${
      !all.length
        ? emptyBox('No collaborations yet', admin ? '<p>Add the first one with “+ Collaborator”.</p>' : '')
        : !list.length
          ? emptyBox('Nothing matches these filters')
          : `<section class="card collab-card">
        <div class="table-wrap"><table class="collab-table">
          <thead><tr><th>Creator</th><th class="r">Followers</th><th>Vehicle</th><th>Dates</th><th class="opt">By</th><th>Status</th><th class="r">Price</th><th class="r">Refund</th><th class="opt">Progress</th></tr></thead>
          <tbody>${list
            .map((c) => {
              const phase = collabPhase(c, t);
              return `<tr class="clickable ${phase === 'overdue' ? 'row-alert' : ''}" data-open="${c.id}">
                <td><b>${esc(c.name)}</b><div class="socs">${socialIcons(c)}</div></td>
                <td class="r num">${c.followers ? num(c.followers) : '–'}</td>
                <td>${esc(c.vehicle ?? '–')}${c.brand ? `<div class="muted small">${c.brand === 'camper' ? 'Go Campers' : 'Go Car Rentals'}</div>` : ''}</td>
                <td class="nowrap">${dates(c)}${c.booking_ref ? `<div class="muted small mono">${esc(c.booking_ref)}</div>` : ''}</td>
                <td class="opt">${esc(c.handled_by ?? '–')}</td>
                <td>${phaseBadge(phase)}</td>
                <td class="r num nowrap">${c.price_eur != null ? money(c.price_eur, 'EUR') : '–'}</td>
                <td class="r num nowrap">${c.refund_eur != null ? money(c.refund_eur, 'EUR') : '–'}</td>
                <td class="opt"><div class="flags">${flags(c)}</div></td>
              </tr>`;
            })
            .join('')}</tbody>
          <tfoot><tr><td><b>${lt.count} shown</b></td><td class="r num"><b>${num(lt.followers)}</b></td><td></td><td></td><td class="opt"></td><td class="muted small">net ${money(lt.net, 'EUR')}</td>
            <td class="r num nowrap"><b>${money(lt.price, 'EUR')}</b></td><td class="r num nowrap"><b>${money(lt.refund, 'EUR')}</b></td><td class="opt"></td></tr></tfoot>
        </table></div>
        <ul class="collab-cards">${list
          .map((c) => {
            const phase = collabPhase(c, t);
            return `<li class="${phase === 'overdue' ? 'row-alert' : ''}" data-open="${c.id}">
              <div class="cc-top"><b>${esc(c.name)}</b>${phaseBadge(phase)}</div>
              <div class="socs">${socialIcons(c)}</div>
              <div class="muted small">${[c.followers ? `${num(c.followers)} followers` : null, c.vehicle, c.pickup_date || c.dropoff_date ? dates(c) : null, c.handled_by].filter(Boolean).map(esc).join(' · ')}</div>
              <div class="cc-money num">${c.price_eur != null ? `<span>Price ${money(c.price_eur, 'EUR')}</span>` : ''}${c.refund_eur != null ? `<span>Refund ${money(c.refund_eur, 'EUR')}</span>` : ''}</div>
              <div class="flags">${flags(c)}</div>
            </li>`;
          })
          .join('')}</ul>
      </section>`
    }`;

  const rerender = () => render(page, ctx);
  page.querySelector('[data-q]').addEventListener('input', (e) => {
    v.q = e.target.value;
    clearTimeout(page._qTimer);
    page._qTimer = setTimeout(() => {
      rerender();
      const input = page.querySelector('[data-q]');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 250);
  });
  page.querySelectorAll('select[data-f]').forEach((sel) =>
    sel.addEventListener('change', () => {
      v[sel.dataset.f] = sel.value;
      rerender();
    })
  );
  page.onclick = (e) => {
    if (e.target.closest('a')) return; // social links open normally
    const b = e.target.closest('[data-phase], [data-phase-jump], [data-new], [data-open]');
    if (!b) return;
    const d = b.dataset;
    if (d.phase !== undefined || d.phaseJump) {
      v.phase = d.phaseJump ?? d.phase;
      rerender();
    } else if ('new' in d) collabModal({ status: 'request', brand: 'camper' }, ctx.refresh);
    else if (d.open) collabModal(all.find((c) => c.id === d.open), ctx.refresh);
  };
}

function collabModal(c, refresh) {
  const admin = isAdmin();
  const t = today();
  let status = c.status ?? 'request';
  const handlers = [...new Set((state.collaborators ?? []).map((x) => x.handled_by).filter(Boolean))];
  const m = openModal(
    c.id ? c.name : 'New collaborator',
    `<form>
      ${c.id ? `<div class="line" style="margin:-6px 0 4px">${phaseBadge(collabPhase(c, t))}<span class="muted small">updated ${esc(shortDate(c.updated_at?.slice(0, 10)))}</span></div>` : ''}
      <div class="field"><span>Status</span><div class="chips wrap-chips" data-status>${COLLAB_STATUSES.map(
        (s) => `<button type="button" data-v="${s.value}" title="${esc(s.hint)}" aria-pressed="${status === s.value}">${s.label}</button>`
      ).join('')}</div></div>

      <h3 class="sec">Creator</h3>
      <div class="form-grid">
        <label class="field"><span>Name *</span><input class="input" name="name" required value="${esc(c.name ?? '')}" /></label>
        <label class="field"><span>E-mail</span><input class="input" name="email" value="${esc(c.email ?? '')}" placeholder="one or more" /></label>
        <label class="field full"><span>Social media</span><textarea class="input" name="socials" rows="2" placeholder="Instagram / TikTok / YouTube links or @handles – one per line">${esc(c.socials ?? '')}</textarea></label>
        <label class="field"><span>Followers</span><input class="input num" type="number" min="0" name="followers" value="${esc(c.followers ?? '')}" placeholder="e.g. 12200" /></label>
      </div>

      <h3 class="sec">What they’ll create</h3>
      <label class="field"><textarea class="input" name="content" rows="4" placeholder="e.g. 2 reels, 1 TikTok, 20 edited photos, stories during the trip…">${esc(c.content ?? '')}</textarea></label>

      <h3 class="sec">Booking</h3>
      <div class="form-grid">
        <label class="field"><span>Brand</span><select class="input" name="brand">${options(
          [
            { value: 'camper', label: 'Go Campers' },
            { value: 'car', label: 'Go Car Rentals' },
          ],
          c.brand,
          { empty: '–' }
        )}</select></label>
        <label class="field"><span>Vehicle</span><input class="input" name="vehicle" value="${esc(c.vehicle ?? '')}" placeholder="e.g. Go Lite Auto" /></label>
        <label class="field"><span>Pick-up</span><input class="input" type="date" name="pickup_date" value="${esc(c.pickup_date ?? '')}" /></label>
        <label class="field"><span>Drop-off</span><input class="input" type="date" name="dropoff_date" value="${esc(c.dropoff_date ?? '')}" /></label>
        <label class="field"><span>Booking number</span><input class="input mono" name="booking_ref" value="${esc(c.booking_ref ?? '')}" /></label>
        <label class="field"><span>Handled by</span><input class="input" name="handled_by" list="collabHandlers" value="${esc(c.handled_by ?? '')}" placeholder="who deals with them" />
          <datalist id="collabHandlers">${handlers.map((h) => `<option value="${esc(h)}"></option>`).join('')}</datalist></label>
        <label class="field full"><span>Deal / terms</span><input class="input" name="terms" value="${esc(c.terms ?? '')}" placeholder="e.g. 35% discount + 150 € extras" /></label>
      </div>

      <h3 class="sec">Money</h3>
      <div class="form-grid">
        <label class="field"><span>Price (EUR)</span><input class="input num" type="number" step="0.01" min="0" name="price_eur" value="${esc(c.price_eur ?? '')}" /><small>What the booking costs them</small></label>
        <label class="field"><span>Refund (EUR)</span><input class="input num" type="number" step="0.01" min="0" name="refund_eur" value="${esc(c.refund_eur ?? '')}" /><small>Paid back once the content is delivered</small></label>
      </div>

      <h3 class="sec">Content & files</h3>
      <label class="check"><input type="checkbox" name="moodboard" ${c.moodboard ? 'checked' : ''} /> Moodboard received</label>
      <label class="check"><input type="checkbox" name="content_delivered" ${c.content_delivered ? 'checked' : ''} /> Content delivered</label>
      <label class="check"><input type="checkbox" name="in_onedrive" ${c.in_onedrive ? 'checked' : ''} /> Saved to OneDrive</label>
      <label class="field"><span>Link to content / folder</span><input class="input" name="content_link" value="${esc(c.content_link ?? '')}" placeholder="OneDrive, Google Drive, WeTransfer…" /></label>
      ${c.content_link ? `<a class="link-btn" href="${esc(c.content_link)}" target="_blank" rel="noreferrer">Open content ↗</a>` : ''}

      <label class="field"><span>Comment</span><textarea class="input" name="comment" rows="2">${esc(c.comment ?? '')}</textarea></label>
      ${admin ? `<button class="btn block" type="submit">${c.id ? 'Save' : 'Add collaborator'}</button>` : ''}
      ${admin && c.id ? '<button class="btn danger block" type="button" data-remove>Delete</button>' : ''}
    </form>`
  );
  const form = m.el.querySelector('form');
  m.el.querySelector('[data-status]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    status = b.dataset.v;
    m.el.querySelectorAll('[data-status] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (status === 'delivered' || status === 'done') form.content_delivered.checked = true;
  });
  // Ticking "content delivered" on an agreed deal moves it on to "Content delivered".
  form.content_delivered.addEventListener('change', () => {
    if (form.content_delivered.checked && (status === 'agreed' || status === 'request')) m.el.querySelector('[data-status] [data-v="delivered"]').click();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    if (f.pickup_date && f.dropoff_date && f.dropoff_date < f.pickup_date) return toast('Drop-off is before pick-up', 'error');
    try {
      await api('/api/collaborators', { method: 'POST', body: { ...f, id: c.id, status } });
      m.close();
      toast(c.id ? 'Saved' : 'Collaborator added');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-remove]')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${c.name}?`)) return;
    try {
      await api(`/api/collaborators?id=${c.id}`, { method: 'DELETE' });
      m.close();
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
