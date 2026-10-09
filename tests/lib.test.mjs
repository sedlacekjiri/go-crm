// Run with: node --test tests/
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actuals,
  agenda,
  affiliateEarnings,
  isCompleted,
  revenueBySource,
  saleCommission,
  partnerByCode,
  daysLeft,
  reviewGrowth,
  reviewStats,
  dayCounts,
  dueCount,
  monthGrid,
  nextPlannedVisit,
  overdue,
  weekDays,
  bucketKeys,
  buildSales,
  convert,
  guessMapping,
  monthElapsed,
  monthRange,
  parseDate,
  parseNumber,
  rateOn,
  revenueByPartner,
  revenueSeries,
  shiftMonth,
  totals,
  visitStats,
  weekStart,
} from '../public/js/lib.js';

describe('parseNumber', () => {
  const cases = [
    ['1234', 1234],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['45.000', 45000],
    ['45,000', 45000],
    ['12,5', 12.5],
    ['12.50', 12.5],
    ['€ 1 234', 1234],
    ['185.400 kr', 185400],
    ['1.234.567', 1234567],
    ['-80,00', -80],
    ['', null],
    ['n/a', null],
    [99.9, 99.9],
  ];
  for (const [input, expected] of cases) it(`${input} → ${expected}`, () => assert.equal(parseNumber(input), expected));
});

describe('parseDate', () => {
  it('handles ISO, European, US formats and Excel serials', () => {
    assert.equal(parseDate('2026-10-06'), '2026-10-06');
    assert.equal(parseDate('2026-10-06 14:22:00'), '2026-10-06');
    assert.equal(parseDate('06.10.2026'), '2026-10-06');
    assert.equal(parseDate('6/10/2026'), '2026-10-06');
    assert.equal(parseDate('10/6/2026', 'mdy'), '2026-10-06');
    assert.equal(parseDate('13/25/2026'), null);
    assert.equal(parseDate('12/25/2026'), '2026-12-25'); // day-first impossible → month-first
    assert.equal(parseDate(46301), '2026-10-06');
    assert.equal(parseDate(new Date(2026, 9, 6)), '2026-10-06');
    assert.equal(parseDate('garbage'), null);
  });
});

describe('guessMapping', () => {
  it('maps typical export headers', () => {
    const m = guessMapping(['Booking No', 'Created', 'Pickup date', 'Return date', 'Total price', 'Currency', 'Affiliate', 'Status', 'Vehicle']);
    assert.deepEqual(m, {
      booking_ref: 'Booking No',
      booking_date: 'Created',
      amount: 'Total price',
      currency: 'Currency',
      pickup_date: 'Pickup date',
      return_date: 'Return date',
      vehicle: 'Vehicle',
      affiliate_code: 'Affiliate',
      status: 'Status',
    });
  });
});

describe('buildSales', () => {
  it('parses rows, computes days, flags cancellations and reports errors', () => {
    const mapping = { booking_ref: 'Ref', booking_date: 'Created', amount: 'Total', pickup_date: 'From', return_date: 'To', status: 'Status', vehicle: 'Car' };
    const { sales, errors } = buildSales(
      [
        { Ref: 'A1', Created: '01.10.2026', Total: '1.200,00', From: '2026-11-01', To: '2026-11-05', Status: 'Confirmed', Car: 'Toyota RAV4' },
        { Ref: 'A2', Created: '02.10.2026', Total: '900', From: '', To: '', Status: 'Cancelled', Car: 'VW Camper California' },
        { Ref: '', Created: '02.10.2026', Total: '900' },
        { Ref: 'A3', Created: 'nope', Total: '900' },
        { Ref: 'A1', Created: '01.10.2026', Total: '1.300,00', From: '2026-11-01', To: '2026-11-05', Status: 'Confirmed', Car: 'Toyota RAV4' },
        { Ref: '', Created: '', Total: '' },
      ],
      mapping,
      { dateFormat: 'auto', defaultCurrency: 'EUR', brandMode: 'column' }
    );
    assert.deepEqual(errors.map((e) => e.row), [4, 5]);
    assert.equal(sales.length, 2);
    assert.equal(sales[0].amount, 1300);
    assert.equal(sales[0].rental_days, 4);
    assert.equal(sales[0].brand, 'car');
    assert.equal(sales[0].is_cancelled, false);
    assert.equal(sales[1].brand, 'camper');
    assert.equal(sales[1].is_cancelled, true);
  });
});

