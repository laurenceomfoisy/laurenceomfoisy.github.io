# SoundHype Wizard Iteration 2 — Teach-Don't-Browse + Wealthsimple-Light — Design

**Date:** 2026-07-02
**Status:** Approved by user (feedback-driven iteration on the five-step wizard)

## User feedback driving this

1. "The universe" is a long scrollable list that tells a novice nothing and doesn't help decide.
2. "Your floor" asks the user to judge metrics they can't judge yet.
3. Build and Homework work well.
4. The "What you actually did" tracker is useless — remove it.
5. Visual aesthetic should nod to Wealthsimple. No purple gradient.

## Decisions

| Question | Decision |
|---|---|
| Universe step | **Teach, don't browse** — 3 dynamic worked examples + search-only lookup; the full list is gone |
| Floor step | **Opinionated defaults** — floor applied for the user; the step is a report of what got cut and why; controls collapsed behind "Adjust the rules (you don't need to)" |
| Tracker | Removed (homework gate, study sheets, CSV export, Wealthsimple how-to all stay) |
| Theme | **Wealthsimple-style light**: warm cream page, white cards, near-black text, serif display headings, black pill CTAs, no gradients/glow |

## Step-by-step changes

**Step titles become:** 1 The idea · 2 Reading a stock · 3 The junk filter · 4 Build · 5 Homework. (Step 1's CTA re-pointed accordingly, e.g. "Learn to read one →".)

### Step 2 — Reading a stock
- Three contrasting worked examples picked **dynamically** from the data (never hardcoded tickers):
  - **The strong one:** highest `scores.overall`.
  - **The trap:** fails ≥ 2 recommended floor rules but sits in the top quartile of `scores.hype` (looks exciting, is junk). Fallback if none: highest-hype stock failing ≥ 1 rule.
  - **The mediocre one:** stock nearest the median `scores.overall` among floor survivors.
- Each example renders as its card (4 verdict lines) wrapped in a pedagogical walkthrough: numbered teaching beats ("First: does it actually make money? …") using the existing verdict lines and ⓘ deck content inline-expanded.
- Below the examples: a search box ("Curious about a specific company? Look it up") → matches open the existing full interpreted sheet (`openStockSheet` stays; Build's table taps still use it). No list, no pagination, no sector/sort controls.
- Add Ticker stays here, still backend-probe-gated, under the search box.

### Step 3 — The junk filter (report)
- The recommended floor (`DEFAULT_FLOOR`) is applied automatically; nothing to configure on the happy path.
- Report layout: headline "We removed N of M companies before ranking — here's why." Then per rule: plain-English one-liner + kill count + up to 3 highest-market-cap casualties of that rule with a one-phrase reason ("cut: GME — burns cash without the growth to excuse it").
- Collapsed `<details>` at the bottom: "Adjust the rules (you don't need to)" reveals the existing five interactive cards (machinery kept as-is, state persists). If the user's floor differs from recommended, the report shows a "you've changed the recommended rules" note + one-click "Reset to recommended".
- Survivor count still feeds Build unchanged.

### Step 5 — Homework
- Delete the tracker section (UI + wiring). Do not touch stored `soundhype_portfolio` data — the UI just no longer reads it.
- Everything else unchanged.

## New module

`teach.js` (UMD, dependency: PortfolioBuilder; node-testable like the other pure modules):
- `pickTeachingExamples(stocks, floor)` → `{strong, trap, mediocre}` (deterministic; documented fallbacks; null-safe on small universes)
- `casualtiesByRule(stocks, floor)` → `{ruleId: {killCount, casualties: [{ticker, name, market_cap, reason-key}]}}` — reuses the same single-rule isolation semantics as the existing per-rule kill counts.
Unit tests for both (edge cases: tiny universe, no trap candidates, all-pass floor).

## Visual redesign (Wealthsimple-style light)

- Page `#FAF7F2`-warm cream; cards `#FFFFFF`, radius ~14px, soft low shadow; hairline borders `#E8E4DD`.
- Text near-black `#1D1D1B`; secondary `#6E6A63`.
- Headings: serif display (Fraunces via Google Fonts, weights 500–600); body: Inter. Replace current fonts in `index.html`.
- CTAs: black pill buttons (`#1D1D1B`, white text, full radius). Links/accents restrained; **no gradients, no glow, no purple anywhere**.
- Tone colors on light, contrast-checked (≥ 4.5:1 for text): good `#1E7B3C`-ish muted green, fine `#6E6A63` gray, caution `#9A6B00`-ish amber, bad `#B3372B`-ish red. Dots keep the color language.
- Sparklines: thin, gray baseline, green only when up over the period.
- Progress rail: minimal numbered steps; active = black pill.
- Same 52rem column, 18px base, calm rhythm.

## Untouched

`copy-deck.js`, `interpret.js` (content and engine), `portfolio-builder-core.js`, Build step logic, homework/export logic, static hosting, all existing tests (they must stay green); deck-completeness guard still applies to every rendered metric.

## Testing

- `teach.js` unit tests (node) — new.
- Existing suites green: node 33 + python 3.
- E2E headless Chromium: all five steps render on light theme; step 2 shows exactly 3 worked examples + search; step 3 shows report + collapsed details; step 5 has no tracker; no template leaks; console clean; mobile 390px no horizontal scroll.
- Contrast spot-check of the four tone colors + body text on their actual backgrounds (WCAG AA, 4.5:1).
