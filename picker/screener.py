import yfinance as yf
import pandas as pd
import numpy as np
import json
import math
import os
import sys
import time
import io


def sanitize_for_json(obj):
    """Replace non-finite floats (NaN/Infinity) with None, recursively.

    Python's json module happily writes bare NaN/Infinity tokens, but
    browsers' JSON.parse rejects them — and portfolio_data.json is served
    directly to browsers when statically hosted.
    """
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj

# Curated list of 91 global stocks representing the core holdings of XEQT
# It includes the top holdings from:
# - ITOT (US Total Market - ~45%)
# - XIC (Canadian Capped Composite - ~25%)
# - XEF (Developed ex-US MSCI EAFE - ~25%)
# - XEC (Emerging Markets - ~5%)
TICKERS = [
    # --- US CORE HOLDINGS (ITOT) ---
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "BRK-B", "LLY", "AVGO", "TSLA",
    "JPM", "UNH", "V", "XOM", "MA", "HD", "PG", "COST", "JNJ", "ABBV",
    "MRK", "NFLX", "CRM", "AMD", "ADBE", "WMT", "CVX", "PEP", "KO", "BAC",
    "TMO", "QCOM", "ORCL", "WFC", "DIS", "ACN",
    
    # --- CANADIAN CORE HOLDINGS (XIC) ---
    "RY.TO", "TD.TO", "SHOP.TO", "CP.TO", "CNQ.TO", "CNR.TO", "ENB.TO", "BMO.TO", 
    "BAM.TO", "TRI.TO", "TRP.TO", "ABX.TO", "CVE.TO", "SLF.TO", "MFC.TO", "SU.TO", 
    "ATD.TO", "MG.TO", "FM.TO", "TECK-B.TO",
    
    # --- DEVELOPED INTERNATIONAL ADR HOLDINGS (XEF) ---
    "NVO", "ASML", "SAP", "AZN", "SHEL", "TM", "NSRGY", "LVMUY", "RHHBY", "HSBC",
    "BP", "NVS", "BTI", "SNY", "UL", "DEO", "SONY", "HMC", "RYAAY", "BUD",
    
    # --- EMERGING MARKETS ADR HOLDINGS (XEC) ---
    "TSM", "BABA", "PDD", "TCEHY", "HDB", "INFY", "VALE", "BIDU", "JD", "MELI",
    "SE", "NU", "GEL", "BBD"
]

# Ensure we remove duplicates while keeping order
TICKERS = list(dict.fromkeys(TICKERS))