describe('fx', () => {
  const rates = { '2026-10-02': { ISK: 140, USD: 1.1 }, '2026-10-05': { ISK: 138, USD: 1.2 } };
  it('uses the latest earlier rate on weekends', () => {
    assert.equal(rateOn(rates, '2026-10-04', 'ISK'), 140);
    assert.equal(rateOn(rates, '2026-10-05', 'ISK'), 138);
    assert.equal(rateOn(rates, '2026-10-09', 'ISK'), 138);
  });
  it('converts EUR, ISK and other currencies', () => {
    assert.deepEqual(convert(100, 'EUR', '2026-10-05', rates), { amount_eur: 100, amount_isk: 13800, fx_eur_isk: 138 });
    assert.equal(convert(27600, 'ISK', '2026-10-05', rates).amount_eur, 200);
    assert.equal(convert(120, 'USD', '2026-10-05', rates).amount_isk, 13800);
  });
});

describe('analytics', () => {
  const sale = (over) => ({
    booking_ref: 'x',
    booking_date: '2026-10-01',
    brand: 'car',
    rental_days: 3,
    amount_eur: 100,
    amount_isk: 14000,
    affiliate_code: null,
    is_cancelled: false,
    ...over,
  });

  it('buckets weeks from Monday and fills empty buckets', () => {
    assert.equal(weekStart('2026-10-04'), '2026-09-28');
    assert.equal(weekStart('2026-10-05'), '2026-10-05');
    assert.deepEqual(bucketKeys('2026-11-15', '2027-02-01', 'month'), ['2026-11', '2026-12', '2027-01', '2027-02']);
    const s = revenueSeries(
      [sale({ booking_date: '2026-10-02' }), sale({ booking_date: '2026-10-02', brand: 'camper', amount_eur: 50 })],
      '2026-10-01',
      '2026-10-03',
      'day',
      'EUR'
    );
    assert.deepEqual(s, [
      { key: '2026-10-01', car: 0, camper: 0, bookings: 0 },
      { key: '2026-10-02', car: 100, camper: 50, bookings: 2 },
      { key: '2026-10-03', car: 0, camper: 0, bookings: 0 },
    ]);
  });

  it('excludes cancelled bookings and attributes partners case-insensitively', () => {
    const partners = [{ id: 'p1', name: 'Hotel Borg', affiliate_code: 'BORG' }];
    const sales = [sale({ affiliate_code: 'borg ' }), sale({ affiliate_code: 'BORG', amount_isk: 28000 }), sale({ is_cancelled: true }), sale({ affiliate_code: 'unknown' })];
    const t = totals(sales, 'ISK');
    assert.equal(t.revenue, 56000);
    assert.equal(t.bookings, 3);
    assert.equal(t.cancelled, 1);
    const rows = revenueByPartner(sales, partners, 'ISK');
    assert.equal(rows[0].partner.name, 'Hotel Borg');
    assert.equal(rows[0].bookings, 2);
    assert.equal(rows[0].revenue, 42000);
    assert.equal(rows[1].partner, null);
  });
});

describe('goals', () => {
  it('handles month math', () => {
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
    assert.equal(monthElapsed('2026-10', '2026-10-31'), 1);
    assert.equal(monthElapsed('2026-11', '2026-10-31'), 0);
    assert.equal(monthElapsed('2026-09', '2026-09-15'), 0.5);
  });
  it('counts actuals for a month', () => {
    const partners = [
      { id: 'a', stage: 'accepted', accepted_at: '2026-10-03', affiliate_code: 'BORG' },
      { id: 'b', stage: 'accepted', accepted_at: '2026-09-20', affiliate_code: null },
    ];
    const activities = [
      { partner_id: 'a', type: 'visit', happened_at: '2026-10-05T12:00:00.000Z' },
      { partner_id: 'a', type: 'meeting', happened_at: '2026-10-06T12:00:00.000Z' },
      { partner_id: 'b', type: 'call', happened_at: '2026-10-06T12:00:00.000Z' },
      { partner_id: 'c', type: 'visit', happened_at: '2026-09-20T12:00:00.000Z' },
      { partner_id: 'c', type: 'visit', happened_at: '2026-10-07T12:00:00.000Z' },
    ];
    const sales = [
      { booking_date: '2026-10-02', affiliate_code: 'borg', amount_eur: 500, is_cancelled: false },
      { booking_date: '2026-10-02', affiliate_code: 'borg', amount_eur: 500, is_cancelled: true },
      { booking_date: '2026-10-02', affiliate_code: null, amount_eur: 900, is_cancelled: false },
    ];
    assert.deepEqual(actuals('2026-10', { partners, activities, sales }), { visits: 3, hotels_visited: 1, new_partners: 1, bookings: 1, revenue_eur: 500 });
  });
});

