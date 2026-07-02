# Novice UX Rehaul (Wizard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-tab dashboard with a five-step guided wizard where every number carries an always-visible plain-English verdict, per the approved spec (`../specs/2026-07-02-novice-ux-rehaul-design.md`).

**Architecture:** Two new pure modules (`copy-deck.js` = all explanatory content as data; `interpret.js` = value→verdict engine) feed a new `wizard.js` (shell + five step views). `portfolio-builder-core.js` is reused untouched for floor/scoring/allocation math. `index.html`/`style.css` rewritten for a calm single-column reading layout. Old `app.js` retired.

**Tech Stack:** Vanilla JS/HTML/CSS, no build step, no dependencies. UMD pattern (copy from `portfolio-builder-core.js:4-11`) so node can `require()` the pure modules for tests. Tests: `node --test tests/`. E2E: headless Chromium.

## Global Constraints

- **No build step, no npm dependencies, no frameworks.** Classic `<script>` tags only.
- **Blunt-coach voice** (spec §Voice rules): verdicts are sentences a smart friend would say, never restated ratios; traps named directly; missing data called out plainly; no hedging.
- **No naked numbers:** every metric rendered in the UI must have a copy-deck entry (enforced by test, Task 8).
- **Tones enum:** `good | fine | caution | bad | na` — the only allowed values everywhere.
- **Investment amount is user input, blank by default.** No personal dollar amount anywhere in code or copy.
- **Calm layout:** content column `max-width: 52rem`, base font 18px, dark SoundHype identity (keep existing palette variables from current `style.css` `:root`), tone colors: good `#34d399`, fine `#94a3b8`, caution `#fbbf24`, bad `#f87171` (muted, on-dark).
- **Metric units vary by field** (from `portfolio_data.json`): `operating_margin/net_margin/roe/roa/revenue_growth/earnings_growth/fcf_yield/momentum_*` are decimals (0.35 = 35%); `dividend_yield` and `debt_to_equity` are already percent (0.8 = 0.8%, 79.5 = 79.5%); `current_ratio/forward_pe/trailing_pe/price_to_book/volume_ratio` are plain ratios; `market_cap/price/free_cash_flow` are USD numbers; `scores.*` are 0–100 percentiles.
- **Core API available** (`portfolio-builder-core.js`, untouched): `PortfolioBuilder.{KEY_METRICS, DEFAULT_FLOOR, DEFAULT_WEIGHTS, computePercentile, applyQualityFloor, computeGrowthScores, selectPortfolio, computeWeights, estimateFxCost}`.
- **localStorage:** new state under `soundhype_wizard`; migrate legacy `soundhype_builder` (builder config) and reuse `soundhype_portfolio` (tracker holdings) if present.
- Work in a git worktree of the site repo; commit per task; merge to `main` + push only after final verification (push = deploy).
- Frontend implementation tasks (4–7): the implementer must load the `frontend-design:frontend-design` skill before writing UI code.

---

### Task 1: copy-deck.js — all explanatory content as data

**Files:**
- Create: `copy-deck.js`
- Test: `tests/copy-deck.test.mjs`

**Interfaces:**
- Produces: UMD module `CopyDeck` with:
  - `CopyDeck.metrics` — object keyed by metric key (keys listed below)
  - Each entry: `{ label: string, unit: 'dec-pct'|'pct'|'ratio'|'usd'|'score', short: string, why: string, trap?: string, missing?: string, percentileOf?: string, ranges: Array<{max: number, tone: 'good'|'fine'|'caution'|'bad', verdict: string}> }`
  - `ranges` are ascending; a value matches the first range with `value < max`; the last range has `max: Infinity`. Verdict strings may contain `{pct}` (universe percentile, filled by interpret.js when `percentileOf` is set) and `{val}` (formatted value).
  - `CopyDeck.format(key, value)` → display string honoring `unit` (`dec-pct`: `(v*100).toFixed(1)+'%'`; `pct`: `v.toFixed(1)+'%'`; `ratio`: `v.toFixed(2)`; `usd`: abbreviated `$2.3T/$444/$8.2B`; `score`: `Math.round(v)`)
  - `CopyDeck.GENERIC_MISSING` = `` `Yahoo doesn't report this for {ticker} — treat it as a yellow flag, not a shrug.` ``
