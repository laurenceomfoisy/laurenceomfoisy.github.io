// SoundHype Teach — worked-example picking + per-rule floor casualties.
// Consumes PortfolioBuilder.applyQualityFloor/DEFAULT_FLOOR to power Step 2's
// three worked examples (strong/trap/mediocre) and Step 3's "what we cut and
// why" report. Pure functions, no DOM. Loaded as a classic script in the
// browser (window.Teach) and require()-able from node for tests.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./portfolio-builder-core.js'));
    } else {
        root.Teach = factory(root.PortfolioBuilder);
    }
})(typeof self !== 'undefined' ? self : this, function (PortfolioBuilder) {

    // Must match wizard.js FLOOR_RULES ids/fields exactly.
    const RULE_FIELDS = {
        fcf: 'hypergrowthRevenueGrowth',
        current: 'minCurrentRatio',
        debt: 'maxDebtToEquity',
        rev: 'minRevenueGrowth',
        mcap: 'minMarketCap',
    };

    // Sentinel "disabled" value per field — mirrors wizard.js FLOOR_RULES'
    // disabledValue per rule.
    const DISABLED_VALUE = {
        hypergrowthRevenueGrowth: -Number.MAX_VALUE,
        minCurrentRatio: -Number.MAX_VALUE,
        maxDebtToEquity: Number.MAX_VALUE,
        minRevenueGrowth: -Number.MAX_VALUE,
        minMarketCap: 0,
    };

    function isNum(v) {
        return typeof v === 'number' && isFinite(v);
    }

    function disabledConfig() {
        return Object.assign({}, DISABLED_VALUE);
    }

    function singleRuleConfig(ruleId, floor) {
        const cfg = disabledConfig();
        const field = RULE_FIELDS[ruleId];
        cfg[field] = floor[field];
        return cfg;
    }

    // A stock fails rule R iff it passes applyQualityFloor under the
    // all-disabled config but not under the single-rule config for R.
    //
    // Stocks missing KEY_METRICS (or scores.quality) fail even the
    // all-disabled floor, since applyQualityFloor excludes them before any
    // rule-specific check runs. Those stocks are data-poor, not diseased —
    // we have no basis to blame them on any particular rule — so they are
    // treated here as failing nothing rather than "failing everything".
    function rulesFailed(stock, floor) {
        const passesDisabled = PortfolioBuilder.applyQualityFloor([stock], disabledConfig()).length === 1;
        if (!passesDisabled) return [];
        return Object.keys(RULE_FIELDS).filter(ruleId => {
            const cfg = singleRuleConfig(ruleId, floor);
            return PortfolioBuilder.applyQualityFloor([stock], cfg).length === 0;
        });
    }

    // 75th-percentile value of a numeric series, found by sorting rather
    // than counting (unlike PortfolioBuilder.computePercentile, which
    // answers "what percentile is this value at" instead of "what value is
    // at this percentile").
    function quartileThreshold(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const idx = Math.min(sorted.length - 1, Math.ceil(0.75 * sorted.length) - 1);
        return sorted[idx];
    }

    function pickStrong(stocks) {
        let best = null;
        for (const s of stocks) {
            if (!s.scores || !isNum(s.scores.overall)) continue;
            if (!best ||
                s.scores.overall > best.scores.overall ||
                (s.scores.overall === best.scores.overall && s.ticker < best.ticker)) {
                best = s;
            }
        }
        return best;
    }

    function pickTrap(stocks, floor) {
        const hypeValues = stocks
            .filter(s => s.scores && isNum(s.scores.hype))
            .map(s => s.scores.hype);
        if (!hypeValues.length) return null;

        const threshold = quartileThreshold(hypeValues);
        const topQuartile = stocks.filter(s => s.scores && isNum(s.scores.hype) && s.scores.hype >= threshold);

        const withFails = topQuartile.map(s => ({ stock: s, fails: rulesFailed(s, floor).length }));

        const byFailsThenHype = (a, b) =>
            b.fails - a.fails || b.stock.scores.hype - a.stock.scores.hype;

        const multiFail = withFails.filter(x => x.fails >= 2).sort(byFailsThenHype);
        if (multiFail.length) return multiFail[0].stock;

        const oneFail = withFails.filter(x => x.fails === 1).sort(byFailsThenHype);
        if (oneFail.length) return oneFail[0].stock;

        return null;
    }

    function pickMediocre(stocks, floor, strong) {
        const survivors = PortfolioBuilder.applyQualityFloor(stocks, floor);
        if (!survivors.length) return null;

        const overalls = survivors.map(s => s.scores.overall).slice().sort((a, b) => a - b);
        const n = overalls.length;
        // Even length: lower-middle, per the brief's median spec.
        const median = n % 2 === 1 ? overalls[(n - 1) / 2] : overalls[n / 2 - 1];

        const ranked = survivors
            .map(s => ({ stock: s, dist: Math.abs(s.scores.overall - median) }))
            .sort((a, b) => a.dist - b.dist || a.stock.ticker.localeCompare(b.stock.ticker));

        for (const r of ranked) {
            if (!strong || r.stock.ticker !== strong.ticker) return r.stock;
        }
        return null;
    }

    function pickTeachingExamples(stocks, floor) {
        const strong = pickStrong(stocks);
        const trap = pickTrap(stocks, floor);
        const mediocre = pickMediocre(stocks, floor, strong);
        return { strong, trap, mediocre };
    }

    // killCount = number of stocks that TRUE-fail that rule, i.e. stocks with
    // complete KEY_METRICS whose rulesFailed(stock, floor) includes ruleId.
    // Data-poor stocks (missing KEY_METRICS) are excluded from every rule's
    // count — they're cut once, honestly, by the completeness gate, not
    // blamed on whichever rule happens to be evaluated. Same population as
    // `casualties` below, so count and named examples describe one thing.
    function casualtiesByRule(stocks, floor) {
        const result = {};
        for (const ruleId of Object.keys(RULE_FIELDS)) {
            const failing = stocks.filter(s => rulesFailed(s, floor).includes(ruleId));

            const casualties = failing
                .slice()
                .sort((a, b) => b.market_cap - a.market_cap)
                .slice(0, 3);

            result[ruleId] = { killCount: failing.length, casualties };
        }
        return result;
    }

    return {
        RULE_FIELDS,
        disabledConfig,
        singleRuleConfig,
        rulesFailed,
        pickTeachingExamples,
        casualtiesByRule,
    };
});
