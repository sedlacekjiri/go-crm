// Calendar events (meetings, fairs, shoots…): the event window, plus "add to my calendar"
// as an .ics file (iPhone / Mac / Outlook) or a Google Calendar link.
import { avatar } from './components.js';
import { eventIcs, shiftDate, TASK_CATEGORIES, today } from './lib.js';
import { api, can, isAdmin, state } from './store.js';
import { esc, formData, openModal, options, toast } from './util.js';

const stamp = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00Z`; // Iceland = UTC

export function googleCalendarUrl(e) {
  let dates;
  if (e.start_time) {
    const endTime = e.end_time ?? `${String(Math.min(23, Number(e.start_time.slice(0, 2)) + 1)).padStart(2, '0')}${e.start_time.slice(2)}`;
    dates = `${stamp(e.date, e.start_time)}/${stamp(e.end_date || e.date, endTime)}`;
  } else {
    dates = `${e.date.replace(/-/g, '')}/${shiftDate(e.end_date || e.date, 1).replace(/-/g, '')}`;
  }
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates, details: e.notes ?? '', location: e.location ?? '' });
  return `https://calendar.google.com/calendar/render?${q}`;
}

function downloadIcs(e) {
  const blob = new Blob([eventIcs(e)], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'event'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const canEditEvent = (e) => isAdmin() && (!e.id || can(e.category || 'sales') || e.created_by === state.me?.id);

export function eventModal(ev, refresh) {
  const e = { category: can('sales') ? 'sales' : 'marketing', date: today(), attendees: [], ...ev };
  const editable = canEditEvent(e);
  let cat = e.category;
  const going = new Set(e.attendees ?? []);
  if (!e.id && state.me) going.add(state.me.id);
  const m = openModal(
    e.id ? (editable ? 'Edit event' : e.title) : 'New event',
    `<form>
      <fieldset ${editable ? '' : 'disabled'} class="plain-fieldset">
      <label class="field"><span>What *</span><input class="input" name="title" required value="${esc(e.title ?? '')}" placeholder="Meeting with Center Hotels, Photo shoot, Travel fair…" /></label>
      <div class="field"><span>Category</span><div class="chips" data-ev-category>${TASK_CATEGORIES.filter((c) => can(c.value) || c.value === e.category)
        .map((c) => `<button type="button" data-v="${c.value}" aria-pressed="${cat === c.value}"><i class="cdot cat-dot-${c.value}"></i>${c.label}</button>`)
        .join('')}</div></div>
      <div class="form-grid four">
        <label class="field"><span>Date *</span><input class="input" type="date" name="date" required value="${esc(e.date)}" /></label>
        <label class="field"><span>From</span><input class="input" type="time" name="start_time" value="${esc(e.start_time ?? '')}" /></label>
        <label class="field"><span>To</span><input class="input" type="time" name="end_time" value="${esc(e.end_time ?? '')}" /></label>
        <label class="field"><span>Ends on (multi-day)</span><input class="input" type="date" name="end_date" value="${esc(e.end_date ?? '')}" /></label>
      </div>
      <small class="muted">Leave the times empty for an all-day event.</small>
      <label class="field"><span>Where</span><input class="input" name="location" value="${esc(e.location ?? '')}" placeholder="Hygge, Barónsstígur 6 · Teams · Office" /></label>
      ${
        can('sales')
          ? `<label class="field"><span>Partner (optional)</span><select class="input" name="partner_id">${options(
              state.partners.map((p) => ({ value: p.id, label: p.name })),
              e.partner_id,
              { empty: '–' }
            )}</select></label>`
          : ''
      }
      ${
        state.users.length > 1
          ? `<div class="field"><span>Who’s coming</span><div class="chips wrap-chips people" data-going>${state.users
              .map((u) => `<button type="button" data-v="${u.id}" aria-pressed="${going.has(u.id)}">${avatar(u, 22)}${esc(u.id === state.me?.id ? `${u.name.split(' ')[0]} (me)` : u.name.split(' ')[0])}</button>`)
              .join('')}</div><small>Invited people see the event in their calendar, even outside their sections.</small></div>`
          : ''
      }
      <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="4" placeholder="Agenda, what to bring…">${esc(e.notes ?? '')}</textarea></label>
      </fieldset>
      ${
        e.id
          ? `<div class="field"><span>Add to my calendar</span><div class="controls cal-export">
              <button type="button" class="btn secondary sm" data-ics>📅 iPhone / Mac / Outlook (.ics)</button>
              <a class="btn secondary sm" href="${esc(googleCalendarUrl(e))}" target="_blank" rel="noreferrer">Google Calendar</a></div></div>`
          : ''
      }
      ${editable ? `<button class="btn block" type="submit">${e.id ? 'Save' : 'Add event'}</button>` : ''}
      ${editable && e.id ? '<button class="btn danger block" type="button" data-remove>Delete event</button>' : ''}
    </form>`
  );
  const form = m.el.querySelector('form');
  m.el.querySelector('[data-ev-category]')?.addEventListener('click', (x) => {
    const b = x.target.closest('[data-v]');
    if (!b || !editable) return;
    cat = b.dataset.v;
    m.el.querySelectorAll('[data-ev-category] button').forEach((y) => y.setAttribute('aria-pressed', String(y === b)));
  });
  m.el.querySelector('[data-going]')?.addEventListener('click', (x) => {
    const b = x.target.closest('[data-v]');
    if (!b || !editable) return;
    if (going.has(b.dataset.v)) going.delete(b.dataset.v);
    else going.add(b.dataset.v);
    b.setAttribute('aria-pressed', String(going.has(b.dataset.v)));
  });
  m.el.querySelector('[data-ics]')?.addEventListener('click', () => downloadIcs(e));
  form.addEventListener('submit', async (x) => {
    x.preventDefault();
    const f = formData(form);
    const body = {
      id: e.id,
      title: f.title,
      category: cat,
      date: f.date,
      end_date: f.end_date || null,
      start_time: f.start_time || null,
      end_time: f.end_time || null,
      location: f.location || null,
      notes: f.notes || null,
      attendees: [...going],
      ...('partner_id' in f ? { partner_id: f.partner_id || null } : {}),
    };
    try {
      await api('/api/events', { method: 'POST', body });
      m.close();
      toast(e.id ? 'Saved' : 'Event added');
      refresh(f.date);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-remove]')?.addEventListener('click', async () => {
    if (!confirm(`Delete “${e.title}”?`)) return;
    try {
      await api(`/api/events?id=${e.id}`, { method: 'DELETE' });
      m.close();
      toast('Deleted');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