def get_xeqt_500_tickers():
    print("Dynamically compiling XEQT 500 list from Wikipedia...")
    tickers = []
    
    # Wikipedia pages carry several tables (infoboxes, sector weights,
    # navboxes) and their order shifts — never trust an index. Find the
    # constituents table by its Symbol column.
    def constituents_table(url):
        html = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}).text
        tables = pd.read_html(io.StringIO(html))
        return next(t for t in tables if 'Symbol' in t.columns and len(t) >= 50)

    # 1. Fetch S&P 500 (US - ~45% allocation)
    try:
        df_sp500 = constituents_table("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")
        # Keep top 300 US stocks to represent the core of S&P 500
        sp500_tickers = df_sp500['Symbol'].tolist()
        sp500_tickers = [str(t).replace('.', '-') for t in sp500_tickers]
        tickers.extend(sp500_tickers[:300])
        print(f"Added {len(sp500_tickers[:300])} S&P 500 tickers.")
    except Exception as e:
        print(f"Error fetching S&P 500: {e}")
        tickers.extend(TICKERS[:36])  # fallback

    # 2. Fetch TSX 60 (Canada - ~25% allocation)
    try:
        df_tsx60 = constituents_table("https://en.wikipedia.org/wiki/S%26P/TSX_60")
        # Yahoo writes dual-class dots as dashes: CTC.A -> CTC-A.TO.
        # dropna: the table can carry a blank row that str()s into "nan".
        tsx_tickers = [f"{str(t).replace('.', '-')}.TO" for t in df_tsx60['Symbol'].dropna().tolist()]
        tickers.extend(tsx_tickers)
        print(f"Added {len(tsx_tickers)} TSX 60 tickers.")
    except Exception as e:
        print(f"Error fetching TSX 60: {e}")
        tickers.extend([t for t in TICKERS if t.endswith('.TO')]) # fallback
        
    # 3. Add Developed International top ADRs (XEF - ~25% allocation)
    developed_adrs = [
        "NVO", "ASML", "SAP", "AZN", "SHEL", "TM", "NSRGY", "LVMUY", "RHHBY", "HSBC",
        "BP", "NVS", "BTI", "SNY", "UL", "DEO", "SONY", "HMC", "RYAAY", "BUD",
        "RELX", "SAN", "DTEGY", "BMWYY", "MBGYY", "RWE", "BASFY", "BAYRY", "ALV",
        "ING", "UBS", "DB", "CRH", "AON", "NXPI", "STM", "ERIC", "NOK", "PHG", 
        "GSK", "VOD", "RIO", "BHP", "AAL", "GLNCY"
    ]
    tickers.extend(developed_adrs)
    print(f"Added {len(developed_adrs)} Developed International ADR tickers.")
    
    # 4. Add Emerging Markets top ADRs (XEC - ~5% allocation)
    emerging_adrs = [
        "TSM", "BABA", "PDD", "TCEHY", "HDB", "INFY", "VALE", "BIDU", "JD", "MELI",
        "SE", "NU", "GEL", "BBD", "PBR", "IBN", "WIT", "GFI", "AU", "FMX", 
        "AMX", "KB", "SHG", "UMC", "ASX", "NTES", "TAL", "EDU", "VNET"
    ]
    tickers.extend(emerging_adrs)
    print(f"Added {len(emerging_adrs)} Emerging Market ADR tickers.")
    
    unique_tickers = list(dict.fromkeys(tickers))
    print(f"Total compiled XEQT 500 tickers: {len(unique_tickers)}")
    return unique_tickers

import requests

# Fetch currency exchange rate for CAD to USD dynamically
try:
    print("Fetching USD currency exchange rates...")
    CAD_USD = float(yf.Ticker("CADUSD=X").history(period="1d")['Close'].iloc[-1])
except Exception as e:
    print(f"Error fetching CADUSD rate, using fallback: {e}")
    CAD_USD = 0.73  # Fallback exchange rate

# Weekly historical FX series, one fetch per currency. Price *series* must be
# converted week-by-week at that week's rate — applying today's rate to a
# 2023 close would fabricate returns. Current-snapshot dollar figures
# (market cap, FCF) correctly keep using today's rate above.
_FX_WEEKLY_CACHE = {}

def get_fx_weekly(currency):
    """{currency}->USD weekly Close series over 3y, or None on failure."""
    if currency == "USD" or not currency:
        return None
    if currency in _FX_WEEKLY_CACHE:
        return _FX_WEEKLY_CACHE[currency]
    series = None
    try:
        fx = yf.Ticker(f"{currency}USD=X").history(period="3y", interval="1wk")['Close']
        if not fx.empty:
            fx.index = fx.index.tz_localize(None).normalize()
            series = fx
    except Exception as e:
        print(f"Warning: no weekly FX history for {currency} ({e}); "
              f"falling back to today's rate for its price series.")
    _FX_WEEKLY_CACHE[currency] = series
    return series

