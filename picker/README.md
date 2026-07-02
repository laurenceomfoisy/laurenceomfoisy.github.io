# SoundHype - Investment Screener

SoundHype is an interactive, premium-designed web application that helps you build an investment portfolio by merging **fundamental financial soundness** with **market momentum ("hype")**. 

This project uses objective financial data retrieved directly from Yahoo Finance and the SEC to grade and screen popular stocks.

## 🚀 Getting Started

Follow these steps to run the application locally:

### 1. Requirements & Setup
The project uses Python (for data scraping) and Node.js (for serving the dashboard). We have already configured a Python virtual environment and installed the dependencies (`yfinance`, `pandas`, `requests`).

If you ever need to reinstall dependencies:
```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### 2. Fetch/Refresh Financial Data
To run the background data collector which scrapes financial details, CIK indicators, and executive info:
```bash
./venv/bin/python3 screener.py
```
This script queries the latest financials, executive boards (such as CEOs), margins, cash flows, and growth rates, writing the results to `portfolio_data.json`.

### 3. Launch the Web Dashboard
Start the local development server:
```bash
npm run dev
```
This command spins up a web server at [http://localhost:3000](http://localhost:3000) where you can view and interact with the stock screener.

---

## 📊 Methodology: Fusing Soundness & Hype

We evaluate each stock across two major dimensions, which are normalized on a relative 0 to 100 scale:

### 1. Fundamental Quality Score (60% Weight)
This indicates the "soundness" of the business and consists of:
*   **Profitability (40%)**: Calculated using Operating Margin, Net Profit Margin, and Return on Equity (ROE) percentiles.
*   **Cash Flow (40%)**: Derived from Free Cash Flow (FCF) yield (FCF relative to market cap) and whether FCF is positive.
*   **Financial Safety (20%)**: Evaluated using the Debt-to-Equity ratio (lower is better) and Current Ratio (higher is better).

### 2. Hype & Momentum Score (40% Weight)
This indicates the growth trajectory and market excitement around the stock:
*   **Revenue Growth (30%)**: Year-over-Year revenue growth percentile.
*   **Earnings Growth (20%)**: Year-over-Year earnings growth percentile.
*   **Stock Momentum (50%)**: Derived from historical 6-month and 1-year price performance.

---

## 🔍 Frequently Asked Questions

### 1. What is the best free database for financial information about companies?
The best free database is the **official SEC EDGAR API** (`data.sec.gov`). It is the source of truth for all U.S. public filings and provides machine-readable XBRL data for free. For general market data, company metrics, and executive lists, the **Yahoo Finance API** (via the `yfinance` library) is the most popular community resource, although unofficial.

### 2. Can we get SEC reports for free?
Yes! Under the U.S. Securities and Exchange Commission (SEC) fair access policy, all reports (10-K, 10-Q, 8-K, etc.) are public domain and completely free. You can access them:
*   **Directly:** Through the SEC EDGAR API (`https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json`). You must include a descriptive `User-Agent` header (identifying your name and email) or your request will be blocked.
*   **Python Wrapper Libraries:** Libraries like `edgartools` parse raw XBRL filings into pandas DataFrames, making them clean and readable.

---

## 🌐 Deployment (mfoisy.com/picker)

This directory is served as-is by GitHub Pages at **https://mfoisy.com/picker/**. There is no build step: the frontend fetches `portfolio_data.json` with a relative path, so the same files work locally (Flask) and statically (Pages).

- **Refresh the live data:** `./venv/bin/python3 screener.py` (~10 min), then commit and push `portfolio_data.json`. Cloudflare may serve the old file for up to ~10 minutes.
- **Add Ticker** requires the local Flask backend (live Yahoo Finance scrape) — the section auto-hides on the static site and appears when running `npm run dev` locally.
- `portfolio_data.json` must stay strict JSON (no bare `NaN`/`Infinity`) — browsers' `JSON.parse` rejects it otherwise. Both writers sanitize automatically; `tests/test_app.py` guards this.
- Portfolios and builder config live in the browser's localStorage: they do **not** sync between localhost and mfoisy.com, or between devices.
