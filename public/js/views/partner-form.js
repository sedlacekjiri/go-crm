// Add / edit a partner – a step-by-step form in plain words:
//   1 The place · 2 Who you talked to (new only) · 3 Where you are with them · 4 Partnership (only for partners)
import { emptyBox, pageHeader } from '../components.js';
import { AREAS, capacityOf, hasStars, INTEREST, PARTNER_TYPES, shiftDate, today } from '../lib.js';
import { api, isAdmin, loadData, state } from '../store.js';
import { esc, formData, options, toast } from '../util.js';

// The pipeline explained the way it happens on the street.
const STAGE_CHOICES = [
  { value: 'new', label: 'To visit', text: 'I haven’t been there yet' },
  { value: 'contacted', label: 'Visited', text: 'I’ve been there – talked to someone, left info or flyers' },
  { value: 'in_talks', label: 'Interested', text: 'They like it – I need to come back or meet the manager' },
  { value: 'accepted', label: 'Partner', text: 'They said yes – they’ll recommend us' },
  { value: 'declined', label: 'Declined', text: 'They said no (for now)' },
];

const INTEREST_TEXT = { 1: 'Not really', 2: 'Some interest', 3: 'Very keen' };

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
  const people = editing ? state.affiliates.filter((a) => a.partner_id === editing.id).length : 0;
  let stage = p.stage;
  let type = p.type;
  let interest = p.interest ?? null;
  let stars = p.stars ?? null;

  const typeLabel = () => PARTNER_TYPES.find((t) => t.value === type)?.singular.toLowerCase() ?? 'place';

  page.innerHTML = `
    <a class="back" href="${editing ? `#/partner/${p.id}` : `#/partners?type=${p.type}`}">← Back</a>
    ${pageHeader(editing ? `Edit ${p.name}` : 'Add a place', editing ? '' : 'A hotel, guesthouse, hostel, campsite, café… that you want to work with. Only the name is required – the rest can be filled in later.')}
    <form class="stack" id="partnerForm" novalidate>

      <section class="card step">
        <div class="step-head"><span class="step-n">1</span><div><h2>The place</h2><p>What is it and where?</p></div></div>
        <label class="field"><span>Name *</span><input class="input input-lg" name="name" required value="${v('name')}" placeholder="e.g. Hotel Borg" ${editing ? '' : 'autofocus'} /></label>
        <div class="field"><span>Type</span><div class="chips wrap-chips" data-type>${PARTNER_TYPES.map(
          (t) => `<button type="button" data-v="${t.value}" aria-pressed="${type === t.value}">${t.singular}</button>`
        ).join('')}</div></div>
        <div class="form-grid">
          <label class="field"><span>Area</span><select class="input" name="area">${options(AREAS, p.area, { empty: '–' })}</select></label>
          <label class="field"><span>Street address</span><input class="input" name="address" value="${v('address')}" placeholder="Pósthússtræti 11" /></label>
        </div>
        <div class="form-grid" data-size-row>
          <label class="field" data-capacity-field><span data-capacity-label>Number of rooms</span><input class="input" type="number" inputmode="numeric" min="0" name="rooms" value="${v('rooms')}" placeholder="e.g. 99" /><small data-capacity-hint></small></label>
          <div class="field" data-stars-field><span>Stars</span><div class="chips" data-stars>${[1, 2, 3, 4, 5]
            .map((s) => `<button type="button" data-v="${s}" aria-pressed="${stars === s}">${'★'.repeat(s)}</button>`)
            .join('')}</div></div>
        </div>
        <details class="more-fields" ${p.phone || p.email || p.website ? 'open' : ''}>
          <summary>Reception phone, e-mail, website</summary>
          <div class="form-grid three">
            <label class="field"><span>Phone</span><input class="input" type="tel" name="phone" value="${v('phone')}" /></label>
            <label class="field"><span>E-mail</span><input class="input" type="email" name="email" value="${v('email')}" /></label>
            <label class="field"><span>Website</span><input class="input" name="website" value="${v('website')}" placeholder="hotelborg.is" /></label>
          </div>
        </details>
      </section>

      ${
        editing
          ? ''
          : `<section class="card step">
        <div class="step-head"><span class="step-n">2</span><div><h2>Who did you talk to?</h2><p>Optional – the person you met or should ask for. You can add more people later.</p></div></div>
        <div class="form-grid">
          <label class="field"><span>Name</span><input class="input" name="c_name" placeholder="e.g. Anna Jónsdóttir" /></label>
          <label class="field"><span>Role</span><input class="input" name="c_role" placeholder="Front office manager, receptionist, GM…" /></label>
          <label class="field"><span>Phone</span><input class="input" type="tel" name="c_phone" /></label>
          <label class="field"><span>E-mail</span><input class="input" type="email" name="c_email" /></label>
        </div>
      </section>`
      }

      <section class="card step">
        <div class="step-head"><span class="step-n">${editing ? 2 : 3}</span><div><h2>Where are you with them?</h2><p>Pick what’s true right now. You’ll move it forward after each visit.</p></div></div>
        <div class="stage-cards" data-stage>${STAGE_CHOICES.map(
          (s) => `<button type="button" class="stage-card" data-v="${s.value}" aria-pressed="${stage === s.value}"><b>${s.label}</b><span>${s.text}</span></button>`
        ).join('')}</div>
        <p class="hint" data-visit-hint></p>
        <div data-open-only>
          <div class="field" style="margin-top:14px"><span>How interested are they?</span><div class="chips wrap-chips" data-interest>${INTEREST.map(
            (i) => `<button type="button" data-v="${i.value}" aria-pressed="${interest === i.value}">${i.label} · ${INTEREST_TEXT[i.value]}</button>`
          ).join('')}</div></div>
          <div class="field" style="margin-top:14px"><span>When should you go back / follow up?</span>
            <div class="follow-row"><input class="input" type="date" name="next_follow_up" value="${v('next_follow_up')}" />
              <div class="chips wrap-chips">${[
                ['Tomorrow', 1],
                ['In 3 days', 3],
                ['Next week', 7],
                ['In 2 weeks', 14],
              ]
                .map(([l, d]) => `<button type="button" data-follow="${d}">${l}</button>`)
                .join('')}</div></div>
            <small>It shows up in Tasks on that day.</small>
          </div>
        </div>
        <label class="field" data-declined-only style="margin-top:14px"><span>Why did they say no?</span><input class="input" name="declined_reason" value="${v('declined_reason')}" placeholder="Already works with another rental, chain policy…" /></label>
      </section>

      <section class="card step" data-partner-only>
        <div class="step-head"><span class="step-n">${editing ? 3 : 4}</span><div><h2>Partnership</h2><p>How bookings from this ${esc(typeLabel())} are tracked. You can fill this in later.</p></div></div>
        <div class="explain">
          <div><b>Hotel code</b><span>One code for the whole ${esc(typeLabel())} – on the QR stand at reception, on their website or in guest e-mails.</span></div>
          <div><b>Personal codes for staff</b><span>Receptionists or concierges who recommend you get their own code, a business card and a commission. Add them on the ${esc(typeLabel())}’s page after saving${people ? ` (${people} added)` : ''}.</span></div>
        </div>
        <div class="form-grid">
          <label class="field"><span>Hotel code</span><input class="input mono" name="affiliate_code" value="${v('affiliate_code')}" placeholder="e.g. BORG" /><small>The same code you set up in Caren – bookings with it are counted for this ${esc(typeLabel())}.</small></label>
          <label class="field"><span>Booking link with the code</span><input class="input" type="url" name="affiliate_url" value="${v('affiliate_url')}" placeholder="https://…" /><small>Used for the QR code and the staff links.</small></label>
        </div>
      </section>

      <section class="card step">
        <div class="step-head"><span class="step-n">✎</span><div><h2>Notes</h2><p>Anything worth remembering – best time to come, who decides, parking…</p></div></div>
        <textarea class="input" name="notes" rows="3">${v('notes')}</textarea>
      </section>

      <div class="form-actions">
        <button class="btn" type="submit">${editing ? 'Save changes' : 'Add place'}</button>
        <a class="btn secondary" href="${editing ? `#/partner/${p.id}` : '#/partners'}">Cancel</a>
      </div>
    </form>`;

  const form = page.querySelector('#partnerForm');
  const show = (sel, on) => page.querySelectorAll(sel).forEach((el) => el.classList.toggle('hidden', !on));

  const sync = () => {
    // Size means rooms, beds or pitches depending on the kind of place; stars only for hotels & guesthouses.
    const cap = capacityOf(type);
    show('[data-size-row]', !!cap);
    show('[data-capacity-field]', !!cap);
    show('[data-stars-field]', hasStars(type));
    if (cap) {
      page.querySelector('[data-capacity-label]').textContent = `Number of ${cap}`;
      page.querySelector('[data-capacity-hint]').textContent =
        cap === 'pitches' ? 'More pitches = more campers & road-trippers.' : cap === 'beds' ? 'Busy hostels = lots of young travellers renting together.' : 'Bigger hotels = more guests who need a car.';
    }
    show('[data-open-only]', ['new', 'contacted', 'in_talks'].includes(stage));
    show('[data-declined-only]', stage === 'declined');
    show('[data-partner-only]', stage === 'accepted');
    const hint = page.querySelector('[data-visit-hint]');
    const leavingNew = (!editing || editing.stage === 'new') && stage !== 'new';
    hint.textContent = leavingNew ? '✓ This counts as a visit today in your Goals.' : '';
  };

  // Chip groups → local state.
  const group = (sel, set) =>
    page.querySelector(sel).addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      const wasOn = b.getAttribute('aria-pressed') === 'true';
      const value = set(b.dataset.v, wasOn);
      page.querySelectorAll(`${sel} [data-v]`).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(value))));
      sync();
    });
  group('[data-type]', (val) => (type = val));
  group('[data-stage]', (val) => (stage = val));
  group('[data-interest]', (val, wasOn) => (interest = wasOn ? null : Number(val)));
  group('[data-stars]', (val, wasOn) => (stars = wasOn ? null : Number(val)));
  page.querySelectorAll('[data-follow]').forEach((b) => b.addEventListener('click', () => (form.next_follow_up.value = shiftDate(today(), Number(b.dataset.follow)))));
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    if (!f.name.trim()) {
      form.name.focus();
      return toast('Give it a name', 'error');
    }
    const body = {
      name: f.name,
      type,
      area: f.area || null,
      address: f.address,
      rooms: capacityOf(type) ? f.rooms : null,
      stars: hasStars(type) ? stars : null,
      phone: f.phone,
      email: f.email,
      website: f.website,
      stage,
      interest: ['new', 'contacted', 'in_talks'].includes(stage) ? interest : editing?.interest ?? interest,
      next_follow_up: ['new', 'contacted', 'in_talks'].includes(stage) ? f.next_follow_up || null : null,
      declined_reason: stage === 'declined' ? f.declined_reason : editing?.declined_reason ?? null,
      affiliate_code: f.affiliate_code,
      affiliate_url: f.affiliate_url,
      notes: f.notes,
    };
    if (editing) body.id = editing.id;
    try {
      const saved = await api('/api/partners', { method: 'POST', body });
      if (!editing && f.c_name?.trim()) {
        await api('/api/contacts', {
          method: 'POST',
          body: { partner_id: saved.id, name: f.c_name, role: f.c_role, phone: f.c_phone, email: f.c_email, is_primary: true },
        });
      }
      await loadData();
      toast(editing ? 'Saved' : `${saved.name} added`);
      location.hash = `#/partner/${saved.id}`;
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