- Metric keys (all 21): `operating_margin, net_margin, roe, fcf_yield, forward_pe, trailing_pe, price_to_book, dividend_yield, debt_to_equity, current_ratio, revenue_growth, earnings_growth, momentum_6m, momentum_1y, market_cap, scores.profitability, scores.cash_flow, scores.safety, scores.quality, scores.hype, scores.overall`

- [ ] **Step 1: Write the failing schema test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/copy-deck.test.mjs`
Expected: FAIL — `Cannot find module '../copy-deck.js'`

- [ ] **Step 3: Write copy-deck.js**

UMD wrapper identical in shape to `portfolio-builder-core.js:4-11` (exports `CopyDeck`). Write **all 21 entries** using the threshold table below and the three fully-written examples as the voice benchmark. Every entry follows the blunt-coach voice rules from Global Constraints.

Three complete entries establishing the voice (copy verbatim):

```js
operating_margin: {
    label: 'Operating Margin', unit: 'dec-pct', percentileOf: 'operating_margin',
    short: 'Out of every dollar of sales, the cents left after running the business (staff, rent, machines) — before taxes and interest.',
    why: 'Thin margins mean no room for error: one bad year and the profits are gone. Fat margins mean the company has pricing power — customers pay up because they want THIS product.',
    trap: 'Comparing margins across industries. A grocer at 4% can be a great business; a software company at 4% is broken. That is why we also show the percentile against the universe.',
    ranges: [
        { max: 0,    tone: 'bad',     verdict: 'Loses money on its own operations — every sale digs the hole deeper.' },
        { max: 0.10, tone: 'caution', verdict: 'Keeps {val} of each sales dollar — thin cushion, one rough year from losses.' },
        { max: 0.25, tone: 'fine',    verdict: 'Keeps {val} of each sales dollar — a solid, ordinary business.' },
        { max: Infinity, tone: 'good', verdict: 'Keeps {val} of each sales dollar — better than {pct}% of this universe. That is pricing power.' },
    ],
},
debt_to_equity: {
    label: 'Debt vs. What Shareholders Own', unit: 'pct',
    short: 'Company debt compared to shareholder equity. 100% means it owes exactly as much as its owners have put in and retained.',
    why: 'Debt amplifies everything: gains in good times, disasters in bad times. Heavily indebted companies do not get second chances in a crisis.',
    trap: 'High-debt companies often show beautiful returns on equity — the debt IS the trick. If safety looks bad but profitability looks great, check this number first.',
    ranges: [
        { max: 50,  tone: 'good',    verdict: 'Barely leans on debt — it could pay everything off without breaking a sweat.' },
        { max: 100, tone: 'fine',    verdict: 'Borrows meaningfully but owns more than it owes. Normal for a grown-up company.' },
        { max: 200, tone: 'caution', verdict: 'Owes more than shareholders own. Fine while business is good — remember 2008 was not.' },
        { max: Infinity, tone: 'bad', verdict: 'Owes over twice what shareholders own. This company works for its lenders now.' },
    ],
},
'scores.overall': {
    label: 'Overall Score', unit: 'score',
    short: 'The final blend: 60% business quality (profits, cash, safety) + 40% hype (growth and price momentum).',
    why: 'One number to rank by — but it is a percentile among THESE 392 stocks, not a grade from the universe. A 92 beats 92% of this list, nothing more.',
    trap: 'Treating small differences as meaningful. 91 vs 89 is noise. 91 vs 60 is a real difference.',
    ranges: [
        { max: 40,  tone: 'bad',     verdict: 'Bottom half of this universe on both quality and momentum — the screener found little to like.' },
        { max: 70,  tone: 'fine',    verdict: 'Middle of the pack here — not damning, not exciting.' },
        { max: 85,  tone: 'good',    verdict: 'Beats most of this universe on the blend of quality and momentum.' },
        { max: Infinity, tone: 'good', verdict: 'Top shelf of this universe — strong business AND the market has noticed. Expect it to be expensive.' },
    ],
},
```

Threshold table for the remaining 18 entries (tones in order; write verdicts in the same voice; `→` = range boundary by `max`):

| key | unit | ranges (max → tone) | trap gist |
|---|---|---|---|
| net_margin | dec-pct | 0→bad, 0.05→caution, 0.20→fine, ∞→good (+{pct}) | one-off gains/writeoffs distort it |
| roe | dec-pct | 0→bad, 0.08→caution, 0.20→fine, ∞→good | juiced by debt — cross-check safety |
| fcf_yield | dec-pct | 0→bad («burns cash — unless it's hypergrowth doing it on purpose»), 0.02→caution, 0.06→fine, ∞→good | negative FCF fine ONLY with >30% revenue growth |
| forward_pe | ratio | 0→bad («no expected profits — you're paying for a story»), 15→caution («cheap usually has a reason — find it»), 30→fine, 60→caution («priced for success»), ∞→bad («priced for perfection — any stumble gets punished») | cheap P/E seduces people into value traps |
| trailing_pe | ratio | same shape as forward_pe, softer wording (backward-looking) | last year ≠ next year |
| price_to_book | ratio | 1→fine, 5→fine, ∞→fine (all fine tones — verdict says it's mostly noise outside banks/heavy industry) | comparing across industries |
| dividend_yield | pct | 0.001→fine («pays nothing — normal for growth companies»), 2→fine, 5→good, ∞→caution («suspiciously generous — often a falling price, not a gift») | high yield = often a value trap |
| current_ratio | ratio | 1→bad («may struggle to pay this year's bills»), 1.5→caution, 3→good, ∞→fine («hoarding cash — safe but lazy») | — |
| revenue_growth | dec-pct | 0→bad («shrinking»), 0.05→caution, 0.15→fine, 0.30→good, ∞→good («hypergrowth — expect a wild ride») | growth at any price |
| earnings_growth | dec-pct | 0→caution («profits fell — check if it's one-off or trend»), 0.10→fine, ∞→good | noisier than revenue; one-offs distort |
| momentum_6m | dec-pct | -0.2→bad, 0→caution, 0.3→fine, 0.8→good, ∞→caution («already up a lot — momentum works until it doesn't») | buying the top |
| momentum_1y | dec-pct | same shape as momentum_6m | performance-chasing |
| market_cap | usd | 2e9→caution («lottery-ticket territory for a novice»), 10e9→fine («small — sharper moves both ways»), 200e9→fine, ∞→fine («giant — stability, but slower growth»)| big ≠ safe, small ≠ opportunity |
| scores.profitability | score | 40→bad, 70→fine, ∞→good | — |
| scores.cash_flow | score | 40→bad, 70→fine, ∞→good | — |
| scores.safety | score | 40→bad, 70→fine, ∞→good | if this is low and profitability high, debt is doing the lifting |
| scores.quality | score | 40→bad, 70→fine, ∞→good | — |
| scores.hype | score | 40→fine («the market hasn't noticed — could be a reason»), 70→fine, ∞→good («the market has noticed — you're not early») | confusing hype with quality |

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/copy-deck.test.mjs`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add copy-deck.js tests/copy-deck.test.mjs
git commit -m "feat: copy deck — every metric's definitions, verdicts, traps as data"
```

---

### Task 2: interpret.js — value → verdict engine

**Files:**
- Create: `interpret.js`
- Test: `tests/interpret.test.mjs`

**Interfaces:**
- Consumes: `CopyDeck` (Task 1). In node: `require('../copy-deck.js')`; in browser both are globals.
- Produces: UMD module `Interpret` with:
  - `Interpret.getValue(stock, key)` → number|null — reads `key` from stock, supporting the `scores.` prefix as a path; returns `null` for `undefined`/`null`/non-finite.
  - `Interpret.interpret(key, stock, universe)` → `{ verdict: string, tone: string, value: number|null, display: string }`
    - missing value → `tone: 'na'`, `display: '—'`, verdict = entry's `missing` or `GENERIC_MISSING` with `{ticker}` filled.
    - else: first range with `value < max`; verdict template with `{val}` → `CopyDeck.format(key, value)` and `{pct}` → percentile of `value` among `universe`'s non-null values of `entry.percentileOf` (via `PortfolioBuilder.computePercentile`; universe = array of stocks; rounded).
  - `Interpret.verdictsForCard(stock, universe)` → array of the 3–4 `{verdict, tone, label}` card lines: always `scores.overall`; then the **most extreme** (good or bad, by distance from 'fine') of: fcf_yield/operating_margin (money-making), debt_to_equity/current_ratio (safety), revenue_growth (growth), momentum_6m (momentum). Deterministic: money, safety, growth, momentum order.

- [ ] **Step 1: Write the failing tests**

```js
// tests/interpret.test.mjs
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/interpret.test.mjs`
Expected: FAIL — `Cannot find module '../interpret.js'`

- [ ] **Step 3: Implement interpret.js**

UMD wrapper; in node `require('./copy-deck.js')` and `require('./portfolio-builder-core.js')` via the factory (mirror how a UMD module takes dependencies: `factory(require('./copy-deck.js'), require('./portfolio-builder-core.js'))` in the node branch, `factory(root.CopyDeck, root.PortfolioBuilder)` in the browser branch). Implement exactly the Interfaces block. `verdictsForCard` scoring for "most extreme": map tones to distance `{bad: 2, caution: 1, good: 1.5, fine: 0, na: 0}`, pick the higher-distance metric per domain pair, always include the domain's line (even 'fine') so cards always have 4 lines: overall + money + safety + growth-or-momentum (growth if its distance ≥ momentum's, else momentum).

- [ ] **Step 4: Run all tests**

Run: `node --test tests/`
Expected: all PASS (copy-deck 3, interpret 6, portfolio-builder 23, plus existing)

- [ ] **Step 5: Commit**

```bash
git add interpret.js tests/interpret.test.mjs
git commit -m "feat: interpretation engine — value to blunt verdict with tone"
```

---

### Task 3: Wizard shell — index.html skeleton, router, state, calm base styles

**Files:**
- Create: `wizard.js`
- Rewrite: `index.html`, `style.css` (keep `:root` palette variables and font imports from the current file; delete the rest)
- Keep loading: `copy-deck.js`, `interpret.js`, `portfolio-builder-core.js` before `wizard.js`

**Interfaces:**
- Produces (used by Tasks 4–7, all inside `wizard.js`):
  - `WizardState` — in-memory object `{ amount: null, floor: {...PortfolioBuilder.DEFAULT_FLOOR}, weights: {...PortfolioBuilder.DEFAULT_WEIGHTS}, guardrails: { count: 18, sectorCapPct: 30, maxPosPct: 10, minPosPct: 3 }, homework: {}, visited: {} }`; `saveState()` persists to localStorage `soundhype_wizard`; `loadState()` restores it and, if `soundhype_wizard` is absent but legacy `soundhype_builder` exists, migrates its floor/weights/guardrails once.
  - `appData` — `{ stocks: [], lastUpdated: '' }` filled by the same relative `fetch('portfolio_data.json')` as today (move `loadData()` logic from old `app.js:180-205`).
  - `showStep(n)` — renders step `n` (1–5) into `<main id="stepRoot">`, updates progress rail, sets `location.hash = 'step-' + n`, records `visited[n]`, calls `STEPS[n].render(root)`.
  - `STEPS` — `{1: {title, render(rootEl)}, ...5}`; Tasks 4–7 fill in render functions (Task 3 stubs them with the step title + placeholder paragraph).
  - HTML skeleton ids: `#progressRail` (5 buttons, always clickable), `#stepRoot`, `#dataStatus` (refresh date chip in header).
