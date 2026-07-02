# SoundHype Novice UX Rehaul — Design

**Date:** 2026-07-02
**Status:** Approved by user (brainstormed question-by-question)

## Purpose

The current three-tab dashboard assumes financial literacy the user doesn't have. Rebuild the UX so a finance novice understands, at every moment: what is going on, what each metric is, what it means, and how to interpret it. Learning the tool should be learning the method.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Success criterion | Layered: guided narrative for the big picture AND every number interpreted in place |
| Voice | **Blunt coach** — plain English, opinionated verdicts, behavioral-trap warnings in context |
| Language | English |
| Structure | **Full wizard rebuild** — a linear guided flow replaces the dashboard |
| Expert path | Wizard IS the app: steps always jumpable from a progress rail, state remembered |
| Explanation UX | **Interpretation always visible** — one-line verdicts next to every number + tappable ⓘ for definition/rules-of-thumb/traps. No hover-to-learn. |
| Visuals | **Calm-reading redesign** — single column, bigger type, whitespace; keep SoundHype dark identity, drop the trading-terminal density |
| Journey | **A: Decision pipeline** — steps mirror the methodology |

## The five steps

1. **The idea** — What the tool believes (sound businesses the market is starting to notice); the two-score system in plain words; the key calibration: *a score of 92 = beats 92% of the 392 stocks in this universe* (percentile among peers, not a certified grade); data honesty box (Yahoo Finance snapshot, refresh date, stale-data banner lives here); blunt disclaimer (homemade decision aid, not advice; the biggest risk is your own behavior).
2. **Meet the universe** — Ranked stock cards with 3–4 plain verdict lines with tone colors ("✓ Makes real money — top-quartile margins" / "⚠ Owes 2.3× what shareholders own") instead of raw ratios. Search / sector filter / sort kept, simplified. Tap → full sheet: metrics grouped by theme, each row `value → verdict → ⓘ` (ⓘ expands to definition, rules of thumb, the trap it invites).
3. **Set your floor** — The five junk filters as full-width cards: rule in plain English, what it protects against, live per-filter kill count ("removes 118 of 392"), persistent survivor counter. Disabling a filter triggers a blunt inline warning.
4. **Build** — Weight sliders with live top-10 preview; guardrails; allocation table where every holding gets a one-line "why it's here" (top score drivers). Config-level warnings in context (momentum > ~50% → "performance-chasing with extra steps"; sector cap hits → names the accidental bet). Investment amount is **user input, blank by default** — no personal amount in the public code. FX cost line with explanation.
5. **Homework & track** — Study-sheet gate per holding (nothing gets bought without a completed sheet), CSV export + Wealthsimple instructions, then the tracker (formerly My Portfolio): record what you actually did and watch it.

## Architecture

Same static hosting, no build step, same `portfolio_data.json` fetch. `portfolio-builder-core.js` untouched.

New/changed files:
- `copy-deck.js` — **single source of every explanatory word.** One entry per metric (~20: margins, ROE, FCF yield, debt-to-equity, current ratio, revenue/earnings growth, momentum, composite scores, dividend yield, market cap, P/E): plain definition, why it matters, threshold ranges with verdict templates + tone (good/fine/caution/bad), the behavioral trap, missing-data phrasing.
- `interpret.js` — pure function `interpret(metric, value, stock, universe) → {verdict, tone}`. Mixes absolute rules of thumb (current ratio < 1 is bad everywhere) with universe percentiles (margins judged against the other 391). Dependency-free, unit-tested.
- `wizard.js` — shell (progress rail, hash deep-links `#step-N`, step render/jump) + the five step views.
- `index.html`, `style.css` — rewritten for the calm-reading layout (~820px column, ~18px base, tone colors as the main color language, minimal charts with one-line "what to look for" captions).
- Old three-tab UI retired.

State: localStorage `soundhype_wizard` (floor config, weights, guardrails, amount, homework checkmarks, tracker); migrate the existing `soundhype_builder` config if present. Add Ticker keeps its backend-probe gating. Data-fetch failure → plain-language error.

## Voice rules (encoded in the copy deck)

- Every verdict is a sentence a smart friend would say — never a restated ratio ("owes more than it's worth", not "D/E > 100%").
- Traps named directly ("this is the number that seduces people into value traps").
- Missing data said plainly: "Yahoo doesn't report this for X — treat it as a yellow flag, not a shrug."
- No hedging filler.

## Testing

- Unit tests (node) for `interpret()`: thresholds, edges, missing data.
- **Deck-completeness test:** every metric key rendered anywhere in the UI has a copy-deck entry — no naked numbers, enforced by test.
- Existing suites unchanged and green: `portfolio-builder-core` (23 tests), strict-JSON tests.
- End-to-end in headless Chromium before shipping: each step renders, verdicts appear, state survives reload.
