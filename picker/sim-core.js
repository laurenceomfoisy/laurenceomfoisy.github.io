// SoundHype Sim Core — backtest math over the weekly price grid in
// prices.json. Pure functions, no DOM, no Date objects (all date handling
// is lexicographic comparison of the grid's ISO strings, so there are no
// timezone bugs and everything is trivially node-testable). Loaded as a
// classic script in the browser (window.SimCore) and require()-able from
// node for tests.
//
// Data model, shared by every function here:
//   dates:  ascending array of ISO 'YYYY-MM-DD' strings (the global grid)
//   closes: array of numbers-or-null aligned to `dates` (null = no data
//           that week: not yet listed, delisted, or a scrape gap)
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.SimCore = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {

    // First grid index whose date is on or after `isoDate`; -1 when the
    // date falls past the end of the grid. ISO strings compare correctly
    // as plain strings.
    function indexOnOrAfter(dates, isoDate) {
        for (let i = 0; i < dates.length; i++) {
            if (dates[i] >= isoDate) return i;
        }
        return -1;
    }

    // First index at or after `fromIdx` holding an actual price.
    function firstDataIndex(closes, fromIdx) {
        for (let i = Math.max(0, fromIdx); i < closes.length; i++) {
            if (closes[i] !== null && closes[i] !== undefined) return i;
        }
        return -1;
    }

    // Interior nulls (scrape gaps, market holidays) carry the last seen
    // price forward; leading nulls stay null — a stock has no price before
    // it exists, and pretending otherwise fabricates returns.
    function ffill(closes) {
        const out = closes.slice();
        let last = null;
        for (let i = 0; i < out.length; i++) {
            if (out[i] === null || out[i] === undefined) out[i] = last;
            else last = out[i];
        }
        return out;
    }

    // Buy `amount` (in the series' own currency — USD for prices.json) at
    // the first weekly close on or after `startDate`, hold to the last
    // close. Returns the valuation series for charting alongside the
    // headline numbers.
    function simulateLumpSum(dates, closes, amount, startDate) {
        if (!(amount > 0) || !isFinite(amount)) return { ok: false, reason: 'bad-amount' };
        if (!Array.isArray(dates) || !Array.isArray(closes) || dates.length !== closes.length || dates.length === 0) {
            return { ok: false, reason: 'no-data' };
        }

        const fromIdx = indexOnOrAfter(dates, startDate);
        if (fromIdx === -1) return { ok: false, reason: 'no-data' };

        const filled = ffill(closes);
        const startIdx = firstDataIndex(filled, fromIdx);
        // A buy that can only execute on the final data point (or never)
        // has no holding period — nothing honest to simulate.
        if (startIdx === -1 || startIdx >= dates.length - 1) {
            return { ok: false, reason: 'before-history' };
        }

        const startPrice = filled[startIdx];
        const shares = amount / startPrice;
        const series = [];
        for (let i = startIdx; i < dates.length; i++) {
            series.push({ date: dates[i], value: shares * filled[i] });
        }
        const endIdx = dates.length - 1;
        const endValue = shares * filled[endIdx];

        return {
            ok: true,
            startIdx,
            startDate: dates[startIdx],
            startPrice,
            shares,
            endIdx,
            endDate: dates[endIdx],
            endValue,
            gainAbs: endValue - amount,
            returnPct: (endValue / amount - 1) * 100,
            series,
        };
    }

    // Buy a weighted basket at `startDate`. `holdings` is
    // [{ticker, weightPct}]; weights are renormalized over the holdings
    // that actually have data at the start date, and the ones that do not
    // are reported in `skipped` rather than silently dropped.
    function simulatePortfolio(dates, seriesMap, holdings, amount, startDate) {
        if (!(amount > 0) || !isFinite(amount)) return { ok: false, reason: 'bad-amount' };
        if (!Array.isArray(holdings) || holdings.length === 0) return { ok: false, reason: 'no-holdings' };

        const buyable = [];
        const skipped = [];
        for (const h of holdings) {
            const closes = seriesMap && seriesMap[h.ticker];
            if (!closes) {
                skipped.push({ ticker: h.ticker, reason: 'no-data' });
                continue;
            }
            // Probe with a unit amount first to learn whether the buy can
            // execute; the real slice depends on renormalized weights below.
            const probe = simulateLumpSum(dates, closes, 1, startDate);
            if (!probe.ok) {
                skipped.push({ ticker: h.ticker, reason: probe.reason });
                continue;
            }
            buyable.push({ holding: h, closes });
        }
        if (buyable.length === 0) return { ok: false, reason: 'no-data', skipped };

        const liveWeight = buyable.reduce((sum, b) => sum + b.holding.weightPct, 0);
        if (!(liveWeight > 0)) return { ok: false, reason: 'no-holdings', skipped };

        const runs = buyable.map(({ holding, closes }) => {
            const slice = amount * (holding.weightPct / liveWeight);
            return { holding, slice, res: simulateLumpSum(dates, closes, slice, startDate) };
        });

        const perHolding = runs.map(({ holding, slice, res }) => ({
            ticker: holding.ticker,
            weightPct: (holding.weightPct / liveWeight) * 100,
            amount: slice,
            startDate: res.startDate,
            startPrice: res.startPrice,
            shares: res.shares,
            endValue: res.endValue,
            gainAbs: res.gainAbs,
            returnPct: res.returnPct,
        }));

        // Holdings can start on different weeks (a late listing buys at its
        // first close). The combined curve counts not-yet-invested slices at
        // cost until their buy executes, so the total never pretends money
        // was at work before it could be.
        const firstIdx = Math.min(...runs.map((r) => r.res.startIdx));
        const series = [];
        for (let i = firstIdx; i < dates.length; i++) {
            let value = 0;
            for (const { slice, res } of runs) {
                value += i >= res.startIdx ? res.series[i - res.startIdx].value : slice;
            }
            series.push({ date: dates[i], value });
        }

        const endValue = perHolding.reduce((sum, p) => sum + p.endValue, 0);
        return {
            ok: true,
            endValue,
            gainAbs: endValue - amount,
            returnPct: (endValue / amount - 1) * 100,
            series,
            perHolding,
            skipped,
        };
    }

    // Week-matched USD -> CAD conversion for a valuation series produced by
    // the simulators. `usdCad` is the grid-aligned weekly USDCAD rate.
    function toCadSeries(series, dates, usdCad) {
        const filled = ffill(usdCad);
        return series.map((pt) => {
            const idx = indexOnOrAfter(dates, pt.date);
            const rate = idx === -1 ? filled[filled.length - 1] : filled[idx];
            return { date: pt.date, value: rate === null ? pt.value : pt.value * rate };
        });
    }

    // Single-value USD -> CAD at the week containing `isoDate`.
    function toCadValue(value, isoDate, dates, usdCad) {
        const filled = ffill(usdCad);
        const idx = indexOnOrAfter(dates, isoDate);
        const rate = idx === -1 ? filled[filled.length - 1] : filled[idx];
        return rate === null ? value : value * rate;
    }

    return {
        indexOnOrAfter,
        firstDataIndex,
        ffill,
        simulateLumpSum,
        simulatePortfolio,
        toCadSeries,
        toCadValue,
    };
});
