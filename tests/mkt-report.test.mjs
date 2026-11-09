import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { marketingReport, reportPlaces } from '../public/js/lib.js';

const T = '2026-11-09'; // a Monday
const who = (x) => x.assignee_id ?? null;

describe('marketingReport', () => {
  it('counts posts per week by brand, only what went live in the period', () => {
    const posts = [
      { status: 'published', brand: 'car', published_at: '2026-11-09T10:00:00Z' },
      { status: 'published', brand: 'both', publish_date: '2026-11-03' },
      { status: 'published', brand: 'camper', publish_date: '2026-01-01' },
      { status: 'scheduled', brand: 'car', publish_date: '2026-11-09' },
    ];
    const r = marketingReport({ posts }, 30, who, T);
    assert.equal(r.posts.total, 2);
    assert.deepEqual(r.posts.buckets.at(-1), { key: '2026-11-09', car: 1, camper: 0, both: 0 });
    assert.equal(r.posts.buckets.at(-2).both, 1);
  });
  it('uses days for the 7-day view', () => {
    const r = marketingReport({}, 7, who, T);
    assert.equal(r.daily, true);
    assert.equal(r.posts.buckets.length, 7);
  });
  it('splits marketing tasks per person and ignores sales, visits and old finished ones', () => {
    const tasks = [
      { category: 'marketing', assignee_id: 'a', due_date: '2026-11-01' },
      { category: 'marketing', assignee_id: 'a', due_date: '2026-11-20' },
      { category: 'marketing', assignee_id: 'a', done: true, done_at: '2026-11-08T09:00:00Z', due_date: '2026-11-08' },
      { category: 'marketing', assignee_id: 'a', done: true, done_at: '2026-01-08T09:00:00Z', due_date: '2026-01-08' },
      { category: 'marketing', due_date: '2026-11-20' },
      { category: 'sales', assignee_id: 'a', due_date: '2026-11-20' },
      { category: 'marketing', type: 'visit', assignee_id: 'a', due_date: '2026-11-20' },
    ];
    const r = marketingReport({ tasks }, 30, who, T);
    assert.deepEqual(r.team[0], { id: 'a', done: 1, open: 1, overdue: 1 });
    assert.deepEqual(r.team[1], { id: null, done: 0, open: 1, overdue: 0 });
  });
  it('sums collaborations, leaves out declined, finds missing content and refunds', () => {
    const collaborators = [
      { status: 'agreed', pickup_date: '2026-11-01', dropoff_date: '2026-11-05', followers: 1000 },
      { status: 'delivered', pickup_date: '2026-10-20', dropoff_date: '2026-10-25', followers: 500, refund_eur: 200 },
      { status: 'declined', pickup_date: '2026-11-01', followers: 9000 },
      { status: 'agreed', pickup_date: '2026-11-20', dropoff_date: '2026-11-25', followers: 100 },
    ];
    const r = marketingReport({ collaborators }, 30, who, T);
    assert.equal(r.collabs.total, 2);
    assert.equal(r.collabs.reach, 1500);
    assert.equal(r.collabs.delivered, 1);
    assert.equal(r.collabs.waiting.length, 1);
    assert.equal(r.collabs.refundsEur, 200);
    assert.deepEqual(r.collabs.months.at(-1), { key: '2026-11', delivered: 0, waiting: 2 });
    assert.equal(r.collabs.months.length, 6);
    assert.equal(r.collabs.months[0].key, '2026-06');
  });
  it('measures follower gains from the start of the period, without jumps from new accounts', () => {
    const social = [
      { account: 'instagram:car', date: '2026-09-01', followers: 1000 },
      { account: 'instagram:car', date: '2026-11-01', followers: 1100 },
      { account: 'instagram:camper', date: '2026-11-01', followers: 5000 },
      { account: 'instagram:camper', date: '2026-11-08', followers: 5040 },
    ];
    const r = marketingReport({ social }, 30, who, T);
    const ig = r.gains.find((g) => g.channel === 'instagram');
    assert.deepEqual(ig.points.at(0).value, 0);
    assert.equal(ig.points.at(-1).value, 140);
    assert.equal(r.followers[0].gained, 140);
    assert.deepEqual(r.gains.find((g) => g.channel === 'tiktok').points, []);
  });
});

describe('reportPlaces', () => {
  it('compares the review count with the last snapshot before the period', () => {
    const reviews = {
      places: [{ place_id: 'p', name: 'Go', rating: 4.7, rating_count: 110 }, { place_id: 'q', name: 'None', rating_count: null }],
      snapshots: [{ place_id: 'p', day: '2026-09-01', rating_count: 90 }, { place_id: 'p', day: '2026-10-01', rating_count: 100 }, { place_id: 'p', day: '2026-11-01', rating_count: 105 }],
    };
    assert.deepEqual(reportPlaces(reviews, '2026-10-11'), [{ name: 'Go', rating: 4.7, total: 110, gained: 10 }]);
    assert.deepEqual(reportPlaces(null, '2026-10-11'), []);
  });
});
