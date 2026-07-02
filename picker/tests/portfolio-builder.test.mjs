import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PB = require('../portfolio-builder-core.js');

// Valid stock passing all default floor filters; mirrors portfolio_data.json conventions:
// growth/momentum are fractions, debt_to_equity is a percentage (18.4 = 0.18x).
function makeStock(overrides = {}) {
    return {
        ticker: 'AAA',
        name: `${overrides.ticker || 'AAA'} Corp`, // unique per ticker unless overridden

        sector: 'Technology',
        market_cap: 50e9,
        free_cash_flow: 1e9,
        current_ratio: 2.0,
        debt_to_equity: 50,
        revenue_growth: 0.15,
        earnings_growth: 0.20,
        momentum_6m: 0.10,
        momentum_1y: 0.30,
        scores: { quality: 60 },
        ...overrides,
    };
}

// ---------- computePercentile ----------

test('computePercentile: highest value ranks 100', () => {
    assert.equal(PB.computePercentile([10, 20, 30, 40], 40), 100);
});

test('computePercentile: lowest value ranks 25 (count <= val convention, mirrors screener.py)', () => {
    assert.equal(PB.computePercentile([10, 20, 30, 40], 10), 25);
});

test('computePercentile: mid value between ranks', () => {
    assert.equal(PB.computePercentile([10, 20, 30, 40], 25), 50);
});

// ---------- applyQualityFloor ----------

test('floor: valid stock passes', () => {
    const out = PB.applyQualityFloor([makeStock()]);
    assert.equal(out.length, 1);
});

test('floor: negative FCF with ordinary growth is excluded', () => {
    const out = PB.applyQualityFloor([makeStock({ free_cash_flow: -5e8, revenue_growth: 0.15 })]);
    assert.equal(out.length, 0);
});

test('floor: negative FCF with hypergrowth (>30% revenue growth) passes', () => {
    const out = PB.applyQualityFloor([makeStock({ free_cash_flow: -5e8, revenue_growth: 0.45 })]);
    assert.equal(out.length, 1);
});

test('floor: current ratio below 1 is excluded', () => {
    const out = PB.applyQualityFloor([makeStock({ current_ratio: 0.8 })]);
    assert.equal(out.length, 0);
});

test('floor: debt_to_equity above 200 (2.0x) is excluded', () => {
    const out = PB.applyQualityFloor([makeStock({ debt_to_equity: 250 })]);
    assert.equal(out.length, 0);
});

test('floor: non-positive revenue growth is excluded', () => {
    const out = PB.applyQualityFloor([makeStock({ revenue_growth: -0.02 })]);
    assert.equal(out.length, 0);
});

test('floor: market cap below $2B is excluded', () => {
    const out = PB.applyQualityFloor([makeStock({ market_cap: 1.5e9 })]);
    assert.equal(out.length, 0);
});

test('floor: any null key metric excludes the stock, never averaged in', () => {
    const keys = ['free_cash_flow', 'current_ratio', 'debt_to_equity', 'revenue_growth',
        'earnings_growth', 'momentum_6m', 'momentum_1y', 'market_cap'];
    for (const k of keys) {
        const out = PB.applyQualityFloor([makeStock({ [k]: null })]);
        assert.equal(out.length, 0, `stock with null ${k} must be excluded`);
    }
    // missing quality score too
    assert.equal(PB.applyQualityFloor([makeStock({ scores: {} })]).length, 0);
});

test('floor: config overrides are honored', () => {
    const stock = makeStock({ market_cap: 1.5e9 });
    const out = PB.applyQualityFloor([stock], { minMarketCap: 1e9 });
    assert.equal(out.length, 1);
});

// ---------- computeGrowthScores ----------

test('growth scores: returns all survivors sorted descending with scores in [0,100]', () => {
    const stocks = [
        makeStock({ ticker: 'LOW', revenue_growth: 0.02, earnings_growth: 0.01, momentum_6m: -0.1, momentum_1y: -0.05, scores: { quality: 20 } }),
        makeStock({ ticker: 'MID', revenue_growth: 0.15, earnings_growth: 0.20, momentum_6m: 0.10, momentum_1y: 0.20, scores: { quality: 50 } }),
        makeStock({ ticker: 'HIGH', revenue_growth: 0.50, earnings_growth: 0.60, momentum_6m: 0.40, momentum_1y: 0.80, scores: { quality: 90 } }),
    ];
    const ranked = PB.computeGrowthScores(stocks);
    assert.equal(ranked.length, 3);
    assert.deepEqual(ranked.map(s => s.ticker), ['HIGH', 'MID', 'LOW']);
    for (const s of ranked) {
        assert.ok(s.growthScore >= 0 && s.growthScore <= 100, `score ${s.growthScore} in range`);
    }
});

test('growth scores: custom weights change the ordering', () => {
    // A wins on revenue growth only; B wins everywhere else.
    const a = makeStock({ ticker: 'A', revenue_growth: 0.90, earnings_growth: 0.01, momentum_6m: 0.0, momentum_1y: 0.0, scores: { quality: 10 } });
    const b = makeStock({ ticker: 'B', revenue_growth: 0.05, earnings_growth: 0.90, momentum_6m: 0.5, momentum_1y: 0.9, scores: { quality: 90 } });
    const revOnly = PB.computeGrowthScores([a, b], { revenue_growth: 100, earnings_growth: 0, momentum: 0, quality: 0 });
    assert.equal(revOnly[0].ticker, 'A');
    const defaults = PB.computeGrowthScores([a, b]);
    assert.equal(defaults[0].ticker, 'B');
});