def extract_historical_metrics(ticker, fx_rate):
    try:
        financials = ticker.financials
        balance_sheet = ticker.balance_sheet
        cashflow = ticker.cashflow
        
        # Get columns (dates)
        cols = list(financials.columns) if not financials.empty else []
        if not cols:
            return []
            
        # Limit to last 3 years
        cols = cols[:3]
        
        history = []
        for col in cols:
            col_str = str(col)[:4] # e.g. "2025"
            
            def get_val(df, row_names):
                if df is None or df.empty:
                    return None
                for row_name in row_names:
                    # check case-insensitive match in df index
                    matches = [idx for idx in df.index if str(idx).lower() == row_name.lower()]
                    if matches:
                        val = df.loc[matches[0], col]
                        if isinstance(val, pd.Series):
                            val = val.iloc[0]
                        try:
                            return float(val) if not pd.isna(val) else None
                        except:
                            pass
                return None

            revenue = get_val(financials, ["Total Revenue", "Revenue"])
            gross_profit = get_val(financials, ["Gross Profit"])
            net_income = get_val(financials, ["Net Income", "Net Income Common Stockholders"])
            operating_income = get_val(financials, ["Operating Income"])
            
            total_assets = get_val(balance_sheet, ["Total Assets"])
            total_liabilities = get_val(balance_sheet, ["Total Liabilities Net Minor Interest", "Total Liabilities"])
            total_debt = get_val(balance_sheet, ["Total Debt", "Total Long Term Debt"])
            
            operating_cash_flow = get_val(cashflow, ["Operating Cash Flow", "Cash Flow From Operating Activities"])
            capex = get_val(cashflow, ["Capital Expenditure"])
            free_cash_flow = get_val(cashflow, ["Free Cash Flow"])
            
            # Apply currency conversion to absolute figures
            if revenue is not None: revenue *= fx_rate
            if gross_profit is not None: gross_profit *= fx_rate
            if net_income is not None: net_income *= fx_rate
            if operating_income is not None: operating_income *= fx_rate
            if total_assets is not None: total_assets *= fx_rate
            if total_liabilities is not None: total_liabilities *= fx_rate
            if total_debt is not None: total_debt *= fx_rate
            if operating_cash_flow is not None: operating_cash_flow *= fx_rate
            if capex is not None: capex *= fx_rate
            if free_cash_flow is not None: free_cash_flow *= fx_rate

            history.append({
                "year": col_str,
                "revenue": revenue,
                "gross_profit": gross_profit,
                "operating_income": operating_income,
                "net_income": net_income,
                "total_assets": total_assets,
                "total_liabilities": total_liabilities,
                "total_debt": total_debt,
                "operating_cash_flow": operating_cash_flow,
                "capex": capex,
                "free_cash_flow": free_cash_flow
            })
            
        return history
    except Exception as e:
        print(f"Error extracting history: {e}")
        return []

