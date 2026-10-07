// Add / edit a partner.
import { emptyBox, pageHeader } from '../components.js';
import { AREAS, INTEREST, PARTNER_TYPES, STAGES } from '../lib.js';
import { api, isAdmin, loadData, state } from '../store.js';
import { esc, formData, options, toast } from '../util.js';

export function render(page, { params, query }) {
  if (!isAdmin()) {
    page.innerHTML = emptyBox('View only', 'Only the admin can edit partners.');
    return;
  }
  const editing = params[0] ? state.partners.find((x) => x.id === params[0]) : null;
  if (params[0] && !editing) {
    page.innerHTML = emptyBox('Partner not found');
    return;
  }
  const p = editing ?? {
    type: PARTNER_TYPES.some((t) => t.value === query.get('type')) ? query.get('type') : 'hotel',
    area: AREAS[0],
    stage: 'new',
  };
  const v = (k) => esc(p[k] ?? '');

  page.innerHTML = `
    <a class="back" href="${editing ? `#/partner/${p.id}` : `#/partners?type=${p.type}`}">← Back</a>
    ${pageHeader(editing ? `Edit ${p.name}` : 'New partner')}
    <form class="stack" id="partnerForm">
      <section class="card">
        <div class="card-head"><h2>Basics</h2></div>
        <div class="form-grid">
          <label class="field full"><span>Name *</span><input class="input" name="name" required value="${v('name')}" ${editing ? '' : 'autofocus'} /></label>
          <label class="field"><span>Type</span><select class="input" name="type">${options(PARTNER_TYPES.map((t) => ({ value: t.value, label: t.singular })), p.type)}</select></label>
          <label class="field"><span>Area</span><select class="input" name="area">${options(AREAS, p.area, { empty: '–' })}</select></label>
          <label class="field full"><span>Address</span><input class="input" name="address" value="${v('address')}" placeholder="Pósthússtræti 11" /></label>
          <label class="field"><span>Rooms</span><input class="input" type="number" inputmode="numeric" min="0" name="rooms" value="${v('rooms')}" /></label>
          <label class="field"><span>Stars</span><select class="input" name="stars">${options([1, 2, 3, 4, 5].map((s) => ({ value: s, label: '★'.repeat(s) })), p.stars, { empty: '–' })}</select></label>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Pipeline</h2></div>
        <div class="form-grid three">
          <label class="field"><span>Stage</span><select class="input" name="stage">${options(STAGES, p.stage)}</select></label>
          <label class="field"><span>Interest</span><select class="input" name="interest">${options(INTEREST, p.interest, { empty: '–' })}</select></label>
          <label class="field"><span>Next follow-up</span><input class="input" type="date" name="next_follow_up" value="${v('next_follow_up')}" /></label>
          <label class="field full" data-declined><span>Why declined</span><input class="input" name="declined_reason" value="${v('declined_reason')}" placeholder="Already works with another rental, chain policy…" /></label>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Affiliate</h2></div>
        <div class="form-grid">
          <label class="field"><span>Affiliate code</span><input class="input mono" name="affiliate_code" value="${v('affiliate_code')}" placeholder="HOTELBORG" /><small>Exactly as it appears in the Caren booking export – links sales to this partner.</small></label>
          <label class="field"><span>Affiliate link</span><input class="input" type="url" name="affiliate_url" value="${v('affiliate_url')}" placeholder="https://…" /></label>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Contact</h2></div>
        <div class="form-grid three">
          <label class="field"><span>Phone</span><input class="input" type="tel" name="phone" value="${v('phone')}" /></label>
          <label class="field"><span>E-mail</span><input class="input" type="email" name="email" value="${v('email')}" /></label>
          <label class="field"><span>Website</span><input class="input" name="website" value="${v('website')}" placeholder="example.is" /></label>
        </div>
        <p class="muted small" style="margin-top:10px">Contact people (manager, reception…) are added on the partner page.</p>
      </section>
      <section class="card">
        <div class="card-head"><h2>Notes</h2></div>
        <textarea class="input" name="notes" rows="4">${v('notes')}</textarea>
      </section>
      <div class="controls"><button class="btn" type="submit">${editing ? 'Save changes' : 'Add partner'}</button><a class="btn secondary" href="${editing ? `#/partner/${p.id}` : '#/partners'}">Cancel</a></div>
    </form>`;

  const form = page.querySelector('#partnerForm');
  const toggleDeclined = () => (page.querySelector('[data-declined]').hidden = form.stage.value !== 'declined');
  form.stage.addEventListener('change', toggleDeclined);
  toggleDeclined();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = formData(form);
    if (editing) body.id = editing.id;
    try {
      const saved = await api('/api/partners', { method: 'POST', body });
      await loadData();
      toast(editing ? 'Saved' : 'Partner added');
      location.hash = `#/partner/${saved.id}`;
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
