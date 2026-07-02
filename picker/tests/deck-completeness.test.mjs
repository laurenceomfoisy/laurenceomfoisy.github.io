import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CopyDeck = require('../copy-deck.js');

test('every metric key referenced by wizard.js has a deck entry', () => {
  const src = readFileSync(new URL('../wizard.js', import.meta.url), 'utf8');
  // Convention: wizard code always references metrics as interpret-able keys
  // in quotes: 'operating_margin', 'scores.overall', etc. A few metric keys
  // ('roe') carry no recognizable suffix, so they're matched by an explicit
  // bare-key alternation alongside the suffix patterns.
  const candidates = src.match(/'(scores\.[a-z_]+|[a-z_]+_(margin|ratio|growth|yield|equity|cap|pe|book|6m|1y)|roe)'/g) || [];
  const keys = [...new Set(candidates.map(s => s.slice(1, -1)))];
  assert.ok(keys.length >= 15, `suspiciously few metric refs found: ${keys.length}`);
  for (const k of keys) assert.ok(CopyDeck.metrics[k], `wizard.js renders '${k}' but the deck has no entry`);
});