def get_stock_data(ticker_symbol):
    print(f"Fetching data for {ticker_symbol}...")
    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info
        
        # Helper to get float or None
        def get_float(key):
            val = info.get(key)
            if val is None:
                return None
            try:
                return float(val)
            except ValueError:
                return None

        # Determine currency conversions to normalize to USD
        currency = info.get("currency", "USD")
        fx_rate = 1.0
        if currency == "CAD":
            fx_rate = CAD_USD
        elif currency != "USD" and currency is not None:
            try:
                # Fetch dynamically from Yahoo Finance
                fx_rate = float(yf.Ticker(f"{currency}USD=X").history(period="1d")['Close'].iloc[-1])
            except:
                fx_rate = 1.0  # Fallback

        # 3 years of weekly closes in ONE request: powers momentum, the
        # sparkline, and the prices.json backtest grid.
        hist = ticker.history(period="3y", interval="1wk")
        momentum_3m = None
        momentum_6m = None
        momentum_1y = None
        current_price = get_float("currentPrice") or get_float("regularMarketPrice")

        sparkline_prices = []
        weekly_closes = None
        if not hist.empty:
            close_prices = hist['Close']
            weekly_closes = close_prices.copy()
            weekly_closes.index = weekly_closes.index.tz_localize(None).normalize()
            current_close = close_prices.iloc[-1]
            if current_price is None:
                current_price = float(current_close)

            # Sparkline stays a 1-year window: last 52 weekly closes in USD,
            # downsampled to the same 15 points as before.
            close_prices_usd = close_prices.iloc[-52:] * fx_rate
            n = len(close_prices_usd)
            if n > 0:
                indices = np.linspace(0, n - 1, min(15, n), dtype=int)
                sparkline_prices = [float(close_prices_usd.iloc[i]) for i in indices]

            # Weekly bars: 13 weeks back for 3m, 26 for 6m, 52 for 1y.
            n_weeks = len(close_prices)

            if n_weeks >= 14:
                price_3m = close_prices.iloc[-14]
                momentum_3m = float((current_close - price_3m) / price_3m)
            if n_weeks >= 27:
                price_6m = close_prices.iloc[-27]
                momentum_6m = float((current_close - price_6m) / price_6m)
            if n_weeks >= 53:
                price_1y = close_prices.iloc[-53]
                momentum_1y = float((current_close - price_1y) / price_1y)
            elif n_weeks > 0:
                price_1y = close_prices.iloc[0]
                momentum_1y = float((current_close - price_1y) / price_1y)

        # Get CEO/Officers info
        officers_raw = info.get("companyOfficers", [])
        officers = []
        ceo_name = "N/A"
        for off in officers_raw:
            title = off.get("title", "")
            name = off.get("name", "Unknown")
            age = off.get("age")
            salary = off.get("totalPay") or off.get("salary")
            if salary is not None:
                salary *= fx_rate
            
            officers.append({
                "name": name,
                "title": title,
                "age": age,
                "salary": salary
            })
            
            if "CEO" in title or "Chief Executive Officer" in title:
                ceo_name = name

        # Normalized values
        market_cap = get_float("marketCap")
        if market_cap is not None: market_cap *= fx_rate
        
        if current_price is not None: current_price *= fx_rate
        
        free_cash_flow = get_float("freeCashflow")
        if free_cash_flow is not None: free_cash_flow *= fx_rate
        
        operating_cash_flow = get_float("operatingCashflow")
        if operating_cash_flow is not None: operating_cash_flow *= fx_rate

        # Basic financial metrics
        data = {
            "ticker": ticker_symbol,
            "name": info.get("longName") or info.get("shortName") or ticker_symbol,
            "sector": info.get("sector", "N/A"),
            "industry": info.get("industry", "N/A"),
            "summary": info.get("longBusinessSummary", "N/A"),
            "website": info.get("website", ""),
            "market_cap": market_cap,
            "price": current_price,
            
            # Profitability
            "operating_margin": get_float("operatingMargins"),
            "net_margin": get_float("profitMargins"),
            "roe": get_float("returnOnEquity"),
            "roa": get_float("returnOnAssets"),
            
            # Cash Flows & Value
            "free_cash_flow": free_cash_flow,
            "operating_cash_flow": operating_cash_flow,
            "forward_pe": get_float("forwardPE"),
            "trailing_pe": get_float("trailingPE"),
            "price_to_book": get_float("priceToBook"),
            "dividend_yield": get_float("dividendYield"),
            
            # Solvency & Soundness
            "debt_to_equity": get_float("debtToEquity"),
            "current_ratio": get_float("currentRatio"),
            
            # Growth (YoY)
            "revenue_growth": get_float("revenueGrowth"),
            "earnings_growth": get_float("earningsGrowth"),
            
            # Momentum
            "momentum_3m": momentum_3m,
            "momentum_6m": momentum_6m,
            "momentum_1y": momentum_1y,
            "sparkline": sparkline_prices,
            "volume_ratio": float(info.get("volume", 0) / info.get("averageVolume", 1)) if info.get("volume") and info.get("averageVolume") else None,
            
            # CEO / Officers
            "ceo": ceo_name,
            "officers": officers[:5],  # Top 5 officers
            "history": extract_historical_metrics(ticker, fx_rate),

            # Raw weekly closes in the ticker's NATIVE currency, plus what
            # that currency is — main() pops these into prices.json (with
            # week-matched FX) before the stock dict is serialized.
            "_weekly_closes": weekly_closes,
            "_currency": currency,
            "_fx_rate_now": fx_rate,
        }

        return data
    except Exception as e:
        print(f"Error fetching {ticker_symbol}: {e}")
        return None

def get_stock_data_with_retry(ticker_symbol, attempts=2):
    """One retry with backoff — CI runners get rate-limited more readily
    than a residential connection, and a single transient failure should
    not cost the ticker for the whole day."""
    for i in range(attempts):
        data = get_stock_data(ticker_symbol)
        if data is not None:
            return data
        if i + 1 < attempts:
            time.sleep(2)
            print(f"Retrying {ticker_symbol}...")
    return None

