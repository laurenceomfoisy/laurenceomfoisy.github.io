// SoundHype Portfolio Builder — core logic.
// Pure functions, no DOM. Loaded as a classic script in the browser
// (window.PortfolioBuilder) and require()-able from node for tests.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.PortfolioBuilder = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {

    // Metrics a stock must have for the builder to consider it at all.
    // Missing data means excluded — never scored as "average".
    const KEY_METRICS = [
        'free_cash_flow', 'current_ratio', 'debt_to_equity', 'revenue_growth',
        'earnings_growth', 'momentum_6m', 'momentum_1y', 'market_cap',
    ];

    const DEFAULT_FLOOR = {
        minCurrentRatio: 1.0,
        maxDebtToEquity: 200,      // yfinance convention: 200 == 2.0x
        minRevenueGrowth: 0,       // exclusive: growth must be positive
        minMarketCap: 2e9,
        hypergrowthRevenueGrowth: 0.30, // negative FCF tolerated above this
    };

    const DEFAULT_WEIGHTS = {
        revenue_growth: 30,
        earnings_growth: 15,
        momentum: 35,   // average of 6m and 1y
        quality: 20,    // existing 0-100 quality score from screener.py
    };

    function isNum(v) {
        return typeof v === 'number' && isFinite(v);
    }

    // Mirror of calculate_percentile in screener.py: share of series values <= val.
    function computePercentile(series, val) {
        if (!isNum(val)) return 50.0;
        const clean = series.filter(isNum);
        if (!clean.length) return 50.0;
        const count = clean.reduce((acc, x) => acc + (x <= val ? 1 : 0), 0);
        return (count / clean.length) * 100.0;
    }

    function applyQualityFloor(stocks, cfg) {
        const c = Object.assign({}, DEFAULT_FLOOR, cfg || {});
        return stocks.filter(s => {
            if (KEY_METRICS.some(k => !isNum(s[k]))) return false;
            if (!s.scores || !isNum(s.scores.quality)) return false;
            if (s.free_cash_flow <= 0 && s.revenue_growth <= c.hypergrowthRevenueGrowth) return false;
            if (s.current_ratio < c.minCurrentRatio) return false;
            if (s.debt_to_equity > c.maxDebtToEquity) return false;
            if (s.revenue_growth <= c.minRevenueGrowth) return false;
            if (s.market_cap < c.minMarketCap) return false;
            return true;
        });
    }

    function computeGrowthScores(survivors, weights) {
        const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
        const totalW = w.revenue_growth + w.earnings_growth + w.momentum + w.quality;
        if (totalW <= 0) return survivors.map(s => Object.assign({}, s, { growthScore: 0 }));

        const revSeries = survivors.map(s => s.revenue_growth);
        const earnSeries = survivors.map(s => s.earnings_growth);
        const momOf = s => (s.momentum_6m + s.momentum_1y) / 2;
        const momSeries = survivors.map(momOf);

        return survivors
            .map(s => {
                const score = (
                    w.revenue_growth * computePercentile(revSeries, s.revenue_growth) +
                    w.earnings_growth * computePercentile(earnSeries, s.earnings_growth) +
                    w.momentum * computePercentile(momSeries, momOf(s)) +
                    w.quality * s.scores.quality
                ) / totalW;
                return Object.assign({}, s, { growthScore: Math.round(score * 10) / 10 });
            })
            .sort((a, b) => b.growthScore - a.growthScore || a.ticker.localeCompare(b.ticker));
    }

    // Greedy walk down the ranked list; a sector may fill at most
    // floor(n * sectorCapPct/100) of the n slots (always at least 1).
    function selectPortfolio(ranked, opts) {
        const n = (opts && opts.n) || 18;
        const sectorCapPct = (opts && opts.sectorCapPct) || 30;
        const maxPerSector = Math.max(1, Math.floor(n * sectorCapPct / 100));
        const perSector = {};
        const seenCompanies = new Set(); // dual share classes (GOOGL/GOOG) share a name
        const picked = [];
        for (const s of ranked) {
            if (picked.length >= n) break;
            const company = s.name || s.ticker;
            if (seenCompanies.has(company)) continue;
            const sector = s.sector || 'Unknown';
            if ((perSector[sector] || 0) >= maxPerSector) continue;
            perSector[sector] = (perSector[sector] || 0) + 1;
            seenCompanies.add(company);
            picked.push(s);
        }
        return picked;
    }

    // Score-proportional weights clipped to [minPct, maxPct], renormalized to
    // exactly 100.00. Falls back to equal weight when the caps are infeasible.
    function computeWeights(selected, opts) {
        const minPct = (opts && isNum(opts.minPct)) ? opts.minPct : 3;
        const maxPct = (opts && isNum(opts.maxPct)) ? opts.maxPct : 10;
        const m = selected.length;
        if (!m) return [];

        let raw;
        if (m * maxPct < 100 || m * minPct > 100) {
            raw = selected.map(() => 100 / m); // caps infeasible
        } else {
            // Iteratively pin out-of-bounds weights to their cap and redistribute
            // the remainder among the rest, proportionally to score.
            const pinned = new Array(m).fill(null);
            for (let pass = 0; pass < m; pass++) {
                const freeIdx = [];
                let pinnedSum = 0;
                pinned.forEach((p, i) => (p === null ? freeIdx.push(i) : pinnedSum += p));
                const remaining = 100 - pinnedSum;
                const freeScoreSum = freeIdx.reduce((acc, i) => acc + selected[i].growthScore, 0);
                let changed = false;
                for (const i of freeIdx) {
                    const share = freeScoreSum > 0
                        ? (selected[i].growthScore / freeScoreSum) * remaining
                        : remaining / freeIdx.length;
                    if (share > maxPct) { pinned[i] = maxPct; changed = true; }
                    else if (share < minPct) { pinned[i] = minPct; changed = true; }
                }
                if (!changed) {
                    for (const i of freeIdx) {
                        pinned[i] = freeScoreSum > 0
                            ? (selected[i].growthScore / freeScoreSum) * remaining
                            : remaining / freeIdx.length;
                    }
                    break;
                }
            }
            raw = pinned.map(p => p === null ? minPct : p);
        }

        // Round to 2 decimals with the largest-remainder method so the total is
        // exactly 100.00 and no rounding step breaches a cap.
        const floors = raw.map(w => Math.floor(w * 100) / 100);
        let deficit = Math.round((100 - floors.reduce((a, b) => a + b, 0)) * 100);
        const order = raw
            .map((w, i) => ({ i, rem: w * 100 - Math.floor(w * 100) }))
            .sort((a, b) => b.rem - a.rem || raw[b.i] - raw[a.i]);
        for (const { i } of order) {
            if (deficit <= 0) break;
            if (floors[i] + 0.01 <= maxPct + 1e-9 || m * maxPct < 100) {
                floors[i] = Math.round((floors[i] + 0.01) * 100) / 100;
                deficit--;
            }
        }
        return selected.map((s, i) => Object.assign({}, s, { weightPct: floors[i] }));
    }

    // Canadian listings carry Yahoo's .TO suffix; everything else needs CAD->USD
    // conversion (Wealthsimple charges ~1.5% once, on the buy).
    function estimateFxCost(weighted, totalCad, ratePct) {
        const rate = isNum(ratePct) ? ratePct : 1.5;
        const usWeight = weighted.reduce((acc, s) =>
            acc + (s.ticker.endsWith('.TO') ? 0 : s.weightPct), 0);
        const usPortionCad = Math.round(totalCad * usWeight) / 100;
        const costCad = Math.round(usPortionCad * rate) / 100;
        return { usWeightPct: usWeight, usPortionCad: usPortionCad, costCad: costCad };
    }

    return {
        KEY_METRICS,
        DEFAULT_FLOOR,
        DEFAULT_WEIGHTS,
        computePercentile,
        applyQualityFloor,
        computeGrowthScores,
        selectPortfolio,
        computeWeights,
        estimateFxCost,
    };
});