- Layout/style produced: content column `max-width: 52rem; margin-inline: auto; padding: 1.5rem`, `html { font-size: 18px }`, tone classes `.tone-good/.tone-fine/.tone-caution/.tone-bad/.tone-na` (color only, plus a `::before` dot), `.verdict-line` row (metric label small caps, display value bold, verdict sentence), `.info-toggle` ⓘ button + `.info-panel` (hidden until tapped; contains `short`, `why`, `trap` labeled **The trap:**) — these classes are the shared vocabulary for Tasks 4–7.

- [ ] **Step 1: Build skeleton + router + state (no test framework for DOM — verification is headless Chromium below)**

`index.html` shape (complete file, abbreviated here only for the five step stubs):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SoundHype — Guided Stock Picker</title>
  <link rel="stylesheet" href="style.css">
  <!-- keep existing Google Fonts + FontAwesome links from current index.html -->
</head>
<body>
  <header class="site-header">
    <div class="brand">Sound<span>Hype</span></div>
    <span id="dataStatus" class="data-chip"></span>
  </header>
  <nav id="progressRail" aria-label="Steps"></nav>
  <main id="stepRoot"></main>
  <script src="portfolio-builder-core.js"></script>
  <script src="copy-deck.js"></script>
  <script src="interpret.js"></script>
  <script src="wizard.js"></script>
