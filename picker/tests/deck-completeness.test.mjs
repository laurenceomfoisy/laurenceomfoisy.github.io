import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CopyDeck = require('../copy-deck.js');

// Every UI module that renders metric verdicts or section copy. simulate.js
// joins the list when it lands; existsSync keeps the loop honest either way.
const UI_FILES = ['wizard.js', 'dashboard.js', 'simulate.js']
  .map((f) => new URL('../' + f, import.meta.url))
  .filter((u) => existsSync(fileURLToPath(u)));

test('every metric key referenced by the UI has a deck entry', () => {
  for (const file of UI_FILES) {
    const src = readFileSync(file, 'utf8');
    // Convention: UI code always references metrics as interpret-able keys
    // in quotes: 'operating_margin', 'scores.overall', etc. A few metric keys
    // ('roe') carry no recognizable suffix, so they're matched by an explicit
    // bare-key alternation alongside the suffix patterns.
    const candidates = src.match(/'(scores\.[a-z_]+|[a-z_]+_(margin|ratio|growth|yield|equity|cap|pe|book|6m|1y)|roe)'/g) || [];
    const keys = [...new Set(candidates.map(s => s.slice(1, -1)))];
    for (const k of keys) assert.ok(CopyDeck.metrics[k], `${file.pathname} renders '${k}' but the deck has no entry`);
  }
});

test('wizard.js still references a healthy number of metric keys', () => {
  const src = readFileSync(new URL('../wizard.js', import.meta.url), 'utf8');
  const candidates = src.match(/'(scores\.[a-z_]+|[a-z_]+_(margin|ratio|growth|yield|equity|cap|pe|book|6m|1y)|roe)'/g) || [];
  const keys = [...new Set(candidates.map(s => s.slice(1, -1)))];
  assert.ok(keys.length >= 15, `suspiciously few metric refs found: ${keys.length}`);
});

test('every CopyDeck.sections path referenced by the UI resolves to real copy', () => {
  for (const file of UI_FILES) {
    const src = readFileSync(file, 'utf8');
    // Convention: section copy is read as `CopyDeck.sections.a.b` or via a
    // local alias assigned with `const s = CopyDeck.sections.dashboard`.
    const aliases = {};
    for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*CopyDeck\.sections\.([\w.]+)/g)) {
      aliases[m[1]] = m[2];
    }
    const paths = new Set();
    for (const m of src.matchAll(/CopyDeck\.sections\.([\w.$]+)/g)) paths.add(m[1]);
    for (const [alias, base] of Object.entries(aliases)) {
      for (const m of src.matchAll(new RegExp(`\\b${alias}\\.([\\w.]+)`, 'g'))) {
        paths.add(base + '.' + m[1]);
      }
    }
    for (const path of paths) {
      let cur = CopyDeck.sections;
      for (const part of path.split('.')) {
        cur = cur && cur[part];
      }
      const ok = (typeof cur === 'string' && cur.length > 0) ||
                 (cur !== null && typeof cur === 'object');
      assert.ok(ok, `${file.pathname} reads CopyDeck.sections.${path} but the deck has no copy there`);
    }
  }
});
