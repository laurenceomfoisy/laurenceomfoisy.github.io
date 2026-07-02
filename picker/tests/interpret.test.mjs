import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Interpret = require('../interpret.js');

const UNIVERSE = [
  { ticker: 'AAA', operating_margin: 0.05 },
  { ticker: 'BBB', operating_margin: 0.20 },
  { ticker: 'CCC', operating_margin: 0.60 },
];

test('getValue: reads flat and nested keys, nulls non-finite', () => {
  const s = { roe: 0.36, scores: { overall: 92.2 }, forward_pe: null };
  assert.equal(Interpret.getValue(s, 'roe'), 0.36);
  assert.equal(Interpret.getValue(s, 'scores.overall'), 92.2);
  assert.equal(Interpret.getValue(s, 'forward_pe'), null);
  assert.equal(Interpret.getValue(s, 'nonexistent'), null);
});

test('interpret: picks the right range and tone', () => {
  const r = Interpret.interpret('debt_to_equity', { ticker: 'T', debt_to_equity: 250 }, []);
  assert.equal(r.tone, 'bad');
  assert.match(r.verdict, /twice what shareholders own/i);
  assert.equal(r.display, '250.0%');
});

test('interpret: boundary value falls in the next range (value < max)', () => {
  const r = Interpret.interpret('debt_to_equity', { ticker: 'T', debt_to_equity: 50 }, []);
  assert.equal(r.tone, 'fine'); // 50 is NOT < 50, so second range
});

test('interpret: missing data is called out, tone na', () => {
  const r = Interpret.interpret('operating_margin', { ticker: 'XYZ' }, UNIVERSE);
  assert.equal(r.tone, 'na');
  assert.equal(r.display, '—');
  assert.match(r.verdict, /XYZ/);
  assert.match(r.verdict, /yellow flag/);
});

test('interpret: {val} and {pct} are substituted', () => {
  const r = Interpret.interpret('operating_margin', { ticker: 'CCC', operating_margin: 0.60 }, UNIVERSE);
  assert.equal(r.tone, 'good');
  assert.ok(r.verdict.includes('60.0%'), r.verdict);
  assert.ok(!r.verdict.includes('{pct}'), 'percentile placeholder must be filled');
});

test('verdictsForCard: overall first, then 3 domain lines, deterministic', () => {
  const stock = {
    ticker: 'T', scores: { overall: 92 }, fcf_yield: 0.08, operating_margin: 0.3,
    debt_to_equity: 250, current_ratio: 0.8, revenue_growth: 0.35, momentum_6m: 0.5,
  };
  const lines = Interpret.verdictsForCard(stock, [stock]);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].key, 'scores.overall');
  const keys = lines.map(l => l.key);
  assert.ok(keys.includes('debt_to_equity') || keys.includes('current_ratio'), 'safety problem must surface');
});