</body>
</html>
```

`wizard.js` core (complete the obvious bodies; STEPS 1–5 stubbed as `{ title: 'The idea', render(root) { root.innerHTML = '<h1>…</h1><p>Coming in a later task.</p>'; } }`):

```js
const STEP_TITLES = ['The idea', 'The universe', 'Your floor', 'Build', 'Homework & track'];
const WizardState = loadState();
const appData = { stocks: [], lastUpdated: '' };

function loadState() { /* localStorage soundhype_wizard, else migrate soundhype_builder, else defaults */ }
function saveState() { localStorage.setItem('soundhype_wizard', JSON.stringify(WizardState)); }
function showStep(n) { /* render rail + STEPS[n].render(stepRoot); location.hash; visited; saveState() */ }

async function init() {
  try {
    const res = await fetch('portfolio_data.json');
    if (!res.ok) throw new Error();
    const data = await res.json();
    appData.stocks = data.stocks; appData.lastUpdated = data.last_updated;
  } catch {
    document.getElementById('stepRoot').innerHTML =
      '<p class="tone-bad">Could not load the stock data. If you are offline, that is why. Otherwise, tell Laurence the site is broken.</p>';
    return;
  }
  renderDataStatus(); // date + stale warning if > 7 days
  const fromHash = parseInt((location.hash.match(/step-(\d)/) || [])[1], 10);
  showStep(fromHash >= 1 && fromHash <= 5 ? fromHash : 1);
}
window.addEventListener('hashchange', () => { /* showStep from hash if changed */ });
init();
```

Also: shared render helpers used by later tasks — `el(tag, cls, html)` shortcut, `renderVerdictLine({label, display, verdict, tone, key})` → `.verdict-line` DOM with ⓘ toggle wired to an `.info-panel` filled from `CopyDeck.metrics[key]` (`short`, `why`, `trap`).

- [ ] **Step 2: Verify in headless Chromium**

```bash
python3 -m http.server 8901 & sleep 1
chromium --headless=new --disable-gpu --virtual-time-budget=6000 --dump-dom http://127.0.0.1:8901/ > /tmp/shell-dom.html
grep -c 'progressRail' /tmp/shell-dom.html   # expect ≥1
grep -o 'Refreshed[^<]*' /tmp/shell-dom.html # expect the data date
grep -o '<h1>[^<]*' /tmp/shell-dom.html      # expect "The idea" stub
kill %1
```
Also verify `#step-3` in the URL renders stub 3, and that `localStorage` state survives reload (use `--dump-dom` twice; state check is implicit via no errors — full state check happens in Task 9 E2E).