def score_and_rank_stocks(stocks):
    scored_stocks = []
    
    # Extract values for min/max scaling
    def get_valid_series(key):
        return [s[key] for s in stocks if s.get(key) is not None]

    # Helper for relative ranking (0 to 100)
    def calculate_percentile(val, series, reverse=False):
        if val is None or not series:
            return 50.0  # neutral default
        series = sorted([x for x in series if x is not None])
        if not series:
            return 50.0
        count = sum(1 for x in series if x <= val)
        percentile = (count / len(series)) * 100.0
        return (100.0 - percentile) if reverse else percentile

    # Pre-gather series for percentile calculations
    op_margins = get_valid_series("operating_margin")
    net_margins = get_valid_series("net_margin")
    roes = get_valid_series("roe")
    de_ratios = get_valid_series("debt_to_equity")
    curr_ratios = get_valid_series("current_ratio")
    rev_growths = get_valid_series("revenue_growth")
    earn_growths = get_valid_series("earnings_growth")
    mom_6m = get_valid_series("momentum_6m")
    mom_1y = get_valid_series("momentum_1y")
    
    # Calculate cash flow yield (FCF / Market Cap) if available
    fcf_yields = []
    for s in stocks:
        fcf = s.get("free_cash_flow")
        mcap = s.get("market_cap")
        if fcf is not None and mcap and mcap > 0:
            s["fcf_yield"] = fcf / mcap
            fcf_yields.append(s["fcf_yield"])
        else:
            s["fcf_yield"] = None

    fcf_yields_clean = [x for x in fcf_yields if x is not None]

    for s in stocks:
        # 1. Profitability Score (0-100)
        p_op = calculate_percentile(s["operating_margin"], op_margins)
        p_net = calculate_percentile(s["net_margin"], net_margins)
        p_roe = calculate_percentile(s["roe"], roes)
        profit_score = (p_op * 0.35) + (p_net * 0.35) + (p_roe * 0.30)
        
        # 2. Cash Flow Score (0-100)
        p_fcf_yield = calculate_percentile(s["fcf_yield"], fcf_yields_clean)
        fcf_pos = 100.0 if (s["free_cash_flow"] or 0) > 0 else 20.0
        cf_score = (p_fcf_yield * 0.60) + (fcf_pos * 0.40)
        
        # 3. Debt & Soundness Score (0-100)
        p_de = calculate_percentile(s["debt_to_equity"], de_ratios, reverse=True)
        p_curr = calculate_percentile(s["current_ratio"], curr_ratios)
        if s["debt_to_equity"] is None or s["debt_to_equity"] == 0:
            p_de = 85.0
        safety_score = (p_de * 0.50) + (p_curr * 0.50)
        
        # Overall Quality Score
        quality_score = (profit_score * 0.40) + (cf_score * 0.40) + (safety_score * 0.20)
        
        # 4. Hype / Growth Score (0-100)
        p_rev = calculate_percentile(s["revenue_growth"], rev_growths)
        p_earn = calculate_percentile(s["earnings_growth"], earn_growths)
        p_mom6 = calculate_percentile(s["momentum_6m"], mom_6m)
        p_mom1y = calculate_percentile(s["momentum_1y"], mom_1y)
        
        hype_score = (p_rev * 0.30) + (p_earn * 0.20) + (p_mom6 * 0.25) + (p_mom1y * 0.25)
        
        # Overall Score: Blend of Quality (60%) and Hype (40%)
        overall_score = (quality_score * 0.60) + (hype_score * 0.40)
        
        s["scores"] = {
            "profitability": round(profit_score, 1),
            "cash_flow": round(cf_score, 1),
            "safety": round(safety_score, 1),
            "quality": round(quality_score, 1),
            "hype": round(hype_score, 1),
            "overall": round(overall_score, 1)
        }
        scored_stocks.append(s)
        
    scored_stocks = sorted(scored_stocks, key=lambda x: x["scores"]["overall"], reverse=True)
    return scored_stocks

