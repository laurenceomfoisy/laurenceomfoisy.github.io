// SoundHype Copy Deck — every explanatory word about metrics, as data.
// No DOM, no formatting logic beyond CopyDeck.format(). Loaded as a
// classic script in the browser (window.CopyDeck) and require()-able
// from node for tests. A later interpret.js maps stock values through
// `ranges` to pick the matching verdict.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.CopyDeck = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {

    const metrics = {
        operating_margin: {
            label: 'Operating Margin', unit: 'dec-pct', percentileOf: 'operating_margin',
            short: 'Out of every dollar of sales, the cents left after running the business (staff, rent, machines) — before taxes and interest.',
            why: 'Thin margins mean no room for error: one bad year and the profits are gone. Fat margins mean the company has pricing power — customers pay up because they want THIS product.',
            trap: 'Comparing margins across industries. A grocer at 4% can be a great business; a software company at 4% is broken. That is why we also show the percentile against the universe.',
            ranges: [
                { max: 0,    tone: 'bad',     verdict: 'Loses money on its own operations — every sale digs the hole deeper.' },
                { max: 0.10, tone: 'caution', verdict: 'Keeps {val} of each sales dollar — thin cushion, one rough year from losses.' },
                { max: 0.25, tone: 'fine',    verdict: 'Keeps {val} of each sales dollar — a solid, ordinary business.' },
                { max: Infinity, tone: 'good', verdict: 'Keeps {val} of each sales dollar — better than {pct}% of this universe. That is pricing power.' },
            ],
        },
        net_margin: {
            label: 'Net Margin', unit: 'dec-pct', percentileOf: 'net_margin',
            short: 'Out of every dollar of sales, the cents left as pure profit after everything — taxes, interest, one-off charges, all of it.',
            why: 'This is the bottom line, literally. It is what shareholders actually get to keep once every bill, lender, and tax office has been paid.',
            trap: 'A one-time asset sale or tax break can make a bad year look great, and a big writedown can make a fine year look like a disaster. Check operating margin too before you trust this number.',
            ranges: [
                { max: 0,    tone: 'bad',     verdict: 'Loses money after everything is paid — the whole operation is in the red.' },
                { max: 0.05, tone: 'caution', verdict: 'Keeps {val} of each sales dollar as pure profit — barely enough to matter.' },
                { max: 0.20, tone: 'fine',    verdict: 'Keeps {val} of each sales dollar as pure profit — a healthy, normal business.' },
                { max: Infinity, tone: 'good', verdict: 'Keeps {val} of each sales dollar as pure profit — beats {pct}% of this universe.' },
            ],
        },
        roe: {
            label: 'Return on Equity', unit: 'dec-pct',
            short: 'How much profit the company generates per dollar shareholders have invested and left in the business.',
            why: 'This is the report card on how well management turns your money into more money. High and steady is what you want to see year after year.',
            trap: 'A pile of debt can juice this number without the business getting any better — the leverage does the work, not the operations. Check safety before you get excited about a high number here.',
            ranges: [
                { max: 0,    tone: 'bad',     verdict: 'Destroys shareholder capital instead of growing it.' },
                { max: 0.08, tone: 'caution', verdict: 'Turns {val} of shareholder money into profit — weak, you could do better in an index fund.' },
                { max: 0.20, tone: 'fine',    verdict: 'Turns {val} of shareholder money into profit — a solid, respectable return.' },
                { max: Infinity, tone: 'good', verdict: 'Turns {val} of shareholder money into profit — a genuinely strong return.' },
            ],
        },
        fcf_yield: {
            label: 'Free Cash Flow Yield', unit: 'dec-pct',
            short: 'The actual cash the business throws off after running and reinvesting itself, compared to what you would pay to own it.',
            why: 'Cash does not lie the way accounting profit sometimes can. This is the money that is actually free to pay dividends, buy back shares, or pay down debt.',
            trap: 'Negative free cash flow is not automatically a red flag — a hypergrowth company plowing every dollar into expansion can burn cash on purpose. Only forgive this if revenue growth is above 30%; otherwise it is just burning cash.',
            ranges: [
                { max: 0,    tone: 'bad',     verdict: "Burns cash — unless it's hypergrowth doing it on purpose, that is a real problem." },
                { max: 0.02, tone: 'caution', verdict: 'Generates {val} in free cash relative to price — thin, barely self-funding.' },
                { max: 0.06, tone: 'fine',    verdict: 'Generates {val} in free cash relative to price — healthy and self-sustaining.' },
                { max: Infinity, tone: 'good', verdict: 'Generates {val} in free cash relative to price — genuinely strong cash generation.' },
            ],
        },
        forward_pe: {
            label: 'Forward Price-to-Earnings', unit: 'ratio',
            short: "What you are paying today for each dollar of the company's expected profit next year.",
            why: 'This is the market betting on the future. A low number means low expectations; a high number means the market is betting on big growth ahead.',
            trap: 'A cheap-looking number can be a value trap — the market often prices in a real problem you have not spotted yet. Cheap for no reason you can name is a reason to dig, not to buy.',
            ranges: [
                { max: 0,  tone: 'bad',     verdict: "No expected profits — you're paying for a story, not earnings." },
                { max: 15, tone: 'caution', verdict: 'Priced at {val}x next year\'s expected earnings — cheap usually has a reason, go find it.' },
                { max: 30, tone: 'fine',    verdict: 'Priced at {val}x next year\'s expected earnings — an ordinary, market-like price.' },
                { max: 60, tone: 'caution', verdict: 'Priced at {val}x next year\'s expected earnings — priced for success, little room to disappoint.' },
                { max: Infinity, tone: 'bad', verdict: 'Priced at {val}x next year\'s expected earnings — priced for perfection, any stumble gets punished.' },
            ],
        },
        trailing_pe: {
            label: 'Trailing Price-to-Earnings', unit: 'ratio',
            short: "What you are paying today for each dollar of the company's profit over the last twelve months.",
            why: 'This tells you how the market has valued what already happened. It is a snapshot of the past, not a promise about tomorrow.',
            trap: 'Last year is not next year — a great trailing number can precede a rough year, and vice versa. Treat this as context, not a verdict.',
            ranges: [
                { max: 0,  tone: 'bad',     verdict: "No profits over the past year to price against — you're paying for a story." },
                { max: 15, tone: 'caution', verdict: 'Priced at {val}x last year\'s earnings — cheap on the past, but the past is not a promise.' },
                { max: 30, tone: 'fine',    verdict: 'Priced at {val}x last year\'s earnings — an ordinary, market-like price.' },
                { max: 60, tone: 'caution', verdict: 'Priced at {val}x last year\'s earnings — a rich price for results that already happened.' },
                { max: Infinity, tone: 'bad', verdict: 'Priced at {val}x last year\'s earnings — even a great past does not justify this, next year has to be spectacular.' },
            ],
        },
        price_to_book: {
            label: 'Price-to-Book', unit: 'ratio',
            short: 'What you are paying today compared to the accounting value of everything the company owns minus what it owes.',
            why: 'This mattered most in an era of factories and inventory. Today most value lives in brands, code, and patents that never show up on the balance sheet.',
            trap: 'Comparing this across industries is close to meaningless — a bank or insurer lives and dies by book value, a software company does not even try. Outside banks and heavy industry, treat this as mostly noise.',
            ranges: [
                { max: 1,  tone: 'fine', verdict: 'Priced at {val}x accounting book value — cheap by this measure, but check why before assuming a bargain.' },
                { max: 5,  tone: 'fine', verdict: 'Priced at {val}x accounting book value — ordinary for most non-bank businesses today.' },
                { max: Infinity, tone: 'fine', verdict: 'Priced at {val}x accounting book value — mostly noise unless this is a bank or heavy-asset business.' },
            ],
        },
        dividend_yield: {
            label: 'Dividend Yield', unit: 'pct',
            short: 'The cash dividend paid out over the last year, as a percentage of what you would pay to own the stock today.',
            why: 'This is real cash landing in your account, not a paper gain you only realize by selling. It also signals how a company chooses to reward owners.',
            trap: 'A big fat yield often means the price has been falling, not that the company suddenly got generous. Check whether the payout is sustainable before treating it as free money.',
            ranges: [
                { max: 0.001, tone: 'fine', verdict: 'Pays nothing — normal for a growth company reinvesting everything into itself.' },
                { max: 2,     tone: 'fine', verdict: 'Pays {val} a year — a modest bonus on top of whatever the stock price does.' },
                { max: 5,     tone: 'good', verdict: 'Pays {val} a year — a real, meaningful income stream.' },
                { max: Infinity, tone: 'caution', verdict: 'Pays {val} a year — suspiciously generous, often a falling price rather than a gift.' },
            ],
        },
        debt_to_equity: {
            label: 'Debt vs. What Shareholders Own', unit: 'pct',
            short: 'Company debt compared to shareholder equity. 100% means it owes exactly as much as its owners have put in and retained.',
            why: 'Debt amplifies everything: gains in good times, disasters in bad times. Heavily indebted companies do not get second chances in a crisis.',
            trap: 'High-debt companies often show beautiful returns on equity — the debt IS the trick. If safety looks bad but profitability looks great, check this number first.',
            ranges: [
                { max: 50,  tone: 'good',    verdict: 'Barely leans on debt — it could pay everything off without breaking a sweat.' },
                { max: 100, tone: 'fine',    verdict: 'Borrows meaningfully but owns more than it owes. Normal for a grown-up company.' },
                { max: 200, tone: 'caution', verdict: 'Owes more than shareholders own. Fine while business is good — remember 2008 was not.' },
                { max: Infinity, tone: 'bad', verdict: 'Owes over twice what shareholders own. This company works for its lenders now.' },
            ],
        },
        current_ratio: {
            label: 'Current Ratio', unit: 'ratio',
            short: "What the company owns and can turn into cash within a year, compared to what it owes within a year.",
            why: 'This is the short-term survival check. A company can be brilliant long-term and still get wrecked by a bill it cannot pay next month.',
            trap: 'A number that is too high is not automatically good — it can mean idle cash sitting around instead of being put to work for shareholders.',
            ranges: [
                { max: 1,   tone: 'bad',     verdict: "May struggle to pay this year's bills with this year's assets." },
                { max: 1.5, tone: 'caution', verdict: 'Covers short-term bills {val} times over — thinner cushion than you would like.' },
                { max: 3,   tone: 'good',    verdict: 'Covers short-term bills {val} times over — comfortably solvent.' },
                { max: Infinity, tone: 'fine', verdict: 'Covers short-term bills {val} times over — hoarding cash, safe but lazy with it.' },
            ],
        },
        revenue_growth: {
            label: 'Revenue Growth', unit: 'dec-pct',
            short: 'How much more (or less) the company sold this year compared to last year.',
            why: 'Growing sales is the raw fuel for everything else — profits, cash flow, and eventually the stock price. Shrinking sales is a company running out of fuel.',
            trap: 'Growth bought by burning cash or piling on debt is not the same as growth earned by a better product. Check profitability and safety before paying up for a growth number alone.',
            ranges: [
                { max: 0,    tone: 'bad',     verdict: 'Shrinking — the business is selling less than it did a year ago.' },
                { max: 0.05, tone: 'caution', verdict: 'Sales grew {val} — barely keeping pace, not exciting.' },
                { max: 0.15, tone: 'fine',    verdict: 'Sales grew {val} — solid, steady growth.' },
                { max: 0.30, tone: 'good',    verdict: 'Sales grew {val} — genuinely fast growth, ahead of most companies.' },
                { max: Infinity, tone: 'good', verdict: 'Sales grew {val} — hypergrowth, expect a wild ride in both directions.' },
            ],
        },
        earnings_growth: {
            label: 'Earnings Growth', unit: 'dec-pct',
            short: 'How much more (or less) profit the company made this year compared to last year.',
            why: 'Profit growth is what eventually drags the stock price along with it — sales growth that never turns into profit growth is a company spinning its wheels.',
            trap: 'This number is noisier than revenue growth — a single tax break, lawsuit, or asset sale can swing it wildly. Check whether a move looks like a one-off or a trend.',
            ranges: [
                { max: 0,    tone: 'caution', verdict: "Profits fell — check if it's a one-off charge or the start of a trend." },
                { max: 0.10, tone: 'fine',    verdict: 'Profits grew {val} — modest, steady progress.' },
                { max: Infinity, tone: 'good', verdict: 'Profits grew {val} — real momentum in the bottom line.' },
            ],
        },
        momentum_6m: {
            label: '6-Month Price Momentum', unit: 'dec-pct',
            short: 'How much the stock price has moved over the last six months.',
            why: 'The market is a voting machine in the short run — momentum captures what other investors have already decided to believe about this company.',
            trap: 'Chasing a stock after it has already run hard means you are buying at the top of someone else\'s trade. Momentum works until, suddenly, it does not.',
            ranges: [
                { max: -0.2, tone: 'bad',     verdict: 'Down sharply over six months — the market has been actively souring on it.' },
                { max: 0,    tone: 'caution', verdict: 'Drifting lower over six months — no rush to chase it now.' },
                { max: 0.3,  tone: 'fine',    verdict: 'Up {val} over six months — steady, unremarkable strength.' },
                { max: 0.8,  tone: 'good',    verdict: 'Up {val} over six months — genuinely strong, the market likes this story.' },
                { max: Infinity, tone: 'caution', verdict: "Up {val} over six months — already up a lot, momentum works until it doesn't." },
            ],
        },
        momentum_1y: {
            label: '1-Year Price Momentum', unit: 'dec-pct',
            short: 'How much the stock price has moved over the last twelve months.',
            why: 'A full year smooths out short-term noise and shows whether the market has genuinely changed its mind about this company, not just had a good quarter.',
            trap: 'Buying purely because a stock has had a great year is performance-chasing — you are betting the crowd is right and early, not that you found something yourself.',
            ranges: [
                { max: -0.2, tone: 'bad',     verdict: 'Down sharply over the past year — the market has been actively souring on it.' },
                { max: 0,    tone: 'caution', verdict: 'Drifting lower over the past year — no rush to chase it now.' },
                { max: 0.3,  tone: 'fine',    verdict: 'Up {val} over a year — steady, unremarkable strength.' },
                { max: 0.8,  tone: 'good',    verdict: 'Up {val} over a year — genuinely strong, the market likes this story.' },
                { max: Infinity, tone: 'caution', verdict: "Up {val} over a year — already up a lot, momentum works until it doesn't." },
            ],
        },
        market_cap: {
            label: 'Market Cap', unit: 'usd',
            short: 'The total price tag to buy every share of the company — its size, in dollars, as the market sees it.',
            why: 'Size shapes everything else: how much it can move on one earnings beat, how much research covers it, how easily you can get in and out.',
            trap: "Big is not automatically safe and small is not automatically an opportunity — size only tells you the shape of the ride, not the quality of the driver.",
            ranges: [
                { max: 2e9,   tone: 'caution', verdict: 'A small company at {val} — lottery-ticket territory for a novice, moves fast in both directions.' },
                { max: 10e9,  tone: 'fine',     verdict: 'A small-to-mid company at {val} — sharper moves both ways than a large one.' },
                { max: 200e9, tone: 'fine',     verdict: 'A large, established company at {val} — steadier, well-covered by the market.' },
                { max: Infinity, tone: 'fine',  verdict: 'A giant at {val} — stability you can lean on, but slower growth from here.' },
            ],
        },
        'scores.profitability': {
            label: 'Profitability Score', unit: 'score',
            short: 'A blend of margins and return on equity, ranked against every other stock in this universe.',
            why: 'One number that answers "does this business actually make good money?" so you do not have to weigh three separate margin figures in your head.',
            trap: 'This is a percentile within THIS list, not a universal grade — a 90 here means it beats 90% of these 392 stocks, nothing more.',
            ranges: [
                { max: 40, tone: 'bad',  verdict: 'Bottom of this universe on profitability — margins and returns lag most peers here.' },
                { max: 70, tone: 'fine', verdict: 'Middle of this universe on profitability — nothing to write home about, nothing alarming either.' },
                { max: Infinity, tone: 'good', verdict: 'Beats most of this universe on profitability — genuinely strong margins and returns.' },
            ],
        },
        'scores.cash_flow': {
            label: 'Cash Flow Score', unit: 'score',
            short: 'A blend of free cash flow yield and cash generation, ranked against every other stock in this universe.',
            why: 'Profit on paper is an opinion; cash in the bank is a fact. This score tells you how well the company converts its business into real, spendable cash.',
            trap: 'This is a percentile within THIS list, not a universal grade — a 90 here means it beats 90% of these 392 stocks, nothing more.',
            ranges: [
                { max: 40, tone: 'bad',  verdict: 'Bottom of this universe on cash generation — thin or negative free cash flow relative to peers here.' },
                { max: 70, tone: 'fine', verdict: 'Middle of this universe on cash generation — adequate, unremarkable.' },
                { max: Infinity, tone: 'good', verdict: 'Beats most of this universe on cash generation — the business throws off real, usable cash.' },
            ],
        },
        'scores.safety': {
            label: 'Safety Score', unit: 'score',
            short: 'A blend of debt levels and short-term liquidity, ranked against every other stock in this universe.',
            why: 'This is the score that tells you how much a bad year could hurt. High-quality companies with fragile balance sheets can still get wiped out in a downturn.',
            trap: 'If this score is low but profitability is high, debt is likely doing the heavy lifting on those returns — check debt-to-equity before trusting the profitability number.',
            ranges: [
                { max: 40, tone: 'bad',  verdict: 'Bottom of this universe on safety — leverage or liquidity looks fragile next to peers here.' },
                { max: 70, tone: 'fine', verdict: 'Middle of this universe on safety — no glaring cracks, no exceptional cushion either.' },
                { max: Infinity, tone: 'good', verdict: 'Beats most of this universe on safety — a balance sheet built to survive a bad year.' },
            ],
        },
        'scores.quality': {
            label: 'Quality Score', unit: 'score',
            short: 'The blend of profitability, cash flow, and safety — the "is this a good business" score, without regard to price or momentum.',
            why: 'This strips out hype entirely and asks one question: if you owned the whole company, would you be proud of what it does with its money?',
            trap: 'This is a percentile within THIS list, not a universal grade — a 90 here means it beats 90% of these 392 stocks, nothing more.',
            ranges: [
                { max: 40, tone: 'bad',  verdict: 'Bottom of this universe on business quality — margins, cash, and safety all lag peers here.' },
                { max: 70, tone: 'fine', verdict: 'Middle of this universe on business quality — a decent, unremarkable business.' },
                { max: Infinity, tone: 'good', verdict: 'Beats most of this universe on business quality — a genuinely well-run company.' },
            ],
        },
        'scores.hype': {
            label: 'Hype Score', unit: 'score',
            short: 'A blend of growth and price momentum, ranked against every other stock in this universe — how much the market has noticed.',
            why: 'This is the excitement score, not the quality score. A stock can be pure hype with weak fundamentals, or a great business the market has not noticed yet.',
            trap: 'Do not confuse a high hype score with a good business — that is what the quality score is for. Chasing hype alone is how people buy tops.',
            ranges: [
                { max: 40, tone: 'fine', verdict: "The market hasn't noticed this one — could be a reason, could be an opportunity, dig deeper." },
                { max: 70, tone: 'fine', verdict: 'Middling attention from the market — neither ignored nor chased.' },
                { max: Infinity, tone: 'good', verdict: "The market has noticed this one — you're not early, growth and momentum are both running hot." },
            ],
        },
        'scores.overall': {
            label: 'Overall Score', unit: 'score',
            short: 'The final blend: 60% business quality (profits, cash, safety) + 40% hype (growth and price momentum).',
            why: 'One number to rank by — but it is a percentile among THESE 392 stocks, not a grade from the universe. A 92 beats 92% of this list, nothing more.',
            trap: 'Treating small differences as meaningful. 91 vs 89 is noise. 91 vs 60 is a real difference.',
            ranges: [
                { max: 40,  tone: 'bad',     verdict: 'Bottom half of this universe on both quality and momentum — the screener found little to like.' },
                { max: 70,  tone: 'fine',    verdict: 'Middle of the pack here — not damning, not exciting.' },
                { max: 85,  tone: 'good',    verdict: 'Beats most of this universe on the blend of quality and momentum.' },
                { max: Infinity, tone: 'good', verdict: 'Top shelf of this universe — strong business AND the market has noticed. Expect it to be expensive.' },
            ],
        },
    };

    function abbreviateUsd(v) {
        const sign = v < 0 ? '-' : '';
        const abs = Math.abs(v);
        if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
        if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(1)}B`;
        if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(1)}M`;
        if (abs >= 1e3)  return `${sign}$${(abs / 1e3).toFixed(1)}K`;
        return `${sign}$${Math.round(abs)}`;
    }

    function format(key, value) {
        const m = metrics[key];
        if (!m || value === null || value === undefined || Number.isNaN(value)) return '';
        switch (m.unit) {
            case 'dec-pct': return `${(value * 100).toFixed(1)}%`;
            case 'pct':     return `${value.toFixed(1)}%`;
            case 'ratio':   return value.toFixed(2);
            case 'usd':     return abbreviateUsd(value);
            case 'score':   return `${Math.round(value)}`;
            default:        return `${value}`;
        }
    }

    const GENERIC_MISSING = `Yahoo doesn't report this for {ticker} — treat it as a yellow flag, not a shrug.`;

    // Section copy — everything the dashboard (and later the simulator)
    // says that is not about one metric. Hand-written like the rest of the
    // deck; {curly} placeholders are filled by the UI at render time. Never
    // generated — the daily data refresh must never need a copy pass.
    const sections = {
        dashboard: {
            lede: 'Every stock we track, ranked by the overall score. A score is a class rank, not a grade — a 92 beats 92% of this universe, it does not mean "92% good". Click any row for the full read on that company.',
            learnCta: 'New here? Learn the method',
            simulateCta: 'Test a strategy',
            tableHint: 'Click a column header to re-rank. The ⓘ explains what each number actually measures — and how it can lie to you.',
            searchEmpty: 'Nothing matches that. We track the big US, Canadian and international names — if it is not here, we do not cover it. That is a data gap, not a verdict.',
        },
    };

    return { metrics, sections, format, GENERIC_MISSING };
});