- [ ] **Step 3: Run node tests still green**

Run: `node --test tests/`  Expected: all PASS (shell must not break pure modules)

- [ ] **Step 4: Commit**

```bash
git add index.html style.css wizard.js
git commit -m "feat: wizard shell — progress rail, hash router, state, calm layout"
```

---

### Task 4: Step 1 — The idea (narrative + data honesty)

**Files:**
- Modify: `wizard.js` (replace `STEPS[1]` stub), `style.css` (narrative styles)

**Interfaces:**
- Consumes: `appData.lastUpdated`, `renderVerdictLine` NOT needed here; `showStep`.
- Produces: nothing consumed by other tasks (self-contained step).

- [ ] **Step 1: Load the frontend-design skill, then write the step**

Content requirements (write the full copy in the blunt-coach voice; ~600–900 words total, structured):
1. **What this is** — "A guided tool for building a small, aggressive stock portfolio out of 392 well-known companies — and understanding every choice you make on the way." One paragraph on the core belief: sound businesses the market is starting to notice.
2. **The two scores** — Quality (does it actually make money, generate cash, avoid drowning in debt — 60%) and Hype (is it growing and has the market noticed — 40%). Two short cards, each listing its ingredients in plain words.
3. **The one calibration that matters** — callout box: "A score of 92 does not mean 92/100. It means: beats 92% of the 392 stocks in this list. A percentile among peers — nothing more."
4. **Data honesty box** — Yahoo Finance snapshot, shows `appData.lastUpdated`, stale warning (>7 days: caution tone, "these numbers are N days old — refresh before deciding anything"), "numbers can be wrong or missing; missing data is flagged, never papered over".
5. **The disclaimer, bluntly** — homemade decision aid built by one person and an AI; not investment advice; "the biggest risk in this whole exercise is your own behavior: chasing winners, panic-selling, checking prices daily. The tool will call these out when it sees you doing them."
6. CTA button → `showStep(2)`: "Meet the 392 →".

- [ ] **Step 2: Verify in headless Chromium** (server as Task 3): dump DOM of `#step-1`, grep for "percentile", the refresh date, and the CTA text.

