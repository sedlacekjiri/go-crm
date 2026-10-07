// Run with: node --test tests/
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actuals,
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
      { type: 'visit', happened_at: '2026-10-05T12:00:00.000Z' },
      { type: 'meeting', happened_at: '2026-10-06T12:00:00.000Z' },
      { type: 'call', happened_at: '2026-10-06T12:00:00.000Z' },
    ];
    const sales = [
      { booking_date: '2026-10-02', affiliate_code: 'borg', amount_eur: 500, is_cancelled: false },
      { booking_date: '2026-10-02', affiliate_code: 'borg', amount_eur: 500, is_cancelled: true },
      { booking_date: '2026-10-02', affiliate_code: null, amount_eur: 900, is_cancelled: false },
    ];
    assert.deepEqual(actuals('2026-10', { partners, activities, sales }), { visits: 2, new_partners: 1, bookings: 1, revenue_eur: 500 });
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
