// One partner: pipeline controls, quick visit logging, contacts, activity log, affiliate results.
import { emptyBox, followUpPill, interestBadge, miniKpi, stageBadge } from '../components.js';
import { ACTIVITY_TYPES, activityLabel, brandLabel, codeKey, INTEREST, nextPlannedVisit, saleValue, shiftDate, STAGES, today, totals, typeLabel, VISIT_OUTCOMES, visitStats } from '../lib.js';
import { api, currency, isAdmin, loadSales, state } from '../store.js';
import { affiliateModal, affiliateRows, wireAffiliateRows } from './affiliates.js';
import { planVisits } from './tasks.js';
import { copyText, dateTime, esc, formData, fullDate, money, nowLocalInput, openModal, options, shortDate, toast } from '../util.js';

const FOLLOW_UPS = [
  { label: '+3 days', days: 3 },
  { label: '+1 week', days: 7 },
  { label: '+2 weeks', days: 14 },
  { label: '+1 month', days: 30 },
];

export async function render(page, { params, refresh, isCurrent }) {
  const p = state.partners.find((x) => x.id === params[0]);
  if (!p) {
    page.innerHTML = emptyBox('Partner not found', '<a class="link-btn" href="#/partners">Back to partners</a>');
    return;
  }
  const contacts = state.contacts.filter((c) => c.partner_id === p.id);
  const activities = state.activities.filter((a) => a.partner_id === p.id);
  const visits = visitStats(activities).get(p.id);
  const planned = nextPlannedVisit(p.id, state.tasks);
  const admin = isAdmin();
  const cur = currency.value;
  const open = !['accepted', 'declined'].includes(p.stage);
  const showAffiliate = ['in_talks', 'accepted'].includes(p.stage) || !!p.affiliate_code || state.affiliates.some((a) => a.partner_id === p.id);

  page.innerHTML = `
    <a class="back" href="#/partners?type=${p.type}">← ${esc(typeLabel(p.type))}s</a>
    <div class="detail-head">
      <div>
        <h1 class="page-title">${esc(p.name)}</h1>
        <div class="badges">${stageBadge(p.stage)}${interestBadge(p.interest)}${visits ? `<span class="pill">${visits.count}× visited · last ${shortDate(visits.last)}</span>` : ''}${planned ? `<a class="pill ${planned < today() ? 'overdue' : planned === today() ? 'today' : ''}" href="#/tasks">📅 Visit planned ${planned === today() ? 'today' : shortDate(planned)}</a>` : ''}
          <span class="muted small">${esc([typeLabel(p.type), p.area, p.rooms ? `${p.rooms} rooms` : null, p.stars ? '★'.repeat(p.stars) : null].filter(Boolean).join(' · '))}</span>
        </div>
      </div>
      ${admin ? `<div class="controls"><a class="btn secondary" href="#/partner/${p.id}/edit">Edit</a><button class="btn secondary" data-plan-visit>Plan visit</button><button class="btn" data-log>+ Log visit</button></div>` : ''}
    </div>

    <div class="grid grid-side" style="margin-top:0">
      <div class="stack">
        ${
          admin
            ? `<section class="card">
            <div class="card-head"><h2>Pipeline</h2></div>
            <div class="stage-picker">${STAGES.map((s) => `<button type="button" title="${esc(s.hint)}" data-stage="${s.value}" aria-pressed="${p.stage === s.value}">${s.label}</button>`).join('')}</div>
            <div class="line"><span class="lbl">Interest</span><div class="chips">${INTEREST.map(
              (i) => `<button type="button" data-interest="${i.value}" aria-pressed="${p.interest === i.value}">${i.label}</button>`
            ).join('')}</div></div>
            ${
              open
                ? `<div class="line"><span class="lbl">Follow-up</span>${followUpPill(p.next_follow_up)}
                    <div class="chips">${FOLLOW_UPS.map((f) => `<button type="button" data-follow="${f.days}">${f.label}</button>`).join('')}
                    ${p.next_follow_up ? '<button type="button" data-follow="clear">Clear</button>' : ''}</div></div>`
                : ''
            }
            ${p.stage === 'declined' && p.declined_reason ? `<p class="muted" style="margin-top:12px">Declined: ${esc(p.declined_reason)}</p>` : ''}
          </section>`
            : ''
        }
        ${showAffiliate ? '<section class="card" id="perf"><div class="card-head"><h2>Partnership &amp; bookings</h2></div><p class="empty">Loading…</p></section>' : ''}
        <section class="card">
          <div class="card-head"><h2>Activity <span class="muted">(${activities.length})</span></h2></div>
          ${
            activities.length
              ? `<ol class="timeline">${activities
                  .map((a) => {
                    const who = contacts.find((c) => c.id === a.contact_id);
                    return `<li><div class="when"><b>${esc(activityLabel(a.type))}</b><span>${dateTime(a.happened_at)}</span>${who ? `<span>with ${esc(who.name)}</span>` : ''}
                      ${admin ? `<button class="link-btn muted" style="margin-left:auto" data-del-activity="${a.id}">Delete</button>` : ''}</div>
                      ${a.summary ? `<p>${esc(a.summary)}</p>` : ''}</li>`;
                  })
                  .join('')}</ol>`
              : `<p class="empty">Nothing logged yet.${admin ? ' Tap “Log visit” after you’ve been there.' : ''}</p>`
          }
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>Contact people</h2>${admin ? '<button class="link-btn" data-contact="new">+ Add</button>' : ''}</div>
          ${
            contacts.length
              ? `<ul class="contacts">${contacts
                  .map(
                    (c) => `<li>
                    <div class="top-line"><b>${esc(c.name)}</b>${c.is_primary ? '<span class="tag-main">Main</span>' : ''}
                      ${admin ? `<span class="actions"><button class="link-btn muted" data-contact="${c.id}">Edit</button><button class="link-btn muted" data-del-contact="${c.id}">Remove</button></span>` : ''}</div>
                    ${c.role ? `<div class="muted small">${esc(c.role)}</div>` : ''}
                    <div class="small" style="display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:2px">
                      ${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}
                    </div>
                    ${c.notes ? `<div class="small muted" style="margin-top:2px">${esc(c.notes)}</div>` : ''}
                  </li>`
                  )
                  .join('')}</ul>`
              : '<p class="empty">No contact people yet.</p>'
          }
        </section>
        <section class="card">
          <div class="card-head"><h2>Details</h2></div>
          <dl class="details">
            ${[
              ['Address', p.address && esc(p.address)],
              ['Phone', p.phone && `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>`],
              ['E-mail', p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`],
              ['Website', p.website && `<a href="${esc(/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`)}" target="_blank" rel="noreferrer">${esc(p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`],
              ['Partner since', p.accepted_at && fullDate(p.accepted_at)],
              ['Added', fullDate(p.created_at)],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
              .join('')}
          </dl>
          ${p.notes ? `<div class="notes">${esc(p.notes)}</div>` : ''}
        </section>
        ${admin ? '<button class="btn danger block" data-delete>Delete partner</button>' : ''}
      </div>
    </div>
    ${admin ? '<button class="fab" data-log>+ Log visit</button>' : ''}`;

  // ── Actions ──
  const patch = async (body, message = 'Saved') => {
    try {
      await api('/api/partners', { method: 'POST', body: { id: p.id, ...body } });
      toast(message);
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  page.onclick = async (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    const d = el.dataset;
    if (d.stage && d.stage !== p.stage) patch({ stage: d.stage }, `Moved to ${STAGES.find((s) => s.value === d.stage).label}`);
    else if (d.interest) patch({ interest: p.interest === Number(d.interest) ? null : Number(d.interest) });
    else if (d.follow) patch({ next_follow_up: d.follow === 'clear' ? null : shiftDate(today(), Number(d.follow)) }, 'Follow-up set');
    else if ('log' in d) logActivity(p, contacts, refresh);
    else if ('planVisit' in d) planVisits(planned ?? shiftDate(today(), 1), refresh, [p.id]);
    else if (d.contact) contactForm(p, d.contact === 'new' ? { is_primary: contacts.length === 0 } : contacts.find((c) => c.id === d.contact), refresh);
    else if (d.delContact && confirm('Remove this contact?')) remove(`/api/contacts?id=${d.delContact}`, refresh);
    else if (d.delActivity && confirm('Delete this entry?')) remove(`/api/activities?id=${d.delActivity}`, refresh);
    else if ('delete' in d && confirm(`Delete ${p.name} including its contacts and activity log?`)) {
      await remove(`/api/partners?id=${p.id}`, () => {});
      location.hash = `#/partners?type=${p.type}`;
    }
  };

  if (showAffiliate) await renderPerformance(page, p, cur, isCurrent, refresh);
}

