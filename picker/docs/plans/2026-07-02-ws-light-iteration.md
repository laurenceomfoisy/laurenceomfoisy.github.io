# Wizard Iteration 2 (Teach-Don't-Browse + WS-Light) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved iteration-2 spec (`../specs/2026-07-02-ws-light-iteration-design.md`): Step 2 teaches with 3 worked examples instead of listing 392 stocks, Step 3 becomes an opinionated report, the tracker is removed, and the whole UI is rethemed Wealthsimple-light.

**Architecture:** One new pure module `teach.js` (example picking + per-rule casualties, node-tested). `wizard.js` steps 2/3/5 rewritten in place; shell, Step 1, Step 4, `copy-deck.js`, `interpret.js`, `portfolio-builder-core.js` untouched except step titles/CTA. `style.css` retokened light; `index.html` swaps fonts.

**Tech Stack:** Vanilla JS/HTML/CSS, UMD modules, `node --test` (bare — `node --test tests/` is broken on this node), headless Chromium verification.

## Global Constraints

- No build step, no npm dependencies, no frameworks.
- **WS-light palette (spec values):** page `#FAF7F2`; cards `#FFFFFF` radius ~14px soft shadow; hairline `#E8E4DD`; text `#1D1D1B`; secondary `#6E6A63`; CTAs = black pill (`#1D1D1B`, white text, full radius); tones on light: good `#1E7B3C`, fine `#6E6A63`, caution `#9A6B00`, bad `#B3372B`. **No gradients, no glow, no purple anywhere** (grep-enforced in Task 2).
- Fonts: headings **Fraunces** (500–600), body **Inter** — replace the Outfit/Plus Jakarta Sans Google-Fonts link in `index.html:9`.
- Blunt-coach voice for all new copy; tones enum `good|fine|caution|bad|na`; every rendered metric keeps a copy-deck entry (guard test exists).
- Step titles become: `['The idea', 'Reading a stock', 'The junk filter', 'Build', 'Homework']` (`wizard.js:7` STEP_TITLES).
- Existing suites must stay green throughout: node 33 (+ new teach tests) and `venv` python 3 (`/home/ral/Projects/laurenceomfoisy.github.io/picker/venv/bin/python3 -m unittest tests.test_app` run from the worktree's picker/).
- Work in the `ws-light` worktree: `/home/ral/Projects/laurenceomfoisy.github.io/.claude/worktrees/ws-light/picker`; commit per task.
- UI tasks (2–5): implementer loads `frontend-design:frontend-design` skill before UI code.
- Existing identifiers to reuse (do not rename): `FLOOR_RULES` (`wizard.js:700`, entries `{id: 'fcf'|'current'|'debt'|'rev'|'mcap', field, ...}`), `floorAllDisabledConfig()` (`wizard.js:753`), `floorRuleKillCount(rule, universe)` (`wizard.js:783`), `PortfolioBuilder.DEFAULT_FLOOR` (`portfolio-builder-core.js:20-26`), `applyQualityFloor`, `openStockSheet(ticker)`, `renderVerdictLine`, `el()`, `esc()`, `Interpret.verdictsForCard`, `WizardState`, `saveState()`, `showStep(n)`.

---

### Task 1: teach.js — example picking + per-rule casualties (TDD)

**Files:**
- Create: `teach.js`
- Test: `tests/teach.test.mjs`

**Interfaces:**
- Consumes: `PortfolioBuilder.applyQualityFloor(stocks, floorConfig)`, `PortfolioBuilder.DEFAULT_FLOOR`. UMD with dependency, same pattern as interpret.js: node branch `module.exports = factory(require('./portfolio-builder-core.js'))`, browser `root.Teach = factory(root.PortfolioBuilder)`.
- Produces (Tasks 3–4 consume):
  - `Teach.RULE_FIELDS` — `{fcf: 'hypergrowthRevenueGrowth', current: 'minCurrentRatio', debt: 'maxDebtToEquity', rev: 'minRevenueGrowth', mcap: 'minMarketCap'}` (must match wizard.js FLOOR_RULES ids/fields).
  - `Teach.disabledConfig()` — floor config with every rule disabled (sentinels: `hypergrowthRevenueGrowth/minCurrentRatio/minRevenueGrowth: -Number.MAX_VALUE`, `maxDebtToEquity: Number.MAX_VALUE`, `minMarketCap: 0`).
  - `Teach.singleRuleConfig(ruleId, floor)` — disabledConfig with only that rule's field taken from `floor`.
  - `Teach.rulesFailed(stock, floor)` — array of ruleIds the stock fails (a stock fails rule R iff it passes `applyQualityFloor` under `disabledConfig()` but not under `singleRuleConfig(R, floor)`; note: stocks missing KEY_METRICS fail even the all-disabled floor — treat those as failing nothing here, they're data-poor, not diseased; document this).
  - `Teach.pickTeachingExamples(stocks, floor)` → `{strong, trap, mediocre}` (stock objects or null):
    - strong: highest `scores.overall`.
    - trap: among stocks with `scores.hype` in the top quartile of the universe, the one failing the MOST rules (≥2 required; tie-break: higher hype). Fallback: top-quartile-hype stock failing exactly 1 rule; else null.
    - mediocre: among `applyQualityFloor(stocks, floor)` survivors, the stock whose `scores.overall` is nearest the survivors' median (tie-break: lower ticker alphabetically for determinism). Must not equal `strong`; if it does, take next-nearest.
  - `Teach.casualtiesByRule(stocks, floor)` → `{fcf: {killCount, casualties: [stock, ...max 3, sorted by market_cap desc]}, current: {...}, debt: {...}, rev: {...}, mcap: {...}}` — killCount = stocks removed by ONLY that rule active (same semantics as wizard.js floorRuleKillCount); casualties = the 3 largest-market_cap stocks that fail that rule (by `rulesFailed` containing it).

- [ ] **Step 1: Write the failing tests**

```js
// tests/teach.test.mjs
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
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/teach.test.mjs` → FAIL `Cannot find module '../teach.js'`
- [ ] **Step 3: Implement teach.js** per the Interfaces block (UMD, pure functions, no DOM). Median: sort survivor overalls, take middle (even length: lower-middle). Top quartile of hype: `scores.hype >= 75th percentile value` computed by sorting.
- [ ] **Step 4: All green** — `node --test` → 33 + 4 = 37 pass.
- [ ] **Step 5: Commit** — `git add teach.js tests/teach.test.mjs && git commit -m "feat: teach module — worked-example picking and floor casualties"`

---

### Task 2: Wealthsimple-light retheme

**Files:**
- Modify: `index.html:7-9` (fonts), `style.css` (tokens + component colors throughout)

**Interfaces:** none new — every CSS class keeps its name; only values change. Load `teach.js` in index.html now (before wizard.js): `<script src="teach.js"></script>` after interpret.js.

- [ ] **Step 1: Load frontend-design skill. Swap fonts** in index.html to `family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600` and add the teach.js script tag.
- [ ] **Step 2: Retoken style.css**: replace the `:root` block values with the spec palette (Global Constraints above); headings `font-family: 'Fraunces', Georgia, serif`; body `'Inter', system-ui, sans-serif`; all buttons/CTAs → black pill (background `#1D1D1B`, color `#fff`, `border-radius: 999px`); progress rail active step = black pill; cards white with `box-shadow: 0 1px 3px rgba(29,29,27,.06), 0 4px 16px rgba(29,29,27,.05)`; sparkline stroke → `#9BA69C` default / `#1E7B3C` when trending up (wizard.js has the sparkline color constant — find and update it); update `.tone-*` classes to the four light-mode colors. Delete every gradient/glow rule.
- [ ] **Step 3: Grep-enforce the ban**: `grep -inE "gradient|glow|purple|#7c3aed|#8b5cf6|#a78bfa" style.css index.html wizard.js` → only hits allowed are in comments; fix any live ones. (The old purple tokens may appear under other hexes — visually confirm via screenshot instead of trusting grep alone.)
- [ ] **Step 4: Contrast check** (node one-liner comparing relative luminance): all four tone colors + `#1D1D1B` and `#6E6A63` against `#FFFFFF` and `#FAF7F2` ≥ 4.5:1. Adjust darker if any fails.
- [ ] **Step 5: Verify**: serve 8913, headless screenshots desktop (1400×1000) + mobile (390×844) of steps 1 and 4 — visually confirm cream page/white cards/black CTA/serif headings, no purple, no horizontal scroll; console clean; `node --test` 37/37.
- [ ] **Step 6: Commit** — `git commit -am "feat: Wealthsimple-light retheme — cream page, serif display, black pill CTAs"`

---

### Task 3: Step 2 rewrite — Reading a stock

**Files:**
- Modify: `wizard.js` (STEP_TITLES[1] → 'Reading a stock'; replace `renderUniverseStep` content; Step 1 CTA text → `Learn to read one →`), `style.css` (walkthrough styles)

**Interfaces:**
- Consumes: `Teach.pickTeachingExamples(appData.stocks, PortfolioBuilder.DEFAULT_FLOOR)`, `Teach.rulesFailed`, `Interpret.verdictsForCard`, `renderVerdictLine`, `openStockSheet`, `esc()`, add-ticker wiring (keep existing `wireAddTickerForm` + HEAD probe).
- Produces: nothing new consumed elsewhere; `openStockSheet` must remain top-level and unchanged.

- [ ] **Step 1: Load frontend-design skill; rewrite the step.** Structure:
  1. Intro (2 sentences, blunt): you don't need to read 392 stocks — the tool filters and ranks them; you need to be able to read ONE. Here are three that teach the whole skill.
  2. Three example blocks (`strong`, `trap`, `mediocre` — skip any that's null), each: an eyebrow label ("THE STRONG ONE" / "THE TRAP" / "THE MIDDLE OF THE PACK") + one-line thesis written from data (strong: "Everything below is what 'good' looks like — notice all four lines agree."; trap: "Hype score {hype}, and it still fails {n} junk-filter rules: {plain rule names}. Exciting price chart, sick balance sheet — this is the stock that hurts people."; mediocre: "Nothing wrong, nothing special — the market is full of these. Learning to shrug at them is the skill.") + the stock's card (same card renderer pattern as before: ticker/name/sector/price/1y/sparkline + 4 verdict lines with ⓘ) + "open the full sheet →" link → `openStockSheet(ticker)`.
  3. Numbered "how to read any card" recap (4 items, one per verdict domain: overall = class rank; money line; safety line; growth/momentum line — each one sentence).
  4. Search block: heading "Curious about a specific company?", input (name/ticker); as-you-type matches (max 8) as simple rows (ticker + name), click → `openStockSheet`. No list otherwise, no sector/sort controls, no pagination.
  5. Add Ticker form (existing gating) beneath search.
  6. CTA "See what we filtered out →" → `showStep(3)`.
- [ ] **Step 2: Delete now-dead code**: the old card-list/pagination/sector/sort machinery (`refreshList`, `universeQuery/Sector/Sort/Visible` etc.) EXCEPT anything `openStockSheet` or other steps still use — verify with grep before deleting each symbol.
- [ ] **Step 3: Verify**: serve 8914, dump `#step-2`: exactly 3 (or 2 if no trap in real data — check and report which) example blocks; search renders matches for "taiwan" (grep DOM after ?debug param not needed — evaluate by dumping with a prefilled query is hard headless; instead verify the search input exists and wire logic via code read + rely on sheet debug param); `?debug-sheet=TSM#step-2` still opens the sheet; no `undefined`/`NaN`; console clean; `node --test` 37/37; python 3/3.
- [ ] **Step 4: Commit** — `git commit -am "feat: step 2 — teach with three worked examples, search-only lookup"`

---

### Task 4: Step 3 rewrite — The junk filter report

**Files:**
- Modify: `wizard.js` (STEP_TITLES[2] → 'The junk filter'; rework `renderFloorStep`), `style.css` (report styles)

**Interfaces:**
- Consumes: `Teach.casualtiesByRule(appData.stocks, WizardState.floor)`, existing `FLOOR_RULES` (titles/protects copy), `applyQualityFloor`, `WizardState.floor`/`floorSaved`/`saveState`, the existing five-card interactive UI (keep as a function, e.g. extract current card-building into `renderFloorControls(container)`), `esc()` for stock names.
- Produces: `isFloorRecommended()` — true iff `WizardState.floor` deep-equals `PortfolioBuilder.DEFAULT_FLOOR` (field-by-field ===).

- [ ] **Step 1: Load frontend-design skill; rework the step.** Structure:
  1. Headline: "We removed {cut} of {total} companies before ranking." Subline: "Every one of them has at least one disease from the list below. You didn't have to decide anything — these are the recommended rules. ({survivors} survive.)"
  2. Per rule (5 rows): rule plain title + one-line protects-from (reuse FLOOR_RULES copy) + kill count + up to 3 casualties as "cut: {TICKER} — {one-phrase reason}" where the reason is rule-specific fixed copy (fcf: "burns cash without the growth to excuse it"; current: "can't cover this year's bills"; debt: "owes more than twice what shareholders own"; rev: "sales are shrinking"; mcap: "too small to be anything but a lottery ticket"). Casualty tickers are tappable → `openStockSheet`.
  3. If NOT `isFloorRecommended()`: a caution callout "You've changed the recommended rules — the numbers above reflect YOUR floor." + black pill "Reset to recommended" (sets `WizardState.floor = {...DEFAULT_FLOOR}`, clears `floorSaved`, saveState, re-render).
  4. Collapsed `<details class="floor-adjust">` with `<summary>Adjust the rules (you don't need to)</summary>` containing the existing five interactive cards via `renderFloorControls` — all current behavior (toggles, sliders, per-rule kill lines, floorSaved stash) preserved inside; changes re-render the report numbers live.
  5. Sticky survivor bar: keep, same thresholds/copy.
  6. CTA unchanged: "Rank the survivors →" → `showStep(4)`.
- [ ] **Step 2: Verify**: serve 8915, dump `#step-3`: headline with real numbers; 5 rule rows each with ≥1 casualty ticker (report actual counts); `<details>` present and closed by default; no `undefined`/`NaN`; console clean; suites green (37 node + 3 python).
- [ ] **Step 3: Commit** — `git commit -am "feat: step 3 — junk filter as opinionated report, controls collapsed"`

---

### Task 5: Step 5 tracker removal + titles + copy touch-ups

**Files:**
- Modify: `wizard.js` (STEP_TITLES → final five names incl. [4] 'Homework'; delete tracker section from `renderHomeworkStep`/step-5 code + `wireTracker`/`loadPortfolio`/`savePortfolio` if unused elsewhere), `style.css` (drop tracker-only styles), `README.md` (step names + remove tracker mention)

**Interfaces:** consumes nothing new. `soundhype_portfolio` localStorage data must NOT be deleted or written — the code simply stops referencing it.

- [ ] **Step 1: Delete the tracker UI + wiring** (grep `soundhype_portfolio`, `tracker` in wizard.js/style.css; remove; confirm no other consumer). Keep homework gate/sheets/export/Wealthsimple how-to byte-identical.
- [ ] **Step 2: Final STEP_TITLES**: `['The idea', 'Reading a stock', 'The junk filter', 'Build', 'Homework']`; check Step 1 and Step 4 CTA texts still make sense with new names ("Learn to read one →" done in Task 3; Step 4's "Do the homework →" is fine).
- [ ] **Step 3: README**: update the How to Use It step list; delete tracker sentence.
- [ ] **Step 4: Verify**: dump `#step-5`: no tracker markup (`grep -c tracker` = 0 modulo CSS leftovers — should be 0 in DOM), sheets + export present; all 5 rail titles correct in DOM; suites green.
- [ ] **Step 5: Commit** — `git commit -am "feat: step 5 — homework only; retitle steps; drop tracker"`

---

### Task 6: E2E + final review + deploy (controller-run)

- [ ] All five steps dumped at root + subpath analogue: titles right, no leaks, console clean.
- [ ] Screenshots desktop + mobile of every step, visually inspected against WS-light spec (cream, white cards, serif, black pills, no purple; mobile no horizontal scroll).
- [ ] Suites: node 37/37, python 3/3; deck-completeness still green.
- [ ] Whole-branch review (most capable model) with accumulated minors; one fix wave if needed.
- [ ] Fast-forward merge `ws-light` → main, push, wait for Pages build, verify live at mfoisy.com/picker (DOM + screenshot).

---

## Self-Review (done)

- **Spec coverage:** teach module (T1), retheme incl. fonts/CTAs/tones/contrast (T2), step 2 teach+search (T3), step 3 report+collapsed controls+reset (T4), tracker removal+titles (T5), E2E/deploy (T6). Spec's "untouched" list respected — no task edits copy-deck/interpret/core/Build logic.
- **Placeholders:** none; all copy and thresholds specified inline.
- **Type consistency:** `Teach.*` signatures identical in T1 (producer) and T3/T4 (consumers); `renderFloorControls`/`isFloorRecommended` defined in T4 where used; STEP_TITLES final array identical in T3 (index 1) and T5 (full array).
