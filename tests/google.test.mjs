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