def build_prices_payload(weekly_map):
    """Assemble prices.json: a global weekly W-FRI date grid (~3 years) with
    per-ticker USD close arrays aligned to it (null-padded), benchmark
    series, and a weekly USDCAD array so the UI can display CAD honestly.

    weekly_map: {ticker: {"closes": Series in native currency (tz-naive
    index), "currency": str, "fx_now": float}}.
    """
    today = pd.Timestamp.today().normalize()
    # Most recent Friday on or before today. The in-progress week's partial
    # bar resamples to NEXT Friday's label and falls off the grid.
    end = today - pd.Timedelta(days=(today.weekday() - 4) % 7)
    grid = pd.date_range(end=end, periods=157, freq='W-FRI')

    def to_grid(closes, currency, fx_now):
        s = closes.resample('W-FRI').last().reindex(grid)
        fx = get_fx_weekly(currency)
        if fx is not None:
            fx_grid = fx.resample('W-FRI').last().reindex(grid).ffill().bfill()
            s = s * fx_grid
        elif currency != "USD":
            s = s * fx_now
        out = []
        for v in s:
            if v is None or pd.isna(v) or not math.isfinite(float(v)):
                out.append(None)
            else:
                v = float(v)
                out.append(round(v, 4 if abs(v) < 1 else 2))
        return out

    series = {}
    for ticker_symbol, rec in weekly_map.items():
        closes = rec["closes"]
        if closes is None or closes.empty:
            continue
        arr = to_grid(closes, rec["currency"], rec["fx_now"])
        if sum(1 for v in arr if v is not None) < 2:
            continue
        series[ticker_symbol] = arr

    benchmarks = {}
    # ^GSPC keyed as "GSPC": the caret is hostile to JS property access and
    # URL hashes. XEQT.TO trades in CAD and converts like any .TO ticker.
    for symbol, key, currency in [("^GSPC", "GSPC", "USD"), ("XEQT.TO", "XEQT.TO", "CAD")]:
        try:
            h = yf.Ticker(symbol).history(period="3y", interval="1wk")['Close']
            h.index = h.index.tz_localize(None).normalize()
            benchmarks[key] = to_grid(h, currency, CAD_USD if currency == "CAD" else 1.0)
        except Exception as e:
            print(f"Warning: benchmark {symbol} failed: {e}")

    usd_cad = []
    try:
        h = yf.Ticker("USDCAD=X").history(period="3y", interval="1wk")['Close']
        h.index = h.index.tz_localize(None).normalize()
        usd_cad = to_grid(h, "USD", 1.0)
    except Exception as e:
        print(f"Warning: USDCAD weekly series failed: {e}")

    return {
        "as_of": time.strftime("%Y-%m-%d"),
        "interval": "1wk",
        "currency": "USD",
        "dates": [d.strftime("%Y-%m-%d") for d in grid],
        "series": series,
        "benchmarks": benchmarks,
        "usd_cad": usd_cad,
    }

def main():
    results = []
    try:
        target_tickers = get_xeqt_500_tickers()
    except Exception as e:
        print(f"Error compiling XEQT 500, falling back to static list: {e}")
        target_tickers = TICKERS

    print(f"Starting financial data scraper for {len(target_tickers)} XEQT core holdings...")

    # Let's run the scraper on the compiled core holdings.
    # Since we are scraping ~400-500 stocks, we'll keep a small sleep delay to respect API servers.
    for symbol in target_tickers:
        data = get_stock_data_with_retry(symbol)
        if data:
            results.append(data)
        time.sleep(0.3)  # Respect rate limits

    if results:
        # Pop the raw weekly series out before scoring/serialization —
        # pandas objects are not JSON and do not belong in portfolio_data.
        weekly_map = {}
        for s in results:
            weekly_map[s["ticker"]] = {
                "closes": s.pop("_weekly_closes", None),
                "currency": s.pop("_currency", "USD"),
                "fx_now": s.pop("_fx_rate_now", 1.0),
            }

        scored = score_and_rank_stocks(results)
        output_file = "portfolio_data.json"
        with open(output_file, "w") as f:
            json.dump(sanitize_for_json({
                "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
                "stocks": scored
            }), f, indent=2, allow_nan=False)
        print(f"Scraped and scored {len(scored)} stocks successfully. Saved to {output_file}")

        prices = build_prices_payload(weekly_map)
        with open("prices.json", "w") as f:
            json.dump(sanitize_for_json(prices), f, separators=(",", ":"), allow_nan=False)
        print(f"Wrote prices.json: {len(prices['series'])} tickers, "
              f"{len(prices['benchmarks'])} benchmarks, {len(prices['dates'])} weeks")
    else:
        print("Failed to scrape any data.")

if __name__ == "__main__":
    main()
