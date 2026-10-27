import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { laterItems } from '../public/js/lib.js';

describe('laterItems', () => {
  const data = {
    partners: [{ id: 'h', name: 'Hotel Borg' }],
    tasks: [
      { id: 'soon', due_date: '2026-10-30', done: false, category: 'sales' }, // within 7 days → not "later"
      { id: 'later', due_date: '2026-11-10', done: false, category: 'marketing' },
      { id: 'done', due_date: '2026-11-10', done: true },
      { id: 'visit', type: 'visit', partner_id: 'h', due_date: '2026-11-05', done: false },
      { id: 'far', due_date: '2027-06-01', done: false },
    ],
    posts: [{ id: 'p', status: 'scheduled', publish_date: '2026-11-04' }, { id: 'idea', status: 'idea', publish_date: '2026-11-04' }],
    events: [{ id: 'e', date: '2026-11-04', category: 'sales' }],
  };
  it('lists what comes after the next 7 days, soonest first', () => {
    assert.deepEqual(laterItems(data, '2026-10-27').map((x) => x.ref.id), ['e', 'p', 'visit', 'later']);
  });
  it('follows the category filter', () => {
    assert.deepEqual(laterItems(data, '2026-10-27', 'sales').map((x) => x.ref.id), ['e', 'visit']);
    assert.deepEqual(laterItems(data, '2026-10-27', 'marketing').map((x) => x.ref.id), ['p', 'later']);
  });
  it('gives visits their partner', () => {
    assert.equal(laterItems(data, '2026-10-27').find((x) => x.ref.id === 'visit').ref.partner.name, 'Hotel Borg');
  });
});
