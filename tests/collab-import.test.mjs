import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeText, parseCollabSheet, sheetBool, sheetDateRange, sheetInfo, sheetMoney } from '../public/js/lib.js';

// Rows as they come from the "Social Media collaboration (Campers 26)" sheet.
const HEADERS = ['Nafn', 'Social Media', 'Email', 'Follower count', 'Hvernig efni?', 'Bíltegund', 'Pick- Drop off', 'Umboð', 'Mood board', 'Booking number', 'Last update', 'Comment', 'Verð', 'Refund', 'Efni skilað & endurgreitt', 'Komið á Onedrive'];
const row = (...v) => Object.fromEntries(HEADERS.map((h, i) => [h, v[i] ?? '']));

describe('collaborators spreadsheet import', () => {
  it('reads sheet names', () => {
    assert.deepEqual(sheetInfo('Campers 26'), { brand: 'camper', year: 2026 });
    assert.deepEqual(sheetInfo('Car Rental 25'), { brand: 'car', year: 2025 });
    assert.deepEqual(sheetInfo('Social Media collaboration 2022(Campers 26)'), { brand: 'camper', year: 2026 });
  });
  it('understands the cells', () => {
    assert.equal(sheetBool('PRAVDA'), true);
    assert.equal(sheetBool('NEPRAVDA'), false);
    assert.equal(sheetBool('TRUE'), true);
    assert.equal(sheetMoney(' € 1,650.00 '), 1650);
    assert.equal(sheetMoney(' € 731.00 '), 731);
    assert.equal(sheetMoney(' € -   '), null);
    assert.equal(sheetMoney('12,200'), 12200);
    assert.deepEqual(sheetDateRange('26 júní - 4 júlí', 2026), { pickup: '2026-06-26', dropoff: '2026-07-04' });
    assert.deepEqual(sheetDateRange('20 sept - 30 Sept', 2026), { pickup: '2026-09-20', dropoff: '2026-09-30' });
    assert.deepEqual(sheetDateRange('27 okt - 5 nóv', 2026), { pickup: '2026-10-27', dropoff: '2026-11-05' });
    assert.deepEqual(sheetDateRange('7 mars - 18 mars', 2026), { pickup: '2026-03-07', dropoff: '2026-03-18' });
    assert.deepEqual(sheetDateRange('28 júlí - 5 ágúst', 2026), { pickup: '2026-07-28', dropoff: '2026-08-05' });
    assert.deepEqual(sheetDateRange('28 Dec - 3 Jan', 2025), { pickup: '2025-12-28', dropoff: '2026-01-03' });
    assert.deepEqual(sheetDateRange('', 2026), { pickup: null, dropoff: null });
  });
  it('turns rows into collaborations', () => {
    const { items, skipped } = parseCollabSheet(
      [
        row('NIcolás Sanchez', 'https://www.instagram.com/onlythenico/', 'onlythenico@gmail.com', '12,200', 'High-quality photos', 'Go Big Camper', '2 Jan - 10 Jan', 'Þórdís', 'NEPRAVDA', '141752', '', '200 euros extras og kaupir gold', ' € 1,650.00 ', '792', 'PRAVDA', 'PRAVDA'),
        row('Josiah Bice\nJoseph Greer', 'http://www.instagram.com/ioegreer', 'josiahdbice@gmail.com\nioegreer@gmail.com', '', 'Film', 'Go 4x4 Pro', '7 júlí - 13 júlí', 'Þórdís', 'NEPRAVDA', '145660', '', '35% + 200 euros extras', ' € 3,087.00 ', ' € 1,080.00 ', 'PRAVDA', 'PRAVDA'),
        row('Mike Rahi', '', 'mickael.rahimaly@gmail.com', '', '2 storylines', 'Go Cruiser \nGo Lux', '20 sept - 30 Sept', 'Þórdís', 'PRAVDA', 'OY7UH9\n4CPP3S', '', 'EFTIR AÐ FÁ MAIN VIDEO', '', '', 'NEPRAVDA', 'NEPRAVDA'),
        row('', '', '', '', '', '', '', '', 'NEPRAVDA', '', '', '', '', '', 'NEPRAVDA', 'NEPRAVDA'),
        row('', '', '', '34,828', '', '', '', '', '', '', '', '', ' € 42,564.00 ', '8089', ' € 34,475.00 ', ''),
      ],
      { brand: 'camper', year: 2026 }
    );
    assert.equal(items.length, 3);
    assert.equal(skipped, 2, 'empty + totals rows skipped');
    const [a, b, c] = items;
    assert.equal(a.followers, 12200);
    assert.equal(a.price_eur, 1650);
    assert.equal(a.refund_eur, 792);
    assert.equal(a.status, 'done');
    assert.equal(a.in_onedrive, true);
    assert.equal(a.handled_by, 'Þórdís');
    assert.equal(a.pickup_date, '2026-01-02');
    assert.equal(b.name, 'Josiah Bice & Joseph Greer');
    assert.equal(b.email, 'josiahdbice@gmail.com, ioegreer@gmail.com');
    assert.equal(c.vehicle, 'Go Cruiser + Go Lux');
    assert.equal(c.booking_ref, 'OY7UH9, 4CPP3S');
    assert.equal(c.moodboard, true);
    assert.equal(c.status, 'agreed');
    assert.notEqual(a.import_key, b.import_key);
  });
  it('decodes Windows-1252 CSV (Excel) and UTF-8', () => {
    const text = 'Nafn,Umboð\nAnna,Þórdís';
    assert.equal(decodeText(new Uint8Array(Buffer.from(text, 'latin1'))), text);
    assert.equal(decodeText(new Uint8Array(Buffer.from(text, 'utf8'))), text);
  });
});