- [ ] **Step 3: Commit** — `git commit -am "feat: step 1 — the idea, scores explained, data honesty"`

---

### Task 5: Step 2 — Meet the universe (cards, verdicts, detail sheet)

**Files:**
- Modify: `wizard.js` (replace `STEPS[2]` stub), `style.css`

**Interfaces:**
- Consumes: `Interpret.verdictsForCard(stock, appData.stocks)`, `Interpret.interpret(key, stock, universe)`, `CopyDeck.format`, `renderVerdictLine`, `WizardState`.
- Produces: `openStockSheet(ticker)` — also used by Task 6/7 tables to open a stock's detail sheet.

- [ ] **Step 1: Load the frontend-design skill, then build the list view**

- Intro line (1 sentence): "Every stock below is scored against the other 391 — here's the whole universe, best blend first."
- Controls (one row, calm): search input (name/ticker), sector `<select>` (from data), sort `<select>` (Overall, Quality, Hype, Momentum 6m, Revenue growth — labels in plain words e.g. "Best businesses first").
- Card list (single column, paginated "Show 25 more"): each card = ticker + name + sector chip, price + 1y move, sparkline (reuse existing sparkline SVG code from old `app.js`), then `verdictsForCard` rendered as 4 `.verdict-line`s (tone dot + label + display value + sentence + ⓘ).
- Tap card (not on ⓘ) → `openStockSheet(ticker)`.

- [ ] **Step 2: Build the detail sheet**

`openStockSheet(ticker)`: full-screen overlay (`.sheet`), close button, then:
- Header: name, ticker, sector, price, market cap with its verdict line.
- Company summary (2 first sentences of `stock.summary`), CEO.
- Five groups, each a titled section with `renderVerdictLine` per metric:
  - **Does it make money?** `operating_margin, net_margin, roe`
  - **Does cash actually come in?** `fcf_yield`
  - **Can it survive trouble?** `debt_to_equity, current_ratio`
  - **Is it growing?** `revenue_growth, earnings_growth`
  - **Has the market noticed?** `momentum_6m, momentum_1y, scores.hype`
  - **What are you paying?** `forward_pe, trailing_pe, price_to_book, dividend_yield`
- Score summary strip at top: the six `scores.*` as labeled bars with verdicts on tap (ⓘ pattern).
- Add Ticker: keep the backend-probe pattern (HEAD `/api/stocks` on step 2 render; if ok, show a small "Add a missing ticker" form under the controls; POST `/api/add-ticker` as in old `app.js:632-680`).

