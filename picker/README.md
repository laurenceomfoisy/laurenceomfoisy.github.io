# SoundHype - Investment Screener

SoundHype is an interactive, premium-designed web application that helps you build an investment portfolio by merging **fundamental financial soundness** with **market momentum ("hype")**.

This project uses objective financial data retrieved from Yahoo Finance to grade and screen ~400 stocks mirroring the XEQT universe (US, Canada, developed international, emerging markets). Every explanation in the app is hand-written (`copy-deck.js`) or deterministically computed from the data (`interpret.js`) — no LLM-generated text anywhere, so the daily automated data refresh never needs a copy pass.

## 🧭 The app

The app opens on a **dashboard** and has three sections, switchable from the header:

1. **Dashboard** (default, `#dashboard`) — every tracked stock in one ranked, sortable, searchable table. Column ⓘ toggles explain each metric; clicking a row opens the full stock sheet with plain-English verdicts. Stocks deep-link as `#stock-TICKER`.
2. **Simulations** (`#simulate`) — "what would have happened" tools over 3 years of weekly prices (`prices.json`, fetched lazily):
   - **Lump sum**: one stock, one amount, one date → value today, with the honest "order filled at the weekly close of …" note.
   - **Portfolio backtest**: buy the portfolio you built in the tutorial (or a hand-picked equal-weight basket) at a past date, with a per-holding breakdown and a mandatory hindsight-bias warning.
   - **Benchmarks**: overlay the S&P 500 and/or XEQT.TO on any simulation.
   - Results display in CAD by default (week-matched FX), toggleable to USD.
3. **Learn the method** (`#step-1` … `#step-5`) — the original five-step guided tutorial: The idea → Reading a stock → The junk filter → Build → Homework. Choices persist in localStorage and the Build step's allocation feeds the backtest.

## 🚀 Getting started locally

Python (data scraping) + Node (tests). Setup:

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

- **Refresh data**: `./venv/bin/python3 screener.py` (~10-15 min) writes `portfolio_data.json` (snapshot + scores) and `prices.json` (weekly price grid).
- **Validate data**: `./venv/bin/python3 validate_data.py` — the same gate CI uses.
- **Serve the app**: `npm run dev` → http://localhost:3000 (Flask, also enables the local-only Add Ticker flow), or any static server.
- **Tests**: `npm test` (pure-logic modules: portfolio builder, interpret, teach, sim-core, copy deck) and `./venv/bin/python3 tests/test_app.py` (strict-JSON guard).

## 🤖 Daily data refresh

`.github/workflows/update-data.yml` (repo root) runs the screener every weekday at 22:30 UTC (after the US close), then commits `portfolio_data.json` + `prices.json` **only if** `validate_data.py` and the data tests pass. A failed or rate-limited scrape keeps the last good snapshot live. It can also be triggered manually from the Actions tab (`workflow_dispatch`).

## 📊 Methodology: fusing soundness & hype

We evaluate each stock across two major dimensions, normalized on a relative 0-100 percentile scale (a score is a class rank, not a grade):

### 1. Fundamental Quality Score (60% weight)
*   **Profitability (40%)**: Operating Margin, Net Profit Margin, and Return on Equity percentiles.
*   **Cash Flow (40%)**: Free Cash Flow yield (FCF relative to market cap) and whether FCF is positive.
*   **Financial Safety (20%)**: Debt-to-Equity (lower is better) and Current Ratio (higher is better).

### 2. Hype & Momentum Score (40% weight)
*   **Revenue Growth (30%)** and **Earnings Growth (20%)**: Year-over-Year percentiles.
*   **Stock Momentum (50%)**: 6-month and 1-year price performance (computed from weekly closes).

## 🎲 Simulation honesty rules

- Prices are **weekly closes**, split- and dividend-adjusted (total-return approximation; old prices won't match nominal prices you remember).
- A buy "fills" at the first weekly close **on or after** the chosen date; stocks with no data then are dropped and their weight is spread over the rest — always disclosed, never silent.
- The backtest of "the portfolio you built" picks stocks with **today's** numbers, then pretend-buys them in the past. The UI says so every time — hindsight bias is disclosed, not hidden.
- Math runs in USD; CAD display converts week-by-week at that week's actual rate, so currency drift is part of the result.

## 🌐 Deployment (mfoisy.com/picker)

This directory is served as-is by GitHub Pages at **https://mfoisy.com/picker/**. There is no build step: the frontend fetches `portfolio_data.json` (and, on the Simulations page, `prices.json`) with relative paths, so the same files work locally (Flask) and statically (Pages).

- Data refresh is automated (see above); a manual `./venv/bin/python3 screener.py` + commit still works. Cloudflare may serve the old file for up to ~10 minutes.
- **Add Ticker** requires the local Flask backend (live Yahoo Finance scrape) — the section auto-hides on the static site.
- Both JSON files must stay strict JSON (no bare `NaN`/`Infinity`) — browsers' `JSON.parse` rejects it otherwise. The writers sanitize automatically; `tests/test_app.py` and `validate_data.py` guard this.
- Tutorial/build state lives in the browser's localStorage: it does **not** sync between localhost and mfoisy.com, or between devices.

## 🗂 Module map

| File | Role |
|---|---|
| `shell.js` | App shell: data fetch, hash router, header nav |
| `dashboard.js` | Ranked/sortable/searchable universe table |
| `simulate.js` | Simulations UI (charts, forms, CAD/USD display) |
| `sim-core.js` | Pure backtest math (node-tested) |
| `wizard.js` | Five-step tutorial + shared render helpers |
| `portfolio-builder-core.js` | Pure floor/rank/allocation pipeline (node-tested) |
| `interpret.js` | Value → blunt verdict engine (node-tested) |
| `copy-deck.js` | Every explanatory word, as data (node-tested) |
| `teach.js` | Worked-example picking for Step 2/3 (node-tested) |
| `screener.py` | Yahoo Finance scraper → `portfolio_data.json` + `prices.json` |
| `validate_data.py` | Strict data gate used by CI before committing |
