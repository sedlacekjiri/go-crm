import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calendarText, salesFeed } from '../functions/_lib/ics.js';

const partners = [
  { id: 'p1', name: 'Hotel Borg', address: 'Pósthússtræti 11', area: '101', stage: 'new', next_follow_up: '2026-11-12' },
  { id: 'p2', name: 'CenterHotel Plaza', stage: 'on_hold', next_follow_up: '2027-01-05', declined_reason: 'Contract with Enterprise' },
  { id: 'p3', name: 'Kex', stage: 'declined', next_follow_up: '2026-11-13' },
];
const tasks = [
  { id: 't1', type: 'visit', partner_id: 'p1', due_date: '2026-11-12', due_time: '10:30', done: 0 },
  { id: 't2', type: 'todo', category: 'sales', title: 'Print flyers', due_date: '2026-11-14', done: 0 },
  { id: 't3', type: 'todo', category: 'marketing', title: 'Reel', due_date: '2026-11-14', done: 0 },
  { id: 't4', type: 'visit', partner_id: 'p1', due_date: '2025-01-01', done: 0 },
];
const events = [
  { id: 'e1', title: 'Hotel fair', category: 'sales', date: '2026-11-20', end_date: '2026-11-21' },
  { id: 'e2', title: 'Shoot', category: 'marketing', date: '2026-11-20' },
];
const range = { from: '2026-11-01', to: '2027-02-01', base: 'https://crm.test' };

describe('Sales calendar feed', () => {
  it('has visits, sales to-dos, open follow-ups and sales events – nothing from marketing or out of range', () => {
    const items = salesFeed({ tasks, partners, events }, range);
    assert.deepEqual(items.map((e) => e.title), ['Visit: Hotel Borg', 'Print flyers', 'Hotel fair', 'Follow up: CenterHotel Plaza']);
  });
  it('skips a follow-up when a visit is planned that day, and links to the partner', () => {
    const items = salesFeed({ tasks, partners, events }, range);
    assert.ok(!items.some((e) => e.title === 'Follow up: Hotel Borg'));
    assert.equal(items[0].url, 'https://crm.test/#/partner/p1');
  });
  it('writes timed visits in UTC and all-day items as dates', () => {
    const text = calendarText('GO CRM – Sales', salesFeed({ tasks, partners, events }, range), new Date('2026-11-11T10:00:00Z'));
    assert.match(text, /DTSTART:20261112T103000Z\r\nDTEND:20261112T113000Z/);
    assert.match(text, /DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261122/);
    assert.match(text, /LOCATION:Hotel Borg\\, Pósthússtræti 11/);
    assert.ok(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  });
});
