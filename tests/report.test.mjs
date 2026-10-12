import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultReportWeek, isoWeek, mondayOf, weeklyReport } from '../public/js/lib.js';

describe('weeks', () => {
  it('finds Monday and the ISO week', () => {
    assert.equal(mondayOf('2026-10-12'), '2026-10-12'); // Monday
    assert.equal(mondayOf('2026-10-18'), '2026-10-12'); // Sunday
    assert.equal(isoWeek('2026-10-12'), 42);
    assert.equal(isoWeek('2026-01-01'), 1);
    assert.equal(isoWeek('2027-01-01'), 53); // Friday → last week of 2026
  });
  it('opens last week on Monday and Tuesday', () => {
    assert.equal(defaultReportWeek('2026-10-12'), '2026-10-05');
    assert.equal(defaultReportWeek('2026-10-13'), '2026-10-05');
    assert.equal(defaultReportWeek('2026-10-14'), '2026-10-12');
    assert.equal(defaultReportWeek('2026-10-18'), '2026-10-12');
  });
});

describe('weeklyReport', () => {
  const data = {
    posts: [
      { id: 'a', title: 'Reel', status: 'published', published_at: '2026-10-06T10:00:00Z', publish_date: '2026-10-06', channels: ['instagram', 'tiktok'], brand: 'camper' },
      { id: 'b', title: 'Old', status: 'published', published_at: '2026-09-30T10:00:00Z', publish_date: '2026-09-30', channels: ['facebook'], brand: 'car' },
      { id: 'c', title: 'Missed', status: 'scheduled', publish_date: '2026-10-08', channels: ['instagram'] },
      { id: 'd', title: 'Next', status: 'scheduled', publish_date: '2026-10-14', channels: ['instagram'] },
      { id: 'e', title: 'Idea', status: 'idea', publish_date: '2026-10-14', channels: [] },
    ],
    tasks: [
      { id: 1, type: 'todo', category: 'marketing', title: 'Done mkt', done: true, done_at: '2026-10-07T12:00:00Z', due_date: '2026-10-09' },
      { id: 2, type: 'todo', category: 'sales', title: 'Done sales', done: true, done_at: '2026-10-07T12:00:00Z', due_date: '2026-10-07' },
      { id: 3, type: 'todo', category: 'marketing', title: 'Late', done: false, due_date: '2026-10-09' },
      { id: 4, type: 'todo', category: 'marketing', title: 'Next week', done: false, due_date: '2026-10-15' },
    ],
    collaborators: [
      { id: 'x', status: 'agreed', pickup_date: '2026-10-07', dropoff_date: '2026-10-10' },
      { id: 'y', status: 'delivered', refund_eur: 300 },
      { id: 'z', status: 'agreed', pickup_date: '2026-10-13', dropoff_date: '2026-10-20' },
    ],
    social: [
      { account: 'instagram:car', date: '2026-09-27', followers: 1000 },
      { account: 'instagram:car', date: '2026-10-04', followers: 1010 },
      { account: 'instagram:car', date: '2026-10-11', followers: 1050 },
    ],
  };
  const reviews = {
    places: [{ place_id: 'p', name: 'Go', rating: 4.8, rating_count: 120 }],
    snapshots: [
      { place_id: 'p', day: '2026-10-04', rating_count: 115 },
      { place_id: 'p', day: '2026-10-11', rating_count: 120 },
    ],
    reviews: [
      { id: 'r1', source: 'places', rating: 5, published_at: '2026-10-08T09:00:00Z' },
      { id: 'r2', source: 'places', rating: 3, published_at: '2026-09-20T09:00:00Z' },
    ],
    google: { locations: [] },
  };
  const r = weeklyReport(data, reviews, '2026-10-08', '2026-10-12');

  it('covers Monday to Sunday', () => {
    assert.deepEqual([r.week.start, r.week.end, r.week.number], ['2026-10-05', '2026-10-11', 41]);
  });
  it('counts followers gained in the week', () => {
    assert.equal(r.followersTotal.total, 1050);
    assert.equal(r.followersTotal.week, 40);
    assert.equal(r.followersTotal.prevWeek, 10);
  });
  it('lists content', () => {
    assert.deepEqual(r.content.published.map((p) => p.id), ['a']);
    assert.equal(r.content.prevPublished, 1);
    assert.deepEqual(r.content.byChannel, { instagram: 1, tiktok: 1 });
    assert.deepEqual(r.content.nextPosts.map((p) => p.id), ['d']);
  });
  it('lists to-dos done in the week (any category) and next week’s', () => {
    assert.deepEqual(r.tasks.done.map((x) => x.id), [1, 2]);
    assert.deepEqual(r.tasks.next.map((x) => x.id), [4]);
  });
  it('summarises Google reviews', () => {
    assert.equal(r.google.rating, 4.8);
    assert.equal(r.google.countChange, 5);
    assert.deepEqual(r.google.newReviews.map((x) => x.id), ['r1']);
  });
  it('puts posts, tasks and visits in one done list', () => {
    const rr = weeklyReport(
      { ...data, partners: [{ id: 'h', name: 'Hotel Borg' }], tasks: [...data.tasks, { id: 9, type: 'visit', partner_id: 'h', done: true, done_at: '2026-10-06T15:00:00Z', due_date: '2026-10-06' }] },
      null,
      '2026-10-05',
      '2026-10-12'
    );
    assert.deepEqual(rr.done.map((x) => `${x.kind}:${x.title}`), ['post:Reel', 'visit:Hotel Borg', 'task:Done mkt', 'task:Done sales']);
    assert.equal(rr.visits, 1);
  });
  it('summarises collaborations', () => {
    assert.deepEqual(r.collabs.tripsThisWeek.map((c) => c.id), ['x']);
    assert.equal(r.collabs.thisYear, 2);
    assert.deepEqual(r.collabs.tripsNextWeek.map((c) => c.id), ['z']);
  });
});
