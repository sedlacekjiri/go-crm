import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactNumber, socialSummary } from '../public/js/lib.js';

const r = (account, date, followers) => ({ account, date, followers });

describe('socialSummary', () => {
  it('adds up both brands and measures growth over 7 / 30 days', () => {
    const rows = [
      r('instagram:car', '2026-09-01', 1000),
      r('instagram:car', '2026-10-05', 1100),
      r('instagram:car', '2026-10-12', 1150),
      r('instagram:camper', '2026-09-01', 500),
      r('instagram:camper', '2026-10-12', 560),
    ];
    const ig = socialSummary(rows, '2026-10-12').find((s) => s.channel === 'instagram');
    assert.equal(ig.total, 1710);
    assert.deepEqual(ig.byBrand, { car: 1150, camper: 560 });
    assert.equal(ig.change7, 50 + 60); // car since 5 Oct, camper since 1 Sep (its last count before)
    assert.equal(ig.change30, 150 + 60);
    assert.equal(ig.sinceFirst, 210);
    assert.equal(ig.updated, '2026-10-12');
    assert.deepEqual(ig.series.map((p) => p.total), [1500, 1600, 1710]);
  });

  it('does not count a newly added account as growth', () => {
    const rows = [r('tiktok:car', '2026-09-20', 300), r('tiktok:car', '2026-10-12', 340), r('tiktok:camper', '2026-10-12', 9000)];
    const tt = socialSummary(rows, '2026-10-12').find((s) => s.channel === 'tiktok');
    assert.equal(tt.total, 9340);
    assert.equal(tt.change30, null); // nothing 30 days back
    assert.equal(tt.change7, 40);
    assert.equal(tt.sinceFirst, 40);
  });

  it('is empty without data', () => {
    const fb = socialSummary([], '2026-10-12').find((s) => s.channel === 'facebook');
    assert.equal(fb.total, null);
    assert.equal(fb.change7, null);
    assert.deepEqual(fb.series, []);
  });

  it('formats big numbers', () => {
    assert.equal(compactNumber(950), '950');
    assert.equal(compactNumber(9500), '9,500');
    assert.equal(compactNumber(12345), '12.3k');
    assert.equal(compactNumber(1520000), '1.52M');
  });
});
