import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { agenda, dayCounts, eventIcs, eventTimeText } from '../public/js/lib.js';

const ev = (o) => ({ id: 'e1', title: 'Meeting with Julio', category: 'sales', date: '2026-10-30', start_time: '11:30', end_time: '12:30', ...o });

describe('events', () => {
  it('show up on their day (and every day of a multi-day event), sorted by time', () => {
    const data = { tasks: [], partners: [], events: [ev({ id: 'b', start_time: '14:00', end_time: null }), ev({ id: 'a' }), ev({ id: 'fair', title: 'Fair', date: '2026-10-29', end_date: '2026-10-31', start_time: null })] };
    assert.deepEqual(agenda('2026-10-30', data).events.map((e) => e.id), ['fair', 'a', 'b']);
    assert.deepEqual(agenda('2026-11-01', data).events, []);
    assert.equal(dayCounts(['2026-10-31'], data).get('2026-10-31').events, 1);
  });
  it('follow the category filter', () => {
    const data = { tasks: [], partners: [], events: [ev({ category: 'marketing' })] };
    assert.equal(agenda('2026-10-30', data, 'sales').events.length, 0);
    assert.equal(agenda('2026-10-30', data, 'marketing').events.length, 1);
  });
  it('describe their time', () => {
    assert.equal(eventTimeText(ev()), '11:30 – 12:30');
    assert.equal(eventTimeText(ev({ end_time: null })), 'From 11:30');
    assert.equal(eventTimeText(ev({ start_time: null })), 'All day');
    assert.equal(eventTimeText(ev({ start_time: null, end_date: '2026-11-01' }), '2026-10-31'), '30.10 – 1.11');
  });
  it('export to a calendar file', () => {
    const ics = eventIcs(ev({ location: 'Hygge, Barónsstígur 6', notes: 'Bring flyers; QR' }), { now: new Date('2026-10-19T10:00:00Z') });
    assert.match(ics, /DTSTART:20261030T113000Z/);
    assert.match(ics, /DTEND:20261030T123000Z/);
    assert.match(ics, /LOCATION:Hygge\\, Barónsstígur 6/);
    assert.match(ics, /DESCRIPTION:Bring flyers\\; QR/);
    const allDay = eventIcs(ev({ start_time: null, end_date: '2026-10-31' }));
    assert.match(allDay, /DTSTART;VALUE=DATE:20261030/);
    assert.match(allDay, /DTEND;VALUE=DATE:20261101/);
  });
});
