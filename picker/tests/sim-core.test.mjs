// tests/sim-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SimCore = require('../sim-core.js');

const DATES = ['2024-01-05', '2024-01-12', '2024-01-19', '2024-01-26', '2024-02-02'];

function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: ${actual} !== ${expected}`);
}

test('indexOnOrAfter: exact hit, between-weeks rounds forward, past end is -1', () => {
  assert.equal(SimCore.indexOnOrAfter(DATES, '2024-01-12'), 1);
  assert.equal(SimCore.indexOnOrAfter(DATES, '2024-01-13'), 2);
  assert.equal(SimCore.indexOnOrAfter(DATES, '2023-06-01'), 0);
  assert.equal(SimCore.indexOnOrAfter(DATES, '2024-03-01'), -1);
});

test('ffill: interior nulls carried forward, leading nulls stay null', () => {
  assert.deepEqual(SimCore.ffill([null, null, 10, null, 12]), [null, null, 10, 10, 12]);
  assert.deepEqual(SimCore.ffill([5, null, null]), [5, 5, 5]);
});

test('lump sum: exact-date buy, gain math, series shape', () => {
  const r = SimCore.simulateLumpSum(DATES, [100, 110, 105, 120, 130], 1000, '2024-01-05');
  assert.equal(r.ok, true);
  assert.equal(r.startDate, '2024-01-05');
  approx(r.shares, 10, 'shares');
  approx(r.endValue, 1300, 'endValue');
  approx(r.gainAbs, 300, 'gainAbs');
  approx(r.returnPct, 30, 'returnPct');
  assert.equal(r.series.length, 5);
  assert.deepEqual(r.series[0], { date: '2024-01-05', value: 1000 });
  assert.deepEqual(r.series[4], { date: '2024-02-02', value: 1300 });
});

test('lump sum: a date between weekly closes buys at the NEXT close', () => {
  const r = SimCore.simulateLumpSum(DATES, [100, 110, 105, 120, 130], 1000, '2024-01-08');
  assert.equal(r.ok, true);
  assert.equal(r.startDate, '2024-01-12');
  approx(r.startPrice, 110, 'startPrice');
});

test('lump sum: leading nulls (not yet listed) push the buy to the first real price', () => {
  const r = SimCore.simulateLumpSum(DATES, [null, null, 50, 55, 60], 100, '2024-01-05');
  assert.equal(r.ok, true);
  assert.equal(r.startDate, '2024-01-19');
  approx(r.endValue, 120, 'endValue');
});

test('lump sum: interior null holds last price (no fabricated move)', () => {
  const r = SimCore.simulateLumpSum(DATES, [100, null, null, 100, 90], 100, '2024-01-05');
  assert.equal(r.ok, true);
  approx(r.series[1].value, 100, 'held value at first gap');
  approx(r.series[2].value, 100, 'held value at second gap');
  approx(r.endValue, 90, 'endValue');
});

test('lump sum errors: bad amount, past-end date, buy only possible on last point', () => {
  assert.deepEqual(SimCore.simulateLumpSum(DATES, [1, 2, 3, 4, 5], 0, '2024-01-05'), { ok: false, reason: 'bad-amount' });
  assert.deepEqual(SimCore.simulateLumpSum(DATES, [1, 2, 3, 4, 5], -5, '2024-01-05'), { ok: false, reason: 'bad-amount' });
  assert.equal(SimCore.simulateLumpSum(DATES, [1, 2, 3, 4, 5], 100, '2024-06-01').reason, 'no-data');
  assert.equal(SimCore.simulateLumpSum(DATES, [null, null, null, null, 5], 100, '2024-01-05').reason, 'before-history');
  assert.equal(SimCore.simulateLumpSum(DATES, [null, null, null, null, null], 100, '2024-01-05').reason, 'before-history');
});

test('portfolio: two holdings combine, weights respected', () => {
  const seriesMap = {
    A: [100, 110, 105, 120, 130], // +30%
    B: [50, 50, 50, 50, 60],      // +20%
  };
  const r = SimCore.simulatePortfolio(DATES, seriesMap, [
    { ticker: 'A', weightPct: 60 },
    { ticker: 'B', weightPct: 40 },
  ], 1000, '2024-01-05');
  assert.equal(r.ok, true);
  approx(r.endValue, 600 * 1.3 + 400 * 1.2, 'endValue');
  assert.equal(r.skipped.length, 0);
  assert.equal(r.perHolding.length, 2);
  approx(r.perHolding[0].weightPct, 60, 'weight A');
  approx(r.series[0].value, 1000, 'combined series starts at cost');
  approx(r.series[4].value, r.endValue, 'combined series ends at endValue');
});

test('portfolio: dataless holding is skipped and weights renormalize', () => {
  const seriesMap = {
    A: [100, 110, 105, 120, 130],           // +30%
    GONE: [null, null, null, null, null],
  };
  const r = SimCore.simulatePortfolio(DATES, seriesMap, [
    { ticker: 'A', weightPct: 50 },
    { ticker: 'GONE', weightPct: 30 },
    { ticker: 'NEVER_FETCHED', weightPct: 20 },
  ], 1000, '2024-01-05');
  assert.equal(r.ok, true);
  assert.equal(r.skipped.length, 2);
  assert.deepEqual(r.skipped.map((s) => s.ticker).sort(), ['GONE', 'NEVER_FETCHED']);
  // All $1000 flows into A after renormalization.
  approx(r.perHolding[0].weightPct, 100, 'renormalized weight');
  approx(r.endValue, 1300, 'endValue all-in on A');
});

test('portfolio: late-listing slice sits at cost until its buy executes', () => {
  const seriesMap = {
    A: [100, 100, 100, 100, 100],  // flat
    LATE: [null, null, 50, 50, 100], // doubles after listing at week 3
  };
  const r = SimCore.simulatePortfolio(DATES, seriesMap, [
    { ticker: 'A', weightPct: 50 },
    { ticker: 'LATE', weightPct: 50 },
  ], 1000, '2024-01-05');
  assert.equal(r.ok, true);
  approx(r.series[0].value, 1000, 'week 1: LATE slice counted at cost');
  approx(r.series[1].value, 1000, 'week 2: still at cost');
  approx(r.series[4].value, 500 + 1000, 'end: LATE doubled');
});

test('portfolio: no buyable holdings returns no-data with the skip list', () => {
  const r = SimCore.simulatePortfolio(DATES, {}, [{ ticker: 'X', weightPct: 100 }], 1000, '2024-01-05');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-data');
  assert.equal(r.skipped.length, 1);
});

test('benchmark parity: identical series produce identical results', () => {
  const closes = [100, 90, 95, 105, 111];
  const a = SimCore.simulateLumpSum(DATES, closes, 500, '2024-01-06');
  const b = SimCore.simulateLumpSum(DATES, closes.slice(), 500, '2024-01-06');
  assert.deepEqual(a, b);
});

test('toCad: week-matched conversion round-trips', () => {
  const usdCad = [1.30, 1.32, null, 1.36, 1.40]; // null ffills to 1.32
  const series = DATES.map((d, i) => ({ date: d, value: 100 }));
  const cad = SimCore.toCadSeries(series, DATES, usdCad);
  approx(cad[0].value, 130, 'week 1');
  approx(cad[2].value, 132, 'gap week uses last known rate');
  approx(cad[4].value, 140, 'week 5');
  approx(SimCore.toCadValue(100, '2024-02-02', DATES, usdCad), 140, 'single value');
  approx(SimCore.toCadValue(100, '2024-12-25', DATES, usdCad), 140, 'past-grid date uses final rate');
});
