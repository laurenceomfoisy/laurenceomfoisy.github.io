import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Teach = require('../teach.js');
const PB = require('../portfolio-builder-core.js');

// Minimal stock factory satisfying KEY_METRICS
function mk(t, over = {}) {
  return Object.assign({
    ticker: t, name: t + ' Inc', sector: 'Tech', market_cap: 50e9,
    free_cash_flow: 1e9, current_ratio: 2, debt_to_equity: 50,
    revenue_growth: 0.10, earnings_growth: 0.10, momentum_6m: 0.1, momentum_1y: 0.2,
    scores: { overall: 50, hype: 50, quality: 50, profitability: 50, cash_flow: 50, safety: 50 },
  }, over);
}

const FLOOR = Object.assign({}, PB.DEFAULT_FLOOR);

test('rulesFailed: names exactly the failing rules', () => {
  const junk = mk('JNK', { debt_to_equity: 500, current_ratio: 0.4 });
  const fails = Teach.rulesFailed(junk, FLOOR);
  assert.deepEqual(fails.sort(), ['current', 'debt']);
  assert.deepEqual(Teach.rulesFailed(mk('OK'), FLOOR), []);
});

test('pickTeachingExamples: strong, trap, mediocre are distinct and correct', () => {
  const stocks = [
    mk('TOP', { scores: { overall: 95, hype: 60, quality: 90, profitability: 90, cash_flow: 90, safety: 90 } }),
    mk('TRP', { debt_to_equity: 400, current_ratio: 0.5, scores: { overall: 55, hype: 99, quality: 30, profitability: 40, cash_flow: 30, safety: 10 } }),
    mk('MID', { scores: { overall: 50, hype: 40, quality: 50, profitability: 50, cash_flow: 50, safety: 50 } }),
    mk('MI2', { scores: { overall: 52, hype: 41, quality: 52, profitability: 52, cash_flow: 52, safety: 52 } }),
  ];
  const ex = Teach.pickTeachingExamples(stocks, FLOOR);
  assert.equal(ex.strong.ticker, 'TOP');
  assert.equal(ex.trap.ticker, 'TRP'); // top-quartile hype + fails 2 rules
  assert.ok(['MID', 'MI2'].includes(ex.mediocre.ticker));
  assert.notEqual(ex.mediocre.ticker, ex.strong.ticker);
});

test('pickTeachingExamples: no trap candidates -> trap null, tiny universe safe', () => {
  const ex = Teach.pickTeachingExamples([mk('A'), mk('B')], FLOOR);
  assert.equal(ex.trap, null);
  assert.ok(ex.strong);
  assert.ok(ex.mediocre);
});

test('casualtiesByRule: counts match single-rule semantics, casualties capped at 3 by market cap', () => {
  const stocks = [
    mk('BIG', { debt_to_equity: 300, market_cap: 900e9 }),
    mk('MED', { debt_to_equity: 300, market_cap: 100e9 }),
    mk('SML', { debt_to_equity: 300, market_cap: 10e9 }),
    mk('TNY', { debt_to_equity: 300, market_cap: 5e9 }),
    mk('OK1'),
  ];
  const r = Teach.casualtiesByRule(stocks, FLOOR);
  assert.equal(r.debt.killCount, 4);
  assert.equal(r.debt.casualties.length, 3);
  assert.deepEqual(r.debt.casualties.map(s => s.ticker), ['BIG', 'MED', 'SML']);
  assert.equal(r.rev.killCount, 0);
});