describe('visitStats', () => {
  it('counts visits and meetings per partner with the latest date', () => {
    const stats = visitStats([
      { partner_id: 'a', type: 'visit', happened_at: '2026-10-01T10:00:00.000Z' },
      { partner_id: 'a', type: 'meeting', happened_at: '2026-10-05T10:00:00.000Z' },
      { partner_id: 'a', type: 'call', happened_at: '2026-10-06T10:00:00.000Z' },
      { partner_id: 'b', type: 'email', happened_at: '2026-10-06T10:00:00.000Z' },
    ]);
    assert.deepEqual(stats.get('a'), { count: 2, last: '2026-10-05T10:00:00.000Z' });
    assert.equal(stats.has('b'), false);
  });
});

describe('tasks & calendar', () => {
  const partners = [
    { id: 'a', name: 'Hotel B', area: '105 Hlíðar', stage: 'new', next_follow_up: null },
    { id: 'b', name: 'Hotel A', area: '101 Miðborg', stage: 'contacted', next_follow_up: '2026-10-08' },
    { id: 'c', name: 'Hotel C', area: '101 Miðborg', stage: 'in_talks', next_follow_up: '2026-10-05' },
    { id: 'd', name: 'Done Hotel', area: '101 Miðborg', stage: 'accepted', next_follow_up: '2026-10-01' },
  ];
  const tasks = [
    { id: 1, type: 'visit', partner_id: 'a', due_date: '2026-10-08', done: false },
    { id: 2, type: 'visit', partner_id: 'b', due_date: '2026-10-08', done: false },
    { id: 3, type: 'todo', title: 'Print flyers', due_date: '2026-10-08', due_time: '09:00', done: false },
    { id: 4, type: 'todo', title: 'Old', due_date: '2026-10-03', done: false },
    { id: 5, type: 'visit', partner_id: 'gone', due_date: '2026-10-03', done: false },
    { id: 6, type: 'visit', partner_id: 'a', due_date: '2026-10-12', done: false },
  ];
  it('builds week and month grids from Monday', () => {
    assert.deepEqual(weekDays('2026-10-08'), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    const g = monthGrid('2026-10');
    assert.equal(g.length, 42);
    assert.equal(g[0], '2026-09-28');
  });
  it('lists a day: visits by area, follow-ups not duplicated', () => {
    const a = agenda('2026-10-08', { tasks, partners });
    assert.deepEqual(a.visits.map((v) => v.partner.name), ['Hotel A', 'Hotel B']);
    assert.deepEqual(a.todos.map((t) => t.title), ['Print flyers']);
    assert.deepEqual(a.followUps, []); // Hotel A's follow-up is covered by its planned visit
  });
  it('finds overdue items, ignoring deleted partners and closed stages', () => {
    const o = overdue('2026-10-08', { tasks, partners });
    assert.deepEqual(o.tasks.map((t) => t.id), [4]);
    assert.deepEqual(o.followUps.map((p) => p.id), ['c']);
    assert.equal(dueCount('2026-10-08', { tasks, partners }), 3 + 1 + 2); // 3 open today + 1 old todo + follow-ups b, c
  });
  it('counts markers and finds the next planned visit', () => {
    const c = dayCounts(['2026-10-08', '2026-10-09'], { tasks, partners });
    assert.deepEqual(c.get('2026-10-08'), { visits: 2, todos: 1, followUps: 0, posts: 0, open: 3 });
    assert.equal(c.get('2026-10-09').open, 0);
    assert.equal(nextPlannedVisit('a', tasks), '2026-10-08');
    assert.equal(nextPlannedVisit('c', tasks), null);
  });
});

describe('categories, deadlines, posts', () => {
  const partners = [{ id: 'a', name: 'Hotel A', area: '101', stage: 'contacted', next_follow_up: '2026-10-08' }];
  const tasks = [
    { id: 1, type: 'todo', category: 'marketing', title: 'Summer campaign', start_date: '2026-10-01', due_date: '2026-10-15', done: false },
    { id: 2, type: 'todo', category: 'sales', title: 'Print flyers', due_date: '2026-10-08', done: false },
    { id: 3, type: 'visit', category: 'sales', partner_id: 'a', due_date: '2026-10-09', done: false },
  ];
  const posts = [
    { id: 'p1', title: 'Aurora reel', status: 'scheduled', publish_date: '2026-10-08' },
    { id: 'p2', title: 'Idea', status: 'idea', publish_date: '2026-10-08' },
    { id: 'p3', title: 'Late post', status: 'in_progress', publish_date: '2026-10-02' },
  ];
  const data = { tasks, partners, posts };
  it('shows multi-day tasks as ongoing until the deadline day', () => {
    assert.deepEqual(agenda('2026-10-08', data).ongoing.map((t) => t.id), [1]);
    assert.deepEqual(agenda('2026-10-15', data).ongoing, []);
    assert.deepEqual(agenda('2026-10-15', data).todos.map((t) => t.id), [1]);
    assert.deepEqual(agenda('2026-09-30', data).ongoing, []);
  });
  it('filters by category', () => {
    const m = agenda('2026-10-08', data, 'marketing');
    assert.deepEqual(m.todos, []);
    assert.deepEqual(m.followUps, []);
    assert.deepEqual(m.posts.map((p) => p.id), ['p1']);
    const s = agenda('2026-10-08', data, 'sales');
    assert.deepEqual(s.todos.map((t) => t.id), [2]);
    assert.deepEqual(s.posts, []);
    assert.equal(s.followUps.length, 1);
    assert.deepEqual(overdue('2026-10-08', data, 'marketing').posts.map((p) => p.id), ['p3']);
  });
  it('counts days left', () => {
    assert.equal(daysLeft('2026-10-15', '2026-10-08'), 7);
    assert.equal(daysLeft('2026-10-05', '2026-10-08'), -3);
  });
  it('summarises reviews', () => {
    const r = reviewStats([{ rating: 5, published_at: '2026-10-01' }, { rating: 5, published_at: '2026-09-01' }, { rating: 2, published_at: '2026-10-02' }]);
    assert.deepEqual(r.stars, [0, 1, 0, 0, 2]);
    assert.equal(r.average, 4);
    assert.equal(reviewStats([{ rating: 5, published_at: '2026-10-01' }, { rating: 3, published_at: '2026-09-01' }], '2026-09-15').count, 1);
    assert.deepEqual(reviewGrowth([{ day: '2026-09-01', rating: 4.6, rating_count: 1000 }, { day: '2026-10-01', rating: 4.7, rating_count: 1040 }]).gained, 40);
    assert.equal(reviewGrowth([{ day: '2026-09-01', rating_count: 1 }]), null);
  });
});

describe('front-line affiliates', () => {
  const partners = [{ id: 'h1', name: 'Hotel Borg', affiliate_code: 'BORG' }];
  const anna = { id: 'a1', partner_id: 'h1', name: 'Anna', code: 'ANNA-BORG', commission_type: 'percent', commission_value: 5 };
  const solo = { id: 'a2', partner_id: null, name: 'Jón', code: 'JON', commission_type: 'fixed', commission_value: 20 };
  const sales = [
    { booking_ref: '1', booking_date: '2026-09-01', return_date: '2026-09-20', affiliate_code: 'anna-borg', amount_eur: 1000, amount_isk: 140000, is_cancelled: false },
    { booking_ref: '2', booking_date: '2026-10-01', return_date: '2026-11-10', affiliate_code: 'ANNA-BORG', amount_eur: 600, amount_isk: 84000, is_cancelled: false },
    { booking_ref: '3', booking_date: '2026-09-05', return_date: '2026-09-10', affiliate_code: 'ANNA-BORG', amount_eur: 900, amount_isk: 126000, is_cancelled: true },
    { booking_ref: '4', booking_date: '2026-09-02', affiliate_code: 'BORG', amount_eur: 500, amount_isk: 70000, is_cancelled: false },
    { booking_ref: '5', booking_date: '2026-09-03', pickup_date: '2026-09-30', affiliate_code: 'JON', amount_eur: 800, amount_isk: 112000, is_cancelled: false },
  ];
  it('pays only completed, not cancelled bookings', () => {
    assert.equal(isCompleted(sales[0], '2026-10-07'), true);
    assert.equal(isCompleted(sales[1], '2026-10-07'), false);
    assert.equal(isCompleted(sales[2], '2026-10-07'), false);
    assert.equal(saleCommission(sales[0], anna), 50);
    assert.equal(saleCommission(sales[4], solo), 20);
    const e = affiliateEarnings(anna, sales, [{ affiliate_id: 'a1', amount_eur: 30 }], '2026-10-07');
    assert.deepEqual(e, { bookings: 2, completed: 1, revenue_eur: 1600, earned: 50, pending: 30, paid: 30, owed: 20 });
  });
  it('counts a person’s bookings for their hotel and keeps them visible per source', () => {
    const byCode = partnerByCode(partners, [anna, solo]);
    assert.equal(byCode.get('anna-borg').name, 'Hotel Borg');
    assert.equal(byCode.has('jon'), false);
    const byHotel = revenueByPartner(sales, partners, 'EUR', [anna, solo]);
    assert.equal(byHotel[0].partner.name, 'Hotel Borg');
    assert.equal(byHotel[0].revenue, 2100);
    assert.equal(byHotel.find((r) => r.affiliate?.name === 'Jón').revenue, 800);
    const bySource = revenueBySource(sales, partners, 'EUR', [anna, solo]);
    assert.equal(bySource.find((r) => r.code === 'anna-borg' || r.code === 'ANNA-BORG').affiliate.name, 'Anna');
  });
});

describe('subtasks', () => {
  it('reports checklist progress', async () => {
    const { subtaskProgress } = await import('../public/js/lib.js');
    assert.deepEqual(subtaskProgress({ subtasks: [{ done: true }, { done: false }, { done: true }] }), { done: 2, total: 3 });
    assert.deepEqual(subtaskProgress({}), { done: 0, total: 0 });
  });
});

describe('done history', () => {
  it('groups by the day it was ticked off and measures lateness', async () => {
    const { groupDone } = await import('../public/js/lib.js');
    const g = groupDone([
      { id: 1, due_date: '2026-10-05', done_at: '2026-10-07T10:00:00.000Z' },
      { id: 2, due_date: '2026-10-07', done_at: '2026-10-07T09:00:00.000Z' },
      { id: 3, due_date: '2026-10-08', done_at: '2026-10-06T09:00:00.000Z' },
      { id: 4, due_date: '2026-10-01', done_at: null },
    ]);
    assert.deepEqual(g.map((x) => x.day), ['2026-10-07', '2026-10-06', '2026-10-01']);
    assert.deepEqual(g[0].items.map((x) => x.lateBy), [2, 0]);
    assert.equal(g[1].items[0].lateBy, 0); // done early
  });
});

describe('marketing deadlines', () => {
  it('lists open post deadlines and marketing tasks, soonest first', async () => {
    const { marketingDeadlines, agenda, overdue, postDeadlineOpen } = await import('../public/js/lib.js');
    const posts = [
      { id: 'p1', title: 'Aurora reel', status: 'in_progress', deadline: '2026-10-09', publish_date: '2026-10-12' },
      { id: 'p2', title: 'Ready already', status: 'scheduled', deadline: '2026-10-08', publish_date: '2026-10-10' },
      { id: 'p3', title: 'Late idea', status: 'idea', deadline: '2026-10-05' },
      { id: 'p4', title: 'Far away', status: 'idea', deadline: '2026-12-20' },
    ];
    const tasks = [
      { id: 't1', type: 'todo', category: 'marketing', title: 'Campaign brief', due_date: '2026-10-08', done: false },
      { id: 't2', type: 'todo', category: 'sales', title: 'Sales thing', due_date: '2026-10-08', done: false },
      { id: 't3', type: 'todo', category: 'marketing', title: 'Done one', due_date: '2026-10-08', done: true },
    ];
    assert.equal(postDeadlineOpen(posts[1]), false);
    const d = marketingDeadlines({ tasks, posts }, '2026-10-07');
    assert.deepEqual(d.map((x) => x.id), ['p3', 't1', 'p1']);
    assert.deepEqual(d.map((x) => x.daysLeft), [-2, 1, 2]);
    assert.deepEqual(agenda('2026-10-09', { tasks, partners: [], posts }).readyBy.map((p) => p.id), ['p1']);
    assert.deepEqual(overdue('2026-10-07', { tasks, partners: [], posts }).posts.map((p) => p.id), ['p3']);
  });
});

describe('partner types', () => {
  it('describes size by kind of place', async () => {
    const { capacityText, hasStars } = await import('../public/js/lib.js');
    assert.equal(capacityText({ type: 'hotel', rooms: 99 }), '99 rooms');
    assert.equal(capacityText({ type: 'hostel', rooms: 40 }), '40 beds');
    assert.equal(capacityText({ type: 'campsite', rooms: 120 }), '120 pitches');
    assert.equal(capacityText({ type: 'cafe', rooms: 10 }), null);
    assert.equal(hasStars('campsite'), false);
    assert.equal(hasStars('guesthouse'), true);
  });
});