- [ ] **Step 3: Verify in headless Chromium**: step 2 DOM has ≥20 cards, each with 4 `.verdict-line`s; no `{val}`/`{pct}`/`undefined` anywhere in DOM (grep); a sheet opened via `#` simulation is out of scope for dump-dom — verify `openStockSheet` exists and sheet markup renders by evaluating it (`--virtual-time-budget` + a `?debug-sheet=TSM` query param the step honors, removed in Task 9? No — keep it, it's harmless and useful).

Run greps:
```bash
grep -c 'verdict-line' /tmp/step2.html          # expect ≥ 80 (20 cards × 4)
grep -c '{pct}\|{val}\|undefined' /tmp/step2.html  # expect 0
```

- [ ] **Step 4: Run node tests** — all green.
- [ ] **Step 5: Commit** — `git commit -am "feat: step 2 — universe cards with verdicts + interpreted detail sheet"`

---

### Task 6: Step 3 — Set your floor

**Files:**
- Modify: `wizard.js` (replace `STEPS[3]` stub), `style.css`

**Interfaces:**
- Consumes: `PortfolioBuilder.applyQualityFloor(stocks, floor)` (returns survivors), `WizardState.floor` (same shape as `PortfolioBuilder.DEFAULT_FLOOR`), `saveState`, `openStockSheet`.
- Produces: nothing new for later tasks (Step 4 reads `WizardState.floor`).

- [ ] **Step 1: Load the frontend-design skill, then build the filter cards**

- Intro: "Before we rank anything, we throw out the junk. Each rule below removes companies with a specific disease. You can turn any of them off — but you'll be told what you're letting in."
- One full-width card per floor rule (5 rules from `DEFAULT_FLOOR`): plain-English rule title, one-sentence what-it-protects-from (reuse/adapt the existing `title=` tooltip copy from old `index.html:295-315` — it is already in the right voice), threshold control where the floor has one, toggle, and a **live kill count**: "This rule alone removes **118** of 392" (compute: universe minus survivors of *only this rule*).
- Sticky survivor bar (bottom): "**245** of 392 survive your floor" — updates on any change; caution tone if < 40 ("your floor is tighter than your portfolio — loosen something or accept fewer picks"), bad tone if < `WizardState.guardrails.count`.
- Disabling any rule swaps its card border to caution and appends the blunt warning line (e.g. FCF off: "You are now allowing companies that burn cash and aren't growing fast enough to justify it.").
- CTA: "Rank the survivors →" → `showStep(4)`.

- [ ] **Step 2: Verify in headless Chromium**: step 3 DOM shows 5 cards, kill counts are numbers (grep `removes <strong>[0-9]`), survivor bar present.
- [ ] **Step 3: Run node tests** — green. **Step 4: Commit** — `git commit -am "feat: step 3 — quality floor as explained filter cards with kill counts"`

---

### Task 7: Steps 4 & 5 — Build, then Homework & track

**Files:**
- Modify: `wizard.js` (replace `STEPS[4]` and `STEPS[5]` stubs), `style.css`

**Interfaces:**
- Consumes: `PortfolioBuilder.{computeGrowthScores, selectPortfolio, computeWeights, estimateFxCost, DEFAULT_WEIGHTS}`, `WizardState.{floor, weights, guardrails, amount, homework}`, `openStockSheet`, localStorage `soundhype_portfolio` (tracker holdings, legacy shape from old `app.js`).
- Produces: complete wizard.

- [ ] **Step 1: Load the frontend-design skill, then build Step 4 (Build)**

- **Amount input** first: "How much are you investing? $ [____] CAD" — blank by default, persisted to `WizardState.amount`; until filled, allocation shows weights only (no dollar column) — never a hardcoded default amount.
- **Weight sliders** (4, from `DEFAULT_WEIGHTS`, auto-balancing to 100% — port the balancing logic from old `app.js` builder section): each slider row includes its one-line meaning (adapt old `index.html:330-342` tooltip copy to visible microcopy) + live warning slot. Warning rules: momentum weight > 50% → caution line "That much momentum is performance-chasing with extra steps — you're betting the recent past repeats."; quality weight 0 → "Nothing anchors this to real businesses anymore."
- **Live top-10 preview**: as weights move, show the top 10 ranked survivors (ticker + name + growth score) so cause→effect is visible. Note under it: "Watch what your sliders do here."
- **Guardrails** (3 controls + count): visible microcopy per control (adapt old tooltips at `index.html:352-364`).
- **Allocation table**: rank, ticker+name (tap → `openStockSheet`), sector, weight %, CAD amount (only if amount set), and a **"why it's here"** line: top 2 drivers by contribution `weight_i × percentile_i` from `computeGrowthScores` components (e.g. "here mostly for momentum (94th pct) and revenue growth (88th)"). Sector-cap skips get a footnote listing skipped tickers: "SKIPPED: NVDA — Technology already at your 30% cap."
- FX line (from `estimateFxCost`, only when amount set): "≈ $X eaten by currency conversion on the US-listed part — one-time, only hurts if you churn."
- CTA: "Do the homework →" → `showStep(5)`.

- [ ] **Step 2: Build Step 5 (Homework & track)**

- **The gate, stated bluntly**: "You do not own a stock until you can explain it. One sheet per holding — check every box or don't buy."
- **Study sheets**: one collapsible sheet per allocation row: company summary, its 4 card verdicts, score drivers, and the 5-item checklist (port items from old app.js study sheet: what does it do in one sentence you understand; why is it in the portfolio; TipRanks cross-check done; one thing that would make you sell; you accept it can drop 40%). Checkboxes persist in `WizardState.homework[ticker]`; progress "3 of 18 sheets done".
- **Export**: CSV download (port `exportCSV` from old `app.js`) + short Wealthsimple how-to (percent weights, fractional shares) — enabled only when all sheets complete; before that, button disabled with label "Finish the homework first".
- **Tracker** ("What you actually did"): port the old My Portfolio tab logic (add holding by ticker+shares+price, list with current value/gain from `appData`, remove) reading/writing the same `soundhype_portfolio` key; intro line: "Record what you actually bought — the tool only knows what you tell it."

- [ ] **Step 3: Verify in headless Chromium**: step 4 DOM has allocation rows with "why it's here" lines and zero `undefined`/`NaN` strings; step 5 has study sheets equal to allocation count and a disabled export button by default.
- [ ] **Step 4: Run node tests** — green. **Step 5: Commit** — `git commit -am "feat: steps 4-5 — annotated build + homework gate and tracker"`

---

### Task 8: Deck completeness + retire old UI

**Files:**
- Create: `tests/deck-completeness.test.mjs`
- Delete: `app.js`
- Modify: `README.md` (usage section: wizard replaces tabs)

**Interfaces:**
- Consumes: `wizard.js` source (read as text), `CopyDeck.metrics`.

- [ ] **Step 1: Write the completeness test (fails if any rendered metric lacks a deck entry)**

```js
// tests/deck-completeness.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CopyDeck = require('../copy-deck.js');

test('every metric key referenced by wizard.js has a deck entry', () => {
  const src = readFileSync(new URL('../wizard.js', import.meta.url), 'utf8');
  // Convention: wizard code always references metrics as interpret-able keys
  // in quotes: 'operating_margin', 'scores.overall', etc.
  const candidates = src.match(/'(scores\.[a-z_]+|[a-z_]+_(margin|ratio|growth|yield|equity|cap|pe|book|6m|1y))'/g) || [];
  const keys = [...new Set(candidates.map(s => s.slice(1, -1)))];
  assert.ok(keys.length >= 15, `suspiciously few metric refs found: ${keys.length}`);
  for (const k of keys) assert.ok(CopyDeck.metrics[k], `wizard.js renders '${k}' but the deck has no entry`);
});
```

- [ ] **Step 2: Run it** — Expected: PASS (if it fails, add the missing deck entry — that's the test working).
- [ ] **Step 3: Delete `app.js`**, confirm `index.html` no longer references it, re-run headless Chromium smoke (steps 1, 2 render; console clean).
- [ ] **Step 4: Update `README.md`**: replace the three-tab description with the five-step wizard, keep dev/refresh workflow sections.
- [ ] **Step 5: Full test suite** — `node --test tests/` all green; `venv/bin/python3 -m unittest tests.test_app` (from `picker/`, using the venv) still green.
- [ ] **Step 6: Commit** — `git commit -am "feat: deck completeness guard; retire tab UI"`

---

### Task 9: End-to-end verification + deploy

**Files:** none new (verification + merge)

- [ ] **Step 1: E2E in headless Chromium** (static server, subpath analogue):
  - Serve repo root parent, open `/picker/` path analogue — all five steps render via `#step-N`; no console errors (`--enable-logging=stderr` grep); no `{val}`/`{pct}`/`undefined`/`NaN` text anywhere in any step's DOM.
  - State persistence: set a floor toggle off via `?` interaction is not dump-dom-able — instead verify `soundhype_wizard` default write happens (second load shows no first-run divergence) and rely on Task 3-7 manual checks.
  - Screenshot every step (`--screenshot`, `--window-size=1400,1000`) and **visually inspect each**: calm layout, tone colors legible, no dashboard density regressions.
- [ ] **Step 2: Mobile pass**: screenshots at `--window-size=390,844`; single column, controls usable, no horizontal scroll (`scrollWidth` check via dumped DOM is unreliable — inspect screenshots).
- [ ] **Step 3: Full suites once more**: `node --test tests/` + python unittest — green.
- [ ] **Step 4: Merge worktree branch to `main`, push** (authorized): `git checkout main && git merge ux-rehaul && git push origin main`.
- [ ] **Step 5: Wait for Pages build; verify live** at `https://mfoisy.com/picker/` in headless Chromium (same greps + screenshot). Hard-check: old three-tab markup gone from live DOM.

---

## Self-Review (done)

- **Spec coverage:** five steps (Tasks 4–7), always-visible interpretation (Tasks 1–2, used in 5–7), copy deck + engine + tests (1–2), calm redesign (3), amount-as-input privacy (7), migration + tracker reuse (3, 7), deck completeness (8), E2E + deploy (9). Voice rules encoded in Task 1 content + banned-pattern test.
- **Placeholders:** none — thresholds and copy either written verbatim or specified in the table with voice benchmarks.
- **Type consistency:** `interpret()` return `{verdict, tone, value, display}` used identically in Tasks 5–7; `WizardState` shape defined once in Task 3 and consumed by 6–7; tones enum consistent everywhere.