async function remove(path, done) {
  try {
    await api(path, { method: 'DELETE' });
    toast('Deleted');
    await done();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function renderPerformance(page, p, cur, isCurrent, refresh) {
  const el = page.querySelector('#perf');
  const people = state.affiliates.filter((a) => a.partner_id === p.id);
  const codes = new Set([p.affiliate_code, ...people.map((a) => a.code)].filter(Boolean).map(codeKey));
  // All bookings since a year before they became a partner (and anything booked ahead).
  const from = shiftDate(p.accepted_at || p.created_at.slice(0, 10), -365);
  const allSales = await loadSales(from, shiftDate(today(), 400));
  if (!isCurrent()) return;
  const sales = allSales.filter((s) => codes.has(codeKey(s.affiliate_code)));
  const all = totals(sales, cur);
  const last30 = totals(
    sales.filter((s) => s.booking_date >= shiftDate(today(), -29) && s.booking_date <= today()),
    cur
  );
  const first = sales.filter((s) => !s.is_cancelled).at(-1)?.booking_date;
  const via = (s) => people.find((a) => codeKey(a.code) === codeKey(s.affiliate_code))?.name ?? 'Hotel code';
  el.innerHTML = `
    <div class="card-head"><h2>Partnership &amp; bookings</h2>${p.affiliate_code ? `<span class="sub">hotel code <span class="code">${esc(p.affiliate_code)}</span></span>` : ''}</div>
    ${
      p.affiliate_url
        ? `<div class="line" style="margin:0 0 14px"><span class="mono muted" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.affiliate_url)}</span><button class="btn secondary sm" data-copy>Copy link</button></div>`
        : !p.affiliate_code
          ? `<p class="muted" style="margin-bottom:12px">No hotel code yet – add it under <a class="link-btn" href="#/partner/${p.id}/edit">Edit → Partnership</a> once it’s set up in Caren. Staff below can still get their own codes.</p>`
          : ''
    }
    <div class="mini-kpis">
      ${miniKpi('Bookings', all.bookings, people.length ? 'hotel + people' : 'total')}
      ${miniKpi('Revenue', money(all.revenue, cur), 'total')}
      ${miniKpi('Last 30 days', money(last30.revenue, cur), `${last30.bookings} bookings`)}
      ${miniKpi('First booking', first ? shortDate(first) : '–')}
    </div>

    <div class="card-head" style="margin-top:18px"><h2>Staff with personal codes <span class="muted">(${people.length})</span></h2>
      ${isAdmin() ? '<button class="link-btn" data-add-aff>+ Add person</button>' : ''}</div>
    ${
      people.length
        ? `<ul class="aff-list">${affiliateRows(people, allSales)}</ul>`
        : `<div class="explain"><div><b>How it works</b><span>A receptionist or concierge who recommends you gets a personal code. When a guest books with it and the rental is over, they earn a commission. Once they confirm, print their business card with a QR code.</span></div></div>`
    }

    ${
      sales.length
        ? `<h3 class="sec" style="margin-top:18px">Latest bookings</h3><div class="table-wrap"><table class="num"><thead><tr><th>Booked</th><th>Ref</th><th>Via</th><th class="opt">Brand</th><th class="r">Amount</th></tr></thead><tbody>
          ${sales
            .slice(0, 10)
            .map(
              (s) => `<tr class="${s.is_cancelled ? 'cancelled' : ''}"><td class="nowrap">${shortDate(s.booking_date)}</td><td class="mono">${esc(s.booking_ref)}</td>
                <td>${esc(via(s))}</td><td class="opt">${esc(brandLabel(s.brand))}</td><td class="r nowrap">${money(saleValue(s, cur), cur)}</td></tr>`
            )
            .join('')}</tbody></table></div>`
        : '<p class="empty">No bookings with these codes yet.</p>'
    }`;
  el.querySelector('[data-copy]')?.addEventListener('click', () => copyText(p.affiliate_url));
  el.querySelector('[data-add-aff]')?.addEventListener('click', () => affiliateModal({ partner_id: p.id }, p, refresh));
  wireAffiliateRows(el, allSales, refresh);
}

