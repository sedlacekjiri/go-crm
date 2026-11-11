// The Sales calendar as an .ics feed that Google Calendar (or iPhone / Outlook) subscribes to:
// planned visits, partner follow-ups, sales to-dos and sales events.
// Iceland is on UTC all year, so a local time is written as UTC.

const d = (date) => date.replace(/-/g, '');
const at = (date, time) => `${d(date)}T${time.replace(':', '')}00Z`;
const nextDay = (date) => {
  const x = new Date(`${date}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};
const plusHour = (time) => `${String(Math.min(23, Number(time.slice(0, 2)) + 1)).padStart(2, '0')}${time.slice(2)}`;
const clean = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

// Lines longer than 75 bytes are folded (RFC 5545), without splitting a multi-byte letter.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function vevent(e, stamp) {
  const timed = !!e.time;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}@go-crm`,
    `DTSTAMP:${stamp}`,
    timed ? `DTSTART:${at(e.date, e.time)}` : `DTSTART;VALUE=DATE:${d(e.date)}`,
    timed ? `DTEND:${at(e.endDate || e.date, e.endTime || plusHour(e.time))}` : `DTEND;VALUE=DATE:${d(nextDay(e.endDate || e.date))}`,
    `SUMMARY:${clean(e.title)}`,
    e.location ? `LOCATION:${clean(e.location)}` : '',
    e.description ? `DESCRIPTION:${clean(e.description)}` : '',
    e.url ? `URL:${e.url}` : '',
    'END:VEVENT',
  ];
  return lines.filter(Boolean).map(fold).join('\r\n');
}

export function calendarText(name, events, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Go CRM//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${clean(name)}`),
    'X-WR-TIMEZONE:Atlantic/Reykjavik',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.map((e) => vevent(e, stamp)),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

const OPEN = ['new', 'contacted', 'in_talks', 'on_hold'];

// What the Sales calendar shows between `from` and `to` (YYYY-MM-DD), as feed events.
// tasks / events are already limited to what this person may see.
export function salesFeed({ tasks, partners, events }, { from, to, base }) {
  const byId = new Map(partners.map((p) => [p.id, p]));
  const inRange = (date) => date && date >= from && date <= to;
  const place = (p) => [p.name, p.address].filter(Boolean).join(', ');
  const link = (p) => (p ? `${base}/#/partner/${p.id}` : `${base}/#/tasks`);
  const out = [];
  const visitDays = new Set();
  for (const t of tasks) {
    if (!inRange(t.due_date)) continue;
    const p = byId.get(t.partner_id);
    if (t.type === 'visit') {
      if (!p) continue;
      if (!t.done) visitDays.add(`${p.id}|${t.due_date}`);
      out.push({
        uid: `visit-${t.id}`,
        title: `${t.done ? '✓ ' : ''}Visit: ${p.name}`,
        date: t.due_date,
        time: t.due_time,
        location: place(p),
        description: [p.area, t.notes].filter(Boolean).join('\n'),
        url: link(p),
      });
    } else if ((t.category || 'sales') === 'sales') {
      out.push({
        uid: `task-${t.id}`,
        title: `${t.done ? '✓ ' : ''}${t.title || 'Task'}`,
        date: t.due_date,
        time: t.due_time,
        description: [p?.name, t.notes].filter(Boolean).join('\n'),
        url: link(p),
      });
    }
  }
  // Follow-ups, unless a visit is already planned that day.
  for (const p of partners) {
    if (!OPEN.includes(p.stage) || !inRange(p.next_follow_up) || visitDays.has(`${p.id}|${p.next_follow_up}`)) continue;
    out.push({ uid: `follow-${p.id}-${p.next_follow_up}`, title: `Follow up: ${p.name}`, date: p.next_follow_up, location: place(p), description: p.declined_reason ?? '', url: link(p) });
  }
  for (const e of events) {
    if ((e.category || 'sales') !== 'sales' || !(inRange(e.date) || (e.end_date && e.date < from && e.end_date >= from))) continue;
    out.push({
      uid: `event-${e.id}`,
      title: e.title,
      date: e.date,
      time: e.start_time,
      endDate: e.end_date,
      endTime: e.end_time,
      location: e.location,
      description: e.notes,
      url: link(byId.get(e.partner_id)),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}
