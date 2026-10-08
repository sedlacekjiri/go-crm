import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toReviewRow } from '../functions/_lib/google.js';

describe('toReviewRow', () => {
  it('maps a Places API (New) review, preferring the original language', () => {
    const row = toReviewRow(
      {
        name: 'places/ChIJ123/reviews/ABC',
        rating: 5,
        text: { text: 'Great service', languageCode: 'en' },
        originalText: { text: 'Frábær þjónusta', languageCode: 'is' },
        authorAttribution: { displayName: 'Anna', uri: 'https://maps.google.com/u/1', photoUri: 'https://lh3/photo' },
        publishTime: '2026-10-01T12:00:00Z',
        googleMapsUri: 'https://maps.google.com/review/1',
      },
      'ChIJ123',
      '2026-10-07T00:00:00Z'
    );
    assert.deepEqual(row, {
      id: 'places/ChIJ123/reviews/ABC',
      place_id: 'ChIJ123',
      rating: 5,
      text: 'Frábær þjónusta',
      language: 'is',
      author: 'Anna',
      author_uri: 'https://maps.google.com/u/1',
      author_photo: 'https://lh3/photo',
      published_at: '2026-10-01T12:00:00Z',
      review_uri: 'https://maps.google.com/review/1',
      first_seen: '2026-10-07T00:00:00Z',
    });
  });
  it('copes with a review without text', () => {
    const row = toReviewRow({ name: 'x', rating: 4 }, 'p', 't');
    assert.equal(row.text, null);
    assert.equal(row.author, null);
  });
});

describe('Google Business Profile', async () => {
  const gbp = await import('../functions/_lib/gbp.js');
  it('signs and verifies the OAuth state', async () => {
    const s = await gbp.signState('secret', 1_000_000);
    assert.equal(await gbp.verifyState('secret', s, 1_000_000 + 60_000), true);
    assert.equal(await gbp.verifyState('other', s, 1_000_000 + 60_000), false, 'wrong secret');
    assert.equal(await gbp.verifyState('secret', s, 1_000_000 + 16 * 60_000), false, 'expired');
    assert.equal(await gbp.verifyState('secret', s.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), 1_000_000), false, 'tampered');
    assert.equal(await gbp.verifyState('secret', 'garbage', 1_000_000), false);
  });
  it('maps a Business Profile review', () => {
    const row = gbp.toGbpRow(
      {
        name: 'accounts/1/locations/2/reviews/3',
        starRating: 'FOUR',
        comment: 'Nice car',
        reviewer: { displayName: 'Anna', profilePhotoUrl: 'https://p' },
        createTime: '2026-10-07T10:00:00Z',
        updateTime: '2026-10-07T11:00:00Z',
        reviewReply: { comment: 'Thank you!', updateTime: '2026-10-07T12:00:00Z' },
      },
      { name: 'locations/2', place_id: 'ChIJx' },
      'now'
    );
    assert.equal(row.id, 'accounts/1/locations/2/reviews/3');
    assert.equal(row.rating, 4);
    assert.equal(row.place_id, 'ChIJx');
    assert.equal(row.source, 'gbp');
    assert.equal(row.reply_text, 'Thank you!');
    assert.equal(gbp.toGbpRow({ name: 'x', starRating: 'FIVE', reviewer: { isAnonymous: true, displayName: 'Hidden' } }, { name: 'l' }, 'now').author, 'Google user');
  });
  it('explains Google errors in plain words', () => {
    assert.match(gbp.explainGoogleError(429, 'Quota exceeded'), /approval/);
    assert.match(gbp.explainGoogleError(403, 'My Business Account Management API has not been used in project 1 before or it is disabled'), /Enable the Business Profile APIs/);
    assert.match(gbp.explainGoogleError(401), /connect the Google account again/);
  });
  it('reads the e-mail from an ID token', () => {
    const payload = Buffer.from(JSON.stringify({ email: 'me@example.com' })).toString('base64url');
    assert.equal(gbp.emailFromIdToken(`x.${payload}.y`), 'me@example.com');
    assert.equal(gbp.emailFromIdToken('bad'), null);
  });
});
