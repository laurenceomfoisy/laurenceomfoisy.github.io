"""Strict validation gate for the generated data files.

Run from picker/: `python3 validate_data.py`. Exits non-zero on any
failure — the daily GitHub Action commits fresh data only when this
passes, so a bad scrape can never replace the last good snapshot.
"""
import json
import sys
from datetime import datetime, timedelta

FAILURES = []


def check(ok, message):
    if not ok:
        FAILURES.append(message)


def reject_constant(name):
    raise ValueError(f"non-strict JSON constant: {name}")


def strict_load(path):
    with open(path) as f:
        # Browsers' JSON.parse rejects bare NaN/Infinity — so do we.
        return json.load(f, parse_constant=reject_constant)


def fresh(date_str, fmt, max_age_days=3):
    then = datetime.strptime(date_str, fmt)
    return datetime.now() - then < timedelta(days=max_age_days)


def validate_portfolio():
    data = strict_load("portfolio_data.json")
    check(fresh(data["last_updated"], "%Y-%m-%d %H:%M:%S"),
          f"portfolio_data.json is stale: {data['last_updated']}")
    stocks = data["stocks"]
    check(len(stocks) >= 300, f"only {len(stocks)} stocks (need >= 300)")
    scored = 0
    priced = 0
    for s in stocks:
        for field in ("ticker", "name"):
            check(s.get(field) is not None, f"{s.get('ticker', '?')}: missing {field}")
        if s.get("price") is not None:
            priced += 1
        if s.get("scores") and s["scores"].get("overall") is not None:
            scored += 1
    # A couple of thin ADRs chronically lack a Yahoo price (the UI shows
    # N/A and the junk filter kills them) — demand near-total coverage, not
    # perfection, or every daily run would fail on Yahoo's quirks.
    check(priced >= 0.98 * len(stocks),
          f"only {priced}/{len(stocks)} stocks have a price (need >= 98%)")
    check(scored >= 300, f"only {scored} stocks carry an overall score (need >= 300)")
    return stocks


def validate_prices(stocks):
    data = strict_load("prices.json")
    check(fresh(data["as_of"], "%Y-%m-%d"), f"prices.json is stale: {data['as_of']}")

    dates = data["dates"]
    check(140 <= len(dates) <= 170, f"date grid has {len(dates)} weeks (expected 140-170)")
    check(dates == sorted(dates), "date grid is not ascending")

    series = data["series"]
    check(len(series) >= 300, f"only {len(series)} price series (need >= 300)")

    recent_ok = 0
    for ticker, arr in series.items():
        check(len(arr) == len(dates), f"{ticker}: series length {len(arr)} != grid {len(dates)}")
        if arr and arr[-1] is not None:
            recent_ok += 1
    check(recent_ok >= 0.8 * len(series),
          f"only {recent_ok}/{len(series)} series have a price in the final week")

    for name in ("GSPC", "XEQT.TO"):
        bench = data["benchmarks"].get(name)
        check(bench is not None, f"benchmark {name} missing")
        if bench:
            check(len(bench) == len(dates), f"benchmark {name}: wrong length")
            tail = bench[-26:]
            check(all(v is not None for v in tail), f"benchmark {name}: nulls in last 26 weeks")

    usd_cad = data.get("usd_cad") or []
    check(len(usd_cad) == len(dates), "usd_cad: wrong length")
    check(all(v is not None for v in usd_cad[-26:]), "usd_cad: nulls in last 26 weeks")

    tickers = {s["ticker"] for s in stocks}
    covered = sum(1 for t in tickers if t in series)
    check(covered >= 0.9 * len(tickers),
          f"only {covered}/{len(tickers)} portfolio tickers have price series (need >= 90%)")


def main():
    try:
        stocks = validate_portfolio()
        validate_prices(stocks)
    except Exception as e:
        FAILURES.append(f"validation crashed: {type(e).__name__}: {e}")

    if FAILURES:
        print(f"FAIL: {len(FAILURES)} problem(s)")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    print("OK: portfolio_data.json and prices.json both validate")


if __name__ == "__main__":
    main()
