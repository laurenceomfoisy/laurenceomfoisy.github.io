// SoundHype Interpret — value -> verdict engine.
// Consumes CopyDeck (metric definitions/ranges) and PortfolioBuilder
// (computePercentile) to turn a raw stock value into a blunt, toned
// verdict a novice can read at a glance. No DOM. Loaded as a classic
// script in the browser (window.Interpret) and require()-able from
// node for tests.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./copy-deck.js'), require('./portfolio-builder-core.js'));
    } else {
        root.Interpret = factory(root.CopyDeck, root.PortfolioBuilder);
    }
})(typeof self !== 'undefined' ? self : this, function (CopyDeck, PortfolioBuilder) {

    // Reads `key` from `stock`, supporting a `scores.` prefix as a nested
    // path (e.g. 'scores.overall' -> stock.scores.overall). Returns null
    // for undefined/null/non-finite values so callers never have to guard.
    function getValue(stock, key) {
        const parts = key.split('.');
        let cur = stock;
        for (const p of parts) {
            if (cur === null || cur === undefined) return null;
            cur = cur[p];
        }
        if (cur === null || cur === undefined) return null;
        if (typeof cur !== 'number' || !isFinite(cur)) return null;
        return cur;
    }

    function fillTemplate(tpl, vars) {
        return tpl.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
    }

    // HTML-entity-escapes a string. Duplicated from wizard.js's esc() (this
    // module has no DOM and can't depend on wizard.js) — used wherever a
    // stock-sourced string (e.g. ticker) is spliced into a verdict string
    // that eventually reaches innerHTML via renderVerdictLine.
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Maps `key` + a stock's value through CopyDeck's ranges to a verdict.
    function interpret(key, stock, universe) {
        const entry = CopyDeck.metrics[key];
        const value = getValue(stock, key);
        const ticker = stock && stock.ticker;

        if (value === null) {
            const template = (entry && entry.missing) || CopyDeck.GENERIC_MISSING;
            return {
                verdict: fillTemplate(template, { ticker: escapeHtml(ticker) }),
                tone: 'na',
                value: null,
                display: '—',
            };
        }

        // Value exists but CopyDeck has no entry for this key (e.g. a typo'd
        // or newly-added metric key not yet in the deck). Fail soft rather
        // than throwing on entry.ranges below — callers just get a blank,
        // neutral verdict instead of a crash.
        if (!entry) {
            return {
                verdict: '',
                tone: 'na',
                value,
                display: String(value),
            };
        }

        const range = entry.ranges.find(r => value < r.max);
        const display = CopyDeck.format(key, value);

        let pct;
        if (entry.percentileOf) {
            const series = (universe || [])
                .map(s => getValue(s, entry.percentileOf))
                .filter(v => v !== null);
            pct = Math.round(PortfolioBuilder.computePercentile(series, value));
        }

        const verdict = fillTemplate(range.verdict, { val: display, pct });

        return {
            verdict,
            tone: range.tone,
            value,
            display,
        };
    }

    // Distance from 'fine' used to pick the "most extreme" metric within a
    // domain pair — larger distance wins.
    const TONE_DISTANCE = { bad: 2, caution: 1, good: 1.5, fine: 0, na: 0 };

    function lineFor(key, stock, universe) {
        const r = interpret(key, stock, universe);
        return { key, verdict: r.verdict, tone: r.tone, label: CopyDeck.metrics[key].label };
    }

    function mostExtreme(keyA, keyB, stock, universe) {
        const a = interpret(keyA, stock, universe);
        const b = interpret(keyB, stock, universe);
        const da = TONE_DISTANCE[a.tone] || 0;
        const db = TONE_DISTANCE[b.tone] || 0;
        return da >= db ? keyA : keyB;
    }

    // Builds the 3-4 verdict lines for a stock's summary card: overall,
    // then the most extreme of each domain pair (money, safety), then
    // growth-or-momentum (whichever is more extreme).
    function verdictsForCard(stock, universe) {
        const moneyKey = mostExtreme('fcf_yield', 'operating_margin', stock, universe);
        const safetyKey = mostExtreme('debt_to_equity', 'current_ratio', stock, universe);
        const growthOrMomentumKey = mostExtreme('revenue_growth', 'momentum_6m', stock, universe);

        return [
            lineFor('scores.overall', stock, universe),
            lineFor(moneyKey, stock, universe),
            lineFor(safetyKey, stock, universe),
            lineFor(growthOrMomentumKey, stock, universe),
        ];
    }

    return { getValue, interpret, verdictsForCard };
});
