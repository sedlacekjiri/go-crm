// One partner: pipeline controls, quick visit logging, contacts, activity log, affiliate results.
import { emptyBox, followUpPill, interestBadge, miniKpi, stageBadge } from '../components.js';
import { ACTIVITY_TYPES, activityLabel, brandLabel, capacityText, codeKey, INTEREST, mapsUrls, nextPlannedVisit, saleValue, shiftDate, STAGES, today, totals, typeLabel, VISIT_OUTCOMES, visitStats } from '../lib.js';
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
  const maps = mapsUrls(p);
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
        <div class="badges">${p.chain ? `<span class="chain-tag">${esc(p.chain)}</span>` : ''}${stageBadge(p.stage)}${interestBadge(p.interest)}${visits ? `<span class="pill">${visits.count}× visited · last ${shortDate(visits.last)}</span>` : ''}${p.welcome_sent ? `<span class="pill good">✉️ Welcome e-mail ${shortDate(p.welcome_sent)}</span>` : ''}${planned ? `<a class="pill ${planned < today() ? 'overdue' : planned === today() ? 'today' : ''}" href="#/tasks">📅 Visit planned ${planned === today() ? 'today' : shortDate(planned)}</a>` : ''}
          <span class="muted small">${esc([typeLabel(p.type), p.area, capacityText(p), p.stars ? '★'.repeat(p.stars) : null].filter(Boolean).join(' · '))}</span>
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
            <div class="line"><span class="lbl">Welcome e-mail</span>${
              p.welcome_sent ? `<span class="pill good">✓ Sent ${shortDate(p.welcome_sent)}</span>` : '<span class="pill">Not sent yet</span>'
            }
              <div class="chips">${p.welcome_sent ? '' : '<button type="button" data-welcome="today">Sent today</button>'}
                <input class="input welcome-date" type="date" max="${today()}" value="${p.welcome_sent ?? ''}" data-welcome-date aria-label="Date the welcome e-mail was sent" />
                ${p.welcome_sent ? '<button type="button" data-welcome="clear">Clear</button>' : ''}</div></div>
            ${
              p.welcome_sent
                ? `<div class="line"><span class="lbl">Reply</span>${p.welcome_reply ? `<span class="pill good">✓ Replied ${shortDate(p.welcome_reply)}</span>` : '<span class="pill">No reply yet</span>'}
              <div class="chips">${p.welcome_reply ? '' : '<button type="button" data-reply="today">Replied today</button>'}
                <input class="input welcome-date" type="date" min="${p.welcome_sent}" max="${today()}" value="${p.welcome_reply ?? ''}" data-reply-date aria-label="Date they replied to the welcome e-mail" />
                ${p.welcome_reply ? '<button type="button" data-reply="clear">Clear</button>' : ''}</div></div>`
                : ''
            }
            ${['declined', 'on_hold'].includes(p.stage) && p.declined_reason ? `<p class="muted" style="margin-top:12px">${p.stage === 'on_hold' ? 'On hold' : 'Declined'}: ${esc(p.declined_reason)}</p>` : ''}
          </section>`
            : ''
        }
        ${showAffiliate ? '<section class="card" id="perf"><div class="card-head"><h2>Partnership &amp; bookings</h2></div><p class="empty">Loading…</p></section>' : ''}
        <section class="card">
          <div class="card-head"><h2>Activity <span class="muted">(${activities.length})</span></h2>${admin ? '<button class="link-btn" data-followup-mail>+ Follow-up e-mail</button>' : ''}</div>
          ${
            activities.length
              ? `<ol class="timeline">${activities
                  .map((a) => {
                    const who = contacts.find((c) => c.id === a.contact_id);
                    return `<li><div class="when"><b>${esc(activityLabel(a.type))}</b><span>${dateTime(a.happened_at)}</span>${who ? `<span>with ${esc(who.name)}</span>` : ''}
                      ${admin ? `<span style="margin-left:auto"><button class="link-btn muted" data-date-activity="${a.id}">Change date</button> <button class="link-btn muted" data-del-activity="${a.id}">Delete</button></span>` : ''}</div>
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
              [
                'Address',
                `<a href="${maps.open}" target="_blank" rel="noreferrer">${p.address ? esc(p.address) : 'Find on Google Maps'}</a>
                 <a class="maps-go" href="${maps.directions}" target="_blank" rel="noreferrer">Directions ↗</a>`,
              ],
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

  // The first time it's marked, the e-mail also goes into the activity log (so "last contact" counts it).
  const setWelcome = async (date) => {
    try {
      if (date && !p.welcome_sent) {
        await api('/api/activities', { method: 'POST', body: { partner_id: p.id, type: 'email', happened_at: dayToIso(date), summary: 'Welcome e-mail sent' } });
      }
      await patch({ welcome_sent: date }, date ? 'Welcome e-mail marked as sent' : 'Cleared');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  page.querySelector('[data-welcome-date]')?.addEventListener('change', (e) => setWelcome(e.target.value || null));
  // Same for their reply to it.
  const setReply = async (date) => {
    try {
      if (date && !p.welcome_reply) {
        await api('/api/activities', { method: 'POST', body: { partner_id: p.id, type: 'email', happened_at: dayToIso(date), summary: 'Replied to the welcome e-mail' } });
      }
      await patch({ welcome_reply: date }, date ? 'Reply marked' : 'Cleared');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  page.querySelector('[data-reply-date]')?.addEventListener('change', (e) => setReply(e.target.value || null));

  page.onclick = async (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    const d = el.dataset;
    if (d.stage && d.stage !== p.stage) {
      const moved = `Moved to ${STAGES.find((s) => s.value === d.stage).label}`;
      const visited_on = p.stage === 'new' ? await askVisitDate(p) : undefined;
      if (d.stage !== 'on_hold') return patch({ stage: d.stage, visited_on }, moved);
      patch({ stage: 'on_hold', visited_on, ...(await askHold(p)) }, moved);
    } else if (d.dateActivity) activityDate(activities.find((a) => a.id === d.dateActivity), refresh);
    else if (d.interest) patch({ interest: p.interest === Number(d.interest) ? null : Number(d.interest) });
    else if (d.follow) patch({ next_follow_up: d.follow === 'clear' ? null : shiftDate(today(), Number(d.follow)) }, 'Follow-up set');
    else if (d.welcome) setWelcome(d.welcome === 'clear' ? null : today());
    else if (d.reply) setReply(d.reply === 'clear' ? null : today());
    else if ('followupMail' in d) followUpMail(p, refresh);
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

// Leaving "To visit" records a visit: ask which day it was, since it's often confirmed later.
// Resolves with the date, or never if the window is closed.
export const askVisitDate = (p) => askDay(`When did you visit ${p.name}?`, 'Date of the visit').then((r) => r.day);

// A window asking for a day (up to today), optionally with a note. Resolves with { day, note }.
function askDay(title, label, { note = false } = {}) {
  return new Promise((resolve) => {
    const m = openModal(
      title,
      `<form>
        <div class="chips">${[0, 1, 2, 3].map((n) => `<button type="button" data-ago="${n}" aria-pressed="${n === 0}">${n === 0 ? 'Today' : n === 1 ? 'Yesterday' : shortDate(shiftDate(today(), -n))}</button>`).join('')}</div>
        <label class="field"><span>${esc(label)}</span><input class="input" type="date" name="day" value="${today()}" max="${today()}" required /></label>
        ${note ? '<label class="field"><span>Note (optional)</span><textarea class="input" name="note" rows="2" placeholder="What you asked or offered…"></textarea></label>' : ''}
        <button class="btn block" type="submit">Save</button>
      </form>`
    );
    const form = m.el.querySelector('form');
    const mark = () => m.el.querySelectorAll('[data-ago]').forEach((b) => b.setAttribute('aria-pressed', String(shiftDate(today(), -Number(b.dataset.ago)) === form.day.value)));
    m.el.querySelectorAll('[data-ago]').forEach((b) =>
      b.addEventListener('click', () => {
        form.day.value = shiftDate(today(), -Number(b.dataset.ago));
        mark();
      })
    );
    form.day.addEventListener('input', mark);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.day.value || form.day.value > today()) return toast('Pick a day up to today', 'error');
      m.close();
      resolve({ day: form.day.value, note: form.note?.value.trim() ?? '' });
    });
  });
}

// On hold: why, and when to get back to them (shows up in Tasks like any follow-up).
// Resolves with { declined_reason, next_follow_up }, or never if the window is closed.
export function askHold(p) {
  return new Promise((resolve) => {
    const m = openModal(
      `${p.name} – on hold`,
      `<form>
        <label class="field"><span>Why on hold?</span><input class="input" name="reason" value="${esc(p.declined_reason ?? '')}" placeholder="Contract with another rental until end of January…" /></label>
        <label class="field"><span>Get back to them on</span><input class="input" type="date" name="day" value="${esc(p.next_follow_up && p.next_follow_up > today() ? p.next_follow_up : '')}" min="${today()}" /></label>
        <div class="chips">${[1, 2, 3, 6].map((n) => `<button type="button" data-months="${n}">In ${n} month${n > 1 ? 's' : ''}</button>`).join('')}</div>
        <small class="muted">It shows up in Tasks on that day.</small>
        <button class="btn block" type="submit">Put on hold</button>
      </form>`
    );
    const form = m.el.querySelector('form');
    m.el.querySelectorAll('[data-months]').forEach((b) =>
      b.addEventListener('click', () => {
        const d = new Date(`${today()}T12:00`);
        d.setMonth(d.getMonth() + Number(b.dataset.months));
        form.day.value = d.toISOString().slice(0, 10);
      })
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      m.close();
      resolve({ declined_reason: form.reason.value.trim() || null, next_follow_up: form.day.value || null });
    });
  });
}

// Today means now; an earlier day has no real time, so midday keeps it on that date.
const dayToIso = (day) => (day === today() ? new Date() : new Date(`${day}T12:00`)).toISOString();

// A follow-up e-mail goes into the activity history; it can be sent many times, so it isn't one date on the partner.
async function followUpMail(p, refresh) {
  const { day, note } = await askDay(`Follow-up e-mail to ${p.name}`, 'Sent on', { note: true });
  try {
    await api('/api/activities', { method: 'POST', body: { partner_id: p.id, type: 'followup', happened_at: dayToIso(day), summary: note } });
    toast('Follow-up e-mail logged');
    refresh();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// Correct when a logged visit / call / e-mail happened.
function activityDate(a, refresh) {
  if (!a) return;
  const d = new Date(a.happened_at);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  const m = openModal(
    `Change date – ${activityLabel(a.type)}`,
    `<form>
      <label class="field"><span>When it happened</span><input class="input" type="datetime-local" name="when" value="${d.toISOString().slice(0, 16)}" max="${nowLocalInput()}" required /></label>
      <button class="btn block" type="submit">Save</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/activities', { method: 'PATCH', body: { id: a.id, happened_at: new Date(form.when.value).toISOString() } });
      m.close();
      toast('Date changed');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
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
  // A new person at a chain hotel (e.g. its sales manager) can go to the chain's other hotels too.
  const siblings = !c.id && p.chain ? state.partners.filter((x) => x.chain === p.chain && x.id !== p.id).sort((a, b) => a.name.localeCompare(b.name)) : [];
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
      ${
        siblings.length
          ? `<fieldset class="also-add"><legend>Also add to other ${esc(p.chain)} places <button type="button" class="link-btn" data-also-all>Select all</button></legend>
              ${siblings.map((s) => `<label class="check"><input type="checkbox" data-also value="${s.id}" /> ${esc(s.name)}</label>`).join('')}</fieldset>`
          : ''
      }
      <button class="btn block" type="submit">Save contact</button>
    </form>`
  );
  const form = m.el.querySelector('form');
  m.el.querySelector('[data-also-all]')?.addEventListener('click', () => {
    const boxes = [...m.el.querySelectorAll('[data-also]')];
    const on = !boxes.every((b) => b.checked);
    boxes.forEach((b) => (b.checked = on));
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const also = [...m.el.querySelectorAll('[data-also]:checked')].map((b) => b.value);
      const f = formData(form);
      await api('/api/contacts', { method: 'POST', body: { ...f, id: c.id, partner_id: p.id, also } });
      if (also.length) toast(`Added to ${also.length + 1} places`);
      m.close();
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