export function logActivity(p, contacts, refresh) {
  const nextStage = p.stage === 'new' ? 'contacted' : p.stage;
  const m = openModal(
    `Log visit – ${p.name}`,
    `<form>
      <div class="chips" data-type>${ACTIVITY_TYPES.map((t, i) => `<button type="button" data-v="${t.value}" aria-pressed="${i === 0}">${t.label}</button>`).join('')}</div>
      <div class="form-grid">
        <label class="field"><span>When</span><input class="input" type="datetime-local" name="when" value="${nowLocalInput()}" required /></label>
        <label class="field"><span>With</span><select class="input" name="contact_id">${options(contacts.map((c) => ({ value: c.id, label: c.name })), '', { empty: '–' })}</select></label>
      </div>
      <div class="chips wrap-chips" data-outcomes>${VISIT_OUTCOMES.map((o) => `<button type="button" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <label class="field"><span>What happened</span><textarea class="input" name="summary" rows="4" placeholder="Talked to the front office manager, left flyers, she will ask the GM…"></textarea></label>
      <div class="form-grid">
        <label class="field"><span>Stage after this</span><select class="input" name="stage">${options(STAGES, nextStage)}</select></label>
        <label class="field"><span>Next follow-up</span><input class="input" type="date" name="next_follow_up" value="${esc(p.next_follow_up ?? '')}" /></label>
      </div>
      <div class="chips">${FOLLOW_UPS.map((f) => `<button type="button" data-days="${f.days}">${f.label}</button>`).join('')}</div>
      <button class="btn block" type="submit">Save</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  let type = ACTIVITY_TYPES[0].value;
  m.el.querySelector('[data-type]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    type = b.dataset.v;
    m.el.querySelectorAll('[data-type] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  m.el.querySelector('[data-outcomes]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-o]');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    const lines = form.summary.value.split('\n').filter((l) => l.trim() && l.trim() !== b.dataset.o);
    if (on) lines.unshift(b.dataset.o);
    form.summary.value = lines.join('\n');
  });
  m.el.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => (form.next_follow_up.value = shiftDate(today(), Number(b.dataset.days)))));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    const partner = {};
    if (f.stage !== p.stage) partner.stage = f.stage;
    if ((f.next_follow_up || null) !== p.next_follow_up) partner.next_follow_up = f.next_follow_up || null;
    try {
      await api('/api/activities', {
        method: 'POST',
        // local_date lets the server tick off visits planned up to this (local) day
        body: { partner_id: p.id, type, happened_at: new Date(f.when).toISOString(), local_date: f.when.slice(0, 10), contact_id: f.contact_id || null, summary: f.summary, partner },
      });
      m.close();
      toast('Logged');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function contactForm(p, c, refresh) {
  const m = openModal(
    c.id ? 'Edit contact' : 'New contact',
    `<form>
      <label class="field"><span>Name *</span><input class="input" name="name" required value="${esc(c.name ?? '')}" /></label>
      <label class="field"><span>Role</span><input class="input" name="role" value="${esc(c.role ?? '')}" placeholder="Front office manager, concierge, GM…" /></label>
      <div class="form-grid">
        <label class="field"><span>Phone</span><input class="input" type="tel" name="phone" value="${esc(c.phone ?? '')}" /></label>
        <label class="field"><span>E-mail</span><input class="input" type="email" name="email" value="${esc(c.email ?? '')}" /></label>
      </div>
      <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="2" placeholder="Works mornings, prefers WhatsApp…">${esc(c.notes ?? '')}</textarea></label>
      <label class="check"><input type="checkbox" name="is_primary" ${c.is_primary ? 'checked' : ''} /> Main contact</label>
      <button class="btn block" type="submit">Save contact</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/contacts', { method: 'POST', body: { ...formData(form), id: c.id, partner_id: p.id } });
      m.close();
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
