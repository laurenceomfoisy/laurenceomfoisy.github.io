// tests/copy-deck.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CopyDeck = require('../copy-deck.js');

const TONES = new Set(['good', 'fine', 'caution', 'bad']);
const UNITS = new Set(['dec-pct', 'pct', 'ratio', 'usd', 'score']);
const REQUIRED_KEYS = [
  'operating_margin', 'net_margin', 'roe', 'fcf_yield', 'forward_pe',
  'trailing_pe', 'price_to_book', 'dividend_yield', 'debt_to_equity',
  'current_ratio', 'revenue_growth', 'earnings_growth', 'momentum_6m',
  'momentum_1y', 'market_cap', 'scores.profitability', 'scores.cash_flow',
  'scores.safety', 'scores.quality', 'scores.hype', 'scores.overall',
];

test('deck: every required metric has a complete entry', () => {
  for (const key of REQUIRED_KEYS) {
    const m = CopyDeck.metrics[key];
    assert.ok(m, `missing deck entry: ${key}`);
    for (const field of ['label', 'short', 'why', 'unit']) {
      assert.ok(typeof m[field] === 'string' && m[field].length > 0 || field === 'unit' && UNITS.has(m.unit),
        `${key}.${field} missing/empty`);
    }
    assert.ok(UNITS.has(m.unit), `${key}.unit invalid: ${m.unit}`);
    assert.ok(Array.isArray(m.ranges) && m.ranges.length >= 2, `${key}.ranges too small`);
    let prev = -Infinity;
    for (const r of m.ranges) {
      assert.ok(TONES.has(r.tone), `${key} bad tone ${r.tone}`);
      assert.ok(typeof r.verdict === 'string' && r.verdict.length > 10, `${key} verdict too short`);
      assert.ok(r.max > prev, `${key}.ranges not ascending`);
      prev = r.max;
    }
    assert.equal(m.ranges[m.ranges.length - 1].max, Infinity, `${key} last range must be Infinity`);
  }
});

test('deck: verdicts never restate the ratio jargon', () => {
  // Blunt-coach spot check: no verdict may contain these lazy patterns.
  const banned = [/D\/E/, /P\/E ratio of/, /\bN\/A\b/];
  for (const [key, m] of Object.entries(CopyDeck.metrics)) {
    for (const r of m.ranges) {
      for (const pat of banned) assert.ok(!pat.test(r.verdict), `${key}: "${r.verdict}" matches ${pat}`);
    }
  }
});

test('format: units render correctly', () => {
  assert.equal(CopyDeck.format('operating_margin', 0.581), '58.1%');
  assert.equal(CopyDeck.format('debt_to_equity', 79.548), '79.5%');
  assert.equal(CopyDeck.format('current_ratio', 2.488), '2.49');
  assert.equal(CopyDeck.format('market_cap', 2303987286016), '$2.3T');
  assert.equal(CopyDeck.format('scores.overall', 92.2), '92');
});