// ---------- selectPortfolio ----------

test('select: takes top n in ranked order when no cap conflicts', () => {
    const ranked = ['A', 'B', 'C', 'D', 'E'].map((t, i) =>
        ({ ...makeStock({ ticker: t, sector: `S${i}` }), growthScore: 90 - i }));
    const picked = PB.selectPortfolio(ranked, { n: 4, sectorCapPct: 30 });
    assert.deepEqual(picked.map(s => s.ticker), ['A', 'B', 'C', 'D']);
});

test('select: sector cap is never breached, next-ranked other-sector stock fills the slot', () => {
    const ranked = [
        { ...makeStock({ ticker: 'T1', sector: 'Technology' }), growthScore: 99 },
        { ...makeStock({ ticker: 'T2', sector: 'Technology' }), growthScore: 98 },
        { ...makeStock({ ticker: 'T3', sector: 'Technology' }), growthScore: 97 },
        { ...makeStock({ ticker: 'H1', sector: 'Healthcare' }), growthScore: 90 },
        { ...makeStock({ ticker: 'F1', sector: 'Financial Services' }), growthScore: 80 },
        { ...makeStock({ ticker: 'E1', sector: 'Energy' }), growthScore: 70 },
    ];
    // n=4 at 50% cap -> max 2 per sector
    const picked = PB.selectPortfolio(ranked, { n: 4, sectorCapPct: 50 });
    assert.deepEqual(picked.map(s => s.ticker), ['T1', 'T2', 'H1', 'F1']);
});

test('select: duplicate share classes of the same company are not double-picked', () => {
    // e.g. GOOGL + GOOG are both "Alphabet Inc." — one company, two tickers
    const ranked = [
        { ...makeStock({ ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication Services' }), growthScore: 90 },
        { ...makeStock({ ticker: 'GOOG', name: 'Alphabet Inc.', sector: 'Communication Services' }), growthScore: 89 },
        { ...makeStock({ ticker: 'H1', name: 'Healthco', sector: 'Healthcare' }), growthScore: 80 },
        { ...makeStock({ ticker: 'E1', name: 'Energyco', sector: 'Energy' }), growthScore: 70 },
    ];
    const picked = PB.selectPortfolio(ranked, { n: 3, sectorCapPct: 100 });
    assert.deepEqual(picked.map(s => s.ticker), ['GOOGL', 'H1', 'E1']);
});

test('select: fewer survivors than n returns all without error', () => {
    const ranked = [
        { ...makeStock({ ticker: 'A', sector: 'S1' }), growthScore: 90 },
        { ...makeStock({ ticker: 'B', sector: 'S2' }), growthScore: 80 },
    ];
    const picked = PB.selectPortfolio(ranked, { n: 15, sectorCapPct: 30 });
    assert.equal(picked.length, 2);
});

// ---------- computeWeights ----------

test('weights: sum to exactly 100.00 and respect min/max caps', () => {
    const selected = Array.from({ length: 16 }, (_, i) =>
        ({ ...makeStock({ ticker: `S${i}` }), growthScore: 95 - i * 4 }));
    const weighted = PB.computeWeights(selected, { minPct: 3, maxPct: 10 });
    const sum = weighted.reduce((acc, s) => acc + s.weightPct, 0);
    assert.equal(Math.round(sum * 100) / 100, 100);
    for (const s of weighted) {
        assert.ok(s.weightPct >= 3 - 1e-9 && s.weightPct <= 10 + 1e-9, `weight ${s.weightPct} within [3,10]`);
    }
});

test('weights: higher score never gets a smaller weight', () => {
    const selected = Array.from({ length: 15 }, (_, i) =>
        ({ ...makeStock({ ticker: `S${i}` }), growthScore: 90 - i * 3 }));
    const weighted = PB.computeWeights(selected, { minPct: 3, maxPct: 10 });
    for (let i = 1; i < weighted.length; i++) {
        assert.ok(weighted[i - 1].weightPct >= weighted[i].weightPct - 1e-9);
    }
});

test('weights: infeasible caps fall back to equal weight summing to 100', () => {
    // 5 stocks at max 10% can only reach 50 -> must fall back to equal 20% each
    const selected = Array.from({ length: 5 }, (_, i) =>
        ({ ...makeStock({ ticker: `S${i}` }), growthScore: 90 - i }));
    const weighted = PB.computeWeights(selected, { minPct: 3, maxPct: 10 });
    const sum = weighted.reduce((acc, s) => acc + s.weightPct, 0);
    assert.equal(Math.round(sum * 100) / 100, 100);
    for (const s of weighted) assert.equal(s.weightPct, 20);
});

// ---------- estimateFxCost ----------

test('fx: cost estimated on the US-listed (non-.TO) portion only', () => {
    const weighted = [
        { ...makeStock({ ticker: 'SHOP.TO' }), weightPct: 50 },
        { ...makeStock({ ticker: 'NVDA' }), weightPct: 50 },
    ];
    const fx = PB.estimateFxCost(weighted, 10000, 1.5);
    assert.equal(fx.usPortionCad, 5000);
    assert.equal(fx.costCad, 75);
});

test('fx: all-Canadian portfolio costs zero', () => {
    const weighted = [{ ...makeStock({ ticker: 'RY.TO' }), weightPct: 100 }];
    const fx = PB.estimateFxCost(weighted, 10000, 1.5);
    assert.equal(fx.costCad, 0);
});
