// SoundHype Wizard — shell, router, and shared state for the five-step
// guided picker. Depends on PortfolioBuilder (defaults), CopyDeck (metric
// copy) and Interpret (verdicts), all loaded as classic scripts before this
// file. DOM only — no test framework covers this file; it is verified with
// headless Chromium (see task brief).

const STEP_TITLES = ['The idea', 'Reading a stock', 'Your floor', 'Build', 'Homework & track'];

const STORAGE_KEY = 'soundhype_wizard';
const LEGACY_STORAGE_KEY = 'soundhype_builder';

function defaultWizardState() {
    return {
        amount: null,
        floor: Object.assign({}, PortfolioBuilder.DEFAULT_FLOOR),
        weights: Object.assign({}, PortfolioBuilder.DEFAULT_WEIGHTS),
        guardrails: { count: 18, sectorCapPct: 30, maxPosPct: 10, minPosPct: 3 },
        homework: {},
        visited: {},
        floorSaved: {},
    };
}

// Old three-tab UI stored `{floor: {fcf,current,debt,rev,mcap} (booleans),
// weights: {revenue_growth,earnings_growth,momentum,quality}, n, sectorCap,
// maxPos, minPos, ...}` under `soundhype_builder`. Translate its shape into
// the wizard's threshold-based floor + guardrails, once, the first time the
// wizard runs on a browser that has that legacy key but no wizard state yet.
function migrateLegacyState() {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    let legacy;
    try {
        legacy = JSON.parse(raw);
    } catch (e) {
        return null;
    }
    if (!legacy || typeof legacy !== 'object') return null;

    // Disabled toggle = threshold relaxed to "always passes". Sentinels are
    // finite (not +/-Infinity) so they round-trip through JSON.stringify —
    // Infinity serializes to `null`, which would corrupt the floor on the
    // very next saveState()/loadState() cycle.
    const state = defaultWizardState();
    const f = Object.assign({ fcf: true, current: true, debt: true, rev: true, mcap: true }, legacy.floor || {});
    state.floor = {
        hypergrowthRevenueGrowth: f.fcf ? PortfolioBuilder.DEFAULT_FLOOR.hypergrowthRevenueGrowth : -Number.MAX_VALUE,
        minCurrentRatio: f.current ? PortfolioBuilder.DEFAULT_FLOOR.minCurrentRatio : -Number.MAX_VALUE,
        maxDebtToEquity: f.debt ? PortfolioBuilder.DEFAULT_FLOOR.maxDebtToEquity : Number.MAX_VALUE,
        minRevenueGrowth: f.rev ? PortfolioBuilder.DEFAULT_FLOOR.minRevenueGrowth : -Number.MAX_VALUE,
        minMarketCap: f.mcap ? PortfolioBuilder.DEFAULT_FLOOR.minMarketCap : 0,
    };
    if (legacy.weights && typeof legacy.weights === 'object') {
        state.weights = Object.assign({}, state.weights, legacy.weights);
    }
    if (typeof legacy.n === 'number') state.guardrails.count = legacy.n;
    if (typeof legacy.sectorCap === 'number') state.guardrails.sectorCapPct = legacy.sectorCap;
    if (typeof legacy.maxPos === 'number') state.guardrails.maxPosPct = legacy.maxPos;
    if (typeof legacy.minPos === 'number') state.guardrails.minPosPct = legacy.minPos;
    return state;
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (saved && typeof saved === 'object') {
                const d = defaultWizardState();
                return {
                    amount: typeof saved.amount === 'number' ? saved.amount : d.amount,
                    floor: Object.assign({}, d.floor, saved.floor || {}),
                    weights: Object.assign({}, d.weights, saved.weights || {}),
                    guardrails: Object.assign({}, d.guardrails, saved.guardrails || {}),
                    homework: (saved.homework && typeof saved.homework === 'object') ? saved.homework : {},
                    visited: (saved.visited && typeof saved.visited === 'object') ? saved.visited : {},
                    floorSaved: (saved.floorSaved && typeof saved.floorSaved === 'object') ? saved.floorSaved : {},
                };
            }
        }
    } catch (e) { /* corrupted storage: fall through to migration/defaults */ }

    try {
        const migrated = migrateLegacyState();
        if (migrated) return migrated;
    } catch (e) { /* corrupted legacy storage: fall through to defaults */ }

    return defaultWizardState();
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(WizardState));
}

const WizardState = loadState();
const appData = { stocks: [], lastUpdated: '' };

// --- Shared render helpers (used by Tasks 4-7) ---------------------------

function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

// HTML-entity-escapes a string for safe interpolation into innerHTML/template
// literals. Backend-sourced stock fields (ticker, name, sector, ceo, summary)
// come from Yahoo Finance scrapes (portfolio_data.json, /api/add-ticker) and
// must never be trusted verbatim in markup. Not for use on values passed to
// setAttribute (which doesn't parse HTML — escaping there would corrupt the
// value, e.g. "AT&T" -> "AT&amp;T" in an aria-label).
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Appends each node to `container` preceded by a whitespace-only newline
// text node. Purely cosmetic for humans/tools reading serialized HTML
// (headless-Chromium DOM dumps, view-source) — repeated block elements
// built via appendChild land on one compacted line with no separator,
// unlike innerHTML-templated markup which keeps the source's literal
// newlines. Does not affect layout (whitespace collapses between block
// elements) or event listeners (nodes stay live, never round-tripped
// through a string).
function appendLines(container, nodes) {
    nodes.forEach((node) => {
        container.appendChild(document.createTextNode('\n'));
        container.appendChild(node);
    });
    container.appendChild(document.createTextNode('\n'));
}

// Renders one `.verdict-line`: metric label + display value (small caps /
// bold header row), the plain-English verdict sentence, and an ⓘ toggle
// that reveals an `.info-panel` built from CopyDeck.metrics[key] (short,
// why, and — if present — the trap).
function renderVerdictLine({ label, display, verdict, tone, key }) {
    const line = el('div', `verdict-line tone-${tone}`);

    const head = el('div', 'verdict-line-head');
    head.appendChild(el('span', 'verdict-label', label));
    head.appendChild(el('span', 'verdict-value', display));

    const info = key && CopyDeck.metrics[key];
    let panel = null;
    if (info) {
        const toggle = el('button', 'info-toggle', 'ⓘ');
        toggle.type = 'button';
        toggle.setAttribute('aria-label', `More about ${label}`);
        toggle.setAttribute('aria-expanded', 'false');
        head.appendChild(toggle);

        let panelHtml = '';
        if (info.short) panelHtml += `<p>${info.short}</p>`;
        if (info.why) panelHtml += `<p>${info.why}</p>`;
        if (info.trap) panelHtml += `<p><strong>The trap:</strong> ${info.trap}</p>`;
        panel = el('div', 'info-panel hidden', panelHtml);

        toggle.addEventListener('click', () => {
            const isHidden = panel.classList.toggle('hidden');
            toggle.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
        });
    }

    line.appendChild(head);
    line.appendChild(el('p', 'verdict-sentence', verdict));
    if (panel) line.appendChild(panel);

    return line;
}

// Looks a metric key up through Interpret + CopyDeck and renders it as a
// `.verdict-line` in one call — the workhorse every card and sheet uses so
// no numeric value ever reaches the DOM without going through a verdict.
function renderMetricLine(key, stock, universe) {
    const r = Interpret.interpret(key, stock, universe);
    const meta = CopyDeck.metrics[key];
    return renderVerdictLine({ label: meta ? meta.label : key, display: r.display, verdict: r.verdict, tone: r.tone, key });
}

// Renders one of the six `scores.*` as a labeled progress bar with the same
// ⓘ info-panel pattern as `.verdict-line` (short/why/trap from CopyDeck).
function renderScoreBar(key, stock, universe) {
    const r = Interpret.interpret(key, stock, universe);
    const meta = CopyDeck.metrics[key];
    const label = meta ? meta.label : key;
    const wrap = el('div', `score-bar tone-${r.tone}`);

    const head = el('div', 'score-bar-head');
    head.appendChild(el('span', 'score-bar-label', label));
    head.appendChild(el('span', 'score-bar-value', r.display));

    let panel = null;
    if (meta) {
        const toggle = el('button', 'info-toggle', 'ⓘ');
        toggle.type = 'button';
        toggle.setAttribute('aria-label', `More about ${label}`);
        toggle.setAttribute('aria-expanded', 'false');
        head.appendChild(toggle);

        let panelHtml = '';
        if (meta.short) panelHtml += `<p>${meta.short}</p>`;
        if (meta.why) panelHtml += `<p>${meta.why}</p>`;
        if (meta.trap) panelHtml += `<p><strong>The trap:</strong> ${meta.trap}</p>`;
        panel = el('div', 'info-panel hidden', panelHtml);

        toggle.addEventListener('click', () => {
            const isHidden = panel.classList.toggle('hidden');
            toggle.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
        });
    }

    wrap.appendChild(head);
    const track = el('div', 'score-bar-track');
    const fill = el('div', 'score-bar-fill');
    const pct = Math.max(0, Math.min(100, r.value === null ? 0 : r.value));
    fill.style.width = `${pct}%`;
    fill.style.background = `var(--tone-${r.tone})`;
    track.appendChild(fill);
    wrap.appendChild(track);
    if (panel) wrap.appendChild(panel);

    return wrap;
}

function formatUsdPrice(v) {
    if (v === null || v === undefined || !isFinite(v)) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

// First `n` sentences of a company summary, for the sheet's short blurb —
// full summaries run several paragraphs, we only want the opening context.
function firstSentences(text, n) {
    if (!text) return '';
    return text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, n).join(' ');
}

// Ported from old app.js `drawSparkline` — same viewBox/scaling. Quiet
// Wealthsimple-light palette: gray by default, muted green only when the
// series trends up. Thin stroke — sparklines are context, not the headline.
const SPARKLINE_STROKE_UP = '#1E7B3C';
const SPARKLINE_STROKE_DEFAULT = '#9BA69C';

function renderSparkline(prices, isPositive) {
    if (!prices || prices.length < 2) {
        return '<div class="sparkline-empty">No price trend</div>';
    }
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min === 0 ? 1 : max - min;
    const width = 280;
    const height = 40;
    const points = prices.map((price, index) => {
        const x = (index / (prices.length - 1)) * width;
        const y = height - ((price - min) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const strokeColor = isPositive ? SPARKLINE_STROKE_UP : SPARKLINE_STROKE_DEFAULT;
    return `<svg viewBox="0 0 ${width} ${height}" class="sparkline-svg" preserveAspectRatio="none">
        <polyline fill="none" stroke="${strokeColor}" stroke-width="1.5" points="${points}" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
}

// --- Steps -----------------------------------------------------------------

// Step 1 — "The idea": narrative + data honesty. Pure copy and layout, no
// state to read or write beyond the CTA's showStep(2). Tolerates rendering
// before appData.stocks has loaded (falls back to "hundreds").
function renderIdeaStep(root) {
    const count = appData.stocks && appData.stocks.length;
    // "392 stocks" when we know the count, "hundreds of stocks" when we
    // don't — both read correctly wherever a noun follows immediately.
    const countOf = count ? String(count) : 'hundreds of';

    let updatedLine = 'Every number here comes from Yahoo Finance. Refresh date not available yet — the data is still loading.';
    let staleHtml = '';
    if (appData.lastUpdated) {
        updatedLine = `Every number here comes from Yahoo Finance, last pulled on <strong>${appData.lastUpdated}</strong>. It is a snapshot, not a live feed — treat everything on this site as "true as of that date," not "true right now."`;
        const updated = new Date(appData.lastUpdated);
        // Raw (unfloored) days for the >7 comparison — matches renderDataStatus()'s
        // header-chip threshold exactly, so the two stale indicators on the page
        // never disagree in the [7,8) window. Floor only for the displayed count.
        const ageDays = (Date.now() - updated.getTime()) / 86400000;
        if (isFinite(ageDays) && ageDays > 7) {
            staleHtml = `<p class="tone-caution idea-stale">These numbers are ${Math.floor(ageDays)} days old — refresh before deciding anything.</p>`;
        }
    }

    root.innerHTML = `
        <h1>The idea</h1>
        <p class="idea-lede">A guided tool for building a small, aggressive stock portfolio out of the ${countOf} well-known companies on this list — and understanding every choice you make along the way. Five steps, no finance degree required.</p>
        <p>The theory behind it is simple: find sound businesses — ones that actually make money — right as the market starts noticing them. Too early and you are just guessing that the crowd will eventually show up. Too late and you are paying full price for news everyone already has, buying the top of someone else's story. This app hunts for the window in between: real financial health, plus a spark of momentum the market has only just started pricing in.</p>
        <p>It will not tell you what to buy. It will show you why a stock looks the way it does, in plain language you can actually check against your own judgment, and leave the final call to you. Every number you see from here on has a short, honest explanation sitting one click away — read those before you trust the headline figure.</p>

        <h2>The two scores</h2>
        <p>Every stock on the list gets boiled down to two numbers, and every ranking you will see for the rest of this app is built from them. Together, they decide where a company lands — not gut feel, not a hot tip from a group chat, not whatever is trending today.</p>
        <div class="score-grid">
            <div class="score-card score-card-quality">
                <span class="score-card-badge">Quality · 60%</span>
                <h3>Does it actually run a good business?</h3>
                <p>Profit margins, how much profit it squeezes out of shareholders' money, whether real cash is left after the bills—not just paper profit—and how much debt it is carrying. The boring half — and the half that keeps you from losing your shirt when the market turns. It gets the bigger weight on purpose: hype fades, a balance sheet does not lie for long.</p>
            </div>
            <div class="score-card score-card-hype">
                <span class="score-card-badge">Hype · 40%</span>
                <h3>Is it growing, and has the market noticed?</h3>
                <p>Revenue growth, earnings growth, and price momentum. The exciting half — and the half that can make you money fast or burn you just as fast. A great business nobody is watching yet can sit flat for years; this is the half that looks for the crowd starting to arrive.</p>
            </div>
        </div>

        <div class="callout">
            <p>A score of 92 does not mean 92/100. It means: <strong>beats 92% of the ${countOf} stocks</strong> in this list. A percentile among peers — nothing more. It says nothing about whether the price is right today, nothing about what happens next, and nothing about companies outside this list. Compare it to a class rank, not a test score.</p>
        </div>

        <h2>Where the numbers come from</h2>
        <div class="data-honesty">
            <p>${updatedLine}</p>
            ${staleHtml}
            <p>Numbers can be wrong, or missing entirely — Yahoo Finance is not perfect, and neither is the pipeline that pulls from it. When a company is missing a metric, that gets flagged right on the page — never quietly papered over, never defaulted to zero to make the math work.</p>
        </div>

        <h2>The disclaimer, bluntly</h2>
        <div class="disclaimer-box">
            <p>This is a homemade decision aid, built by one person and an AI on a kitchen-table budget. It is not investment advice, not a research report from a bank, and not a promise of anything. Nobody here is licensed to manage your money, and nobody is going to — you are the one signing the trade.</p>
            <p>The biggest risk in this whole exercise is not a bad number on this page. It is your own behavior: chasing winners after they have already run, panic-selling on a red day, checking prices every hour like it will change the outcome. The tool will call these out when it sees you doing them — that is the entire point of building it this way instead of just handing you a spreadsheet.</p>
        </div>

        <button type="button" class="step-cta" id="ideaCta">Learn to read one →</button>
    `;

    root.querySelector('#ideaCta').addEventListener('click', () => showStep(2));
}

// One card: ticker/name/sector, price + 1y move, sparkline, then the 4
// `verdictsForCard` lines. `universe` is always the FULL stock list (not
// the filtered/paginated view) so percentiles inside verdict lines stay
// meaningful — a percentile against 12 filtered rows would be noise.
function buildStockCard(stock, universe) {
    const card = el('article', 'stock-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open detail sheet for ${stock.ticker}`);

    const top = el('div', 'stock-card-top');
    top.appendChild(el('span', 'stock-card-ticker', esc(stock.ticker)));
    top.appendChild(el('span', 'stock-card-name', esc(stock.name || stock.ticker)));
    top.appendChild(el('span', 'sector-chip', esc(stock.sector || 'Unknown sector')));
    card.appendChild(top);

    const priceRow = el('div', 'stock-card-price-row');
    priceRow.appendChild(el('span', 'stock-card-price', formatUsdPrice(stock.price)));
    const mv = Interpret.interpret('momentum_1y', stock, universe);
    const moveText = mv.value === null ? mv.display : `${mv.value >= 0 ? '+' : ''}${mv.display}`;
    priceRow.appendChild(el('span', `stock-card-move tone-${mv.tone}`, `${moveText} (1y)`));
    card.appendChild(priceRow);

    card.appendChild(el('div', 'stock-card-sparkline', renderSparkline(stock.sparkline, (mv.value === null ? 0 : mv.value) >= 0)));

    const verdicts = el('div', 'card-verdicts');
    appendLines(verdicts, Interpret.verdictsForCard(stock, universe).map((line) => renderMetricLine(line.key, stock, universe)));
    card.appendChild(verdicts);

    function openIfNotInfo(e) {
        if (e.target.closest('.info-toggle') || e.target.closest('.info-panel')) return;
        openStockSheet(stock.ticker);
    }
    card.addEventListener('click', openIfNotInfo);
    card.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.info-toggle')) {
            e.preventDefault();
            openStockSheet(stock.ticker);
        }
    });

    return card;
}

// Ports the old app.js:632-680 add-ticker POST flow. The backend only
// exists when someone is running the local Flask app (app.py); the static
// GitHub Pages build has nowhere to send the POST, so the whole section
// stays hidden unless a HEAD /api/stocks probe succeeds.
function wireAddTickerForm(root, onStocksUpdated) {
    fetch('/api/stocks', { method: 'HEAD' })
        .then((r) => {
            if (r.ok) {
                const section = root.querySelector('#addTickerSection');
                if (section) section.classList.remove('hidden');
            }
        })
        .catch(() => { /* no local backend — static build, leave hidden */ });

    const addBtn = root.querySelector('#addTickerBtn');
    const addInput = root.querySelector('#addTickerInput');
    const addMsg = root.querySelector('#addTickerMsg');
    if (!addBtn || !addInput || !addMsg) return;

    async function submitAddTicker() {
        const ticker = addInput.value.trim().toUpperCase();
        if (!ticker) return;
        addBtn.disabled = true;
        addMsg.className = 'add-ticker-msg hidden';
        addMsg.textContent = '';
        try {
            const response = await fetch('/api/add-ticker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker }),
            });
            const result = await response.json();
            if (result.success) {
                addMsg.className = 'add-ticker-msg tone-good';
                addMsg.textContent = `${ticker} was successfully scraped, ranked, and saved.`;
                appData.stocks = result.stocks;
                addInput.value = '';
                onStocksUpdated();
            } else {
                addMsg.className = 'add-ticker-msg tone-bad';
                addMsg.textContent = `Error: ${result.error || 'Failed to fetch ticker details.'}`;
            }
        } catch (e) {
            addMsg.className = 'add-ticker-msg tone-bad';
            addMsg.textContent = 'Network connection failure. Make sure the backend server is running.';
        } finally {
            addBtn.disabled = false;
        }
    }
    addBtn.addEventListener('click', submitAddTicker);
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAddTicker(); });
}

// `?debug-sheet=TICKER` opens that stock's sheet right after render — the
// only way to drive `openStockSheet` from a one-shot headless Chromium dump
// (see task brief verification). Harmless in normal use, so it stays.
function maybeOpenDebugSheet() {
    const ticker = new URLSearchParams(location.search).get('debug-sheet');
    if (ticker) openStockSheet(ticker.toUpperCase());
}

// Plain-English name for each floor rule, used only in the trap example's
// thesis line below — must match FLOOR_RULES ids (fcf/current/debt/rev/mcap)
// and Teach.RULE_FIELDS exactly. Deliberately blunter than FLOOR_RULES'
// `title`/`warning` copy (those explain the rule; this names the disease).
const TEACH_RULE_PLAIN_NAMES = {
    fcf: 'burns cash',
    current: "can't cover this year's bills",
    debt: 'drowning in debt',
    rev: 'shrinking sales',
    mcap: 'too small to trust',
};

const TEACH_EYEBROWS = {
    strong: 'THE STRONG ONE',
    trap: 'THE TRAP',
    mediocre: 'THE MIDDLE OF THE PACK',
};

// One data-driven sentence per example kind. `strong`/`mediocre` are fixed
// copy (the lesson is the same for any stock that lands there); `trap` is
// built from that specific stock's hype score and the actual rules it fails
// — never a canned line, since the whole point of the trap example is
// "look how good the surface number is, then look what's underneath."
function teachThesis(kind, stock) {
    if (kind === 'strong') {
        return `Everything below is what "good" looks like — notice all four lines agree.`;
    }
    if (kind === 'trap') {
        const fails = Teach.rulesFailed(stock, PortfolioBuilder.DEFAULT_FLOOR);
        const hypeDisplay = esc(CopyDeck.format('scores.hype', stock.scores.hype));
        const names = esc(fails.map((id) => TEACH_RULE_PLAIN_NAMES[id] || id).join(', '));
        const ruleWord = fails.length === 1 ? 'rule' : 'rules';
        return `Hype score ${hypeDisplay}, and it still fails ${fails.length} junk-filter ${ruleWord}: ${names}. Don't let the overall score wave you through — it's 40% hype, and here hype is doing the hiding. Exciting price chart, sick balance sheet — this is the stock that hurts people.`;
    }
    if (kind === 'mediocre') {
        return 'Nothing wrong, nothing special — the market is full of these. Learning to shrug at them is the skill.';
    }
    return '';
}

// One worked-example block: eyebrow label, data-driven thesis, the stock's
// own card (same renderer the old universe list used), and an explicit
// "open the full sheet" link — the card is already a click target, but the
// link makes that discoverable for anyone scanning by keyboard or screen
// reader rather than hovering.
function buildTeachExample(kind, stock, universe) {
    const section = el('section', `teach-example teach-example-${kind}`);
    section.appendChild(el('span', 'teach-eyebrow', esc(TEACH_EYEBROWS[kind])));
    section.appendChild(el('p', 'teach-thesis', teachThesis(kind, stock)));
    section.appendChild(buildStockCard(stock, universe));

    const link = el('button', 'teach-sheet-link', 'Open the full sheet →');
    link.type = 'button';
    link.addEventListener('click', () => openStockSheet(stock.ticker));
    section.appendChild(link);

    return section;
}

// As-you-type search results (max 8, ticker + name rows). No list, no
// sector/sort/pagination — Step 2 is no longer a browse surface, so the only
// way to reach a specific company here is to already know roughly what
// you're looking for.
function renderTeachSearchResults(container, universe, query) {
    container.innerHTML = '';
    const q = query.trim().toLowerCase();
    if (!q) return;

    const matches = universe
        .filter((s) => (s.ticker || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q))
        .slice(0, 8);

    if (matches.length === 0) {
        container.appendChild(el('p', 'teach-search-empty', 'No matches.'));
        return;
    }

    matches.forEach((stock) => {
        const row = el('button', 'teach-search-row',
            `<span class="teach-search-ticker">${esc(stock.ticker)}</span><span class="teach-search-name">${esc(stock.name || stock.ticker)}</span>`);
        row.type = 'button';
        row.addEventListener('click', () => openStockSheet(stock.ticker));
        container.appendChild(row);
    });
}

// Step 2 — "Reading a stock": three worked examples (strong/trap/mediocre,
// picked by Teach.pickTeachingExamples) teach the four-line card format,
// then a numbered recap, then search-only lookup for anyone who already
// knows the ticker they want. Deliberately not a browse surface — that was
// the old 392-card list this step replaces.
function renderTeachStep(root) {
    const universe = appData.stocks || [];

    if (universe.length === 0) {
        root.innerHTML = `
            <h1>Reading a stock</h1>
            <p class="tone-na">Still loading the universe — hang tight.</p>
        `;
        maybeOpenDebugSheet();
        return;
    }

    const examples = Teach.pickTeachingExamples(universe, PortfolioBuilder.DEFAULT_FLOOR);

    root.innerHTML = `
        <h1>Reading a stock</h1>
        <p class="idea-lede">You do not need to read ${universe.length} stocks — the tool already filters and ranks every one of them for you. You need to be able to read ONE. Here are three that teach the whole skill.</p>

        <div class="teach-examples" id="teachExamples"></div>

        <section class="teach-recap">
            <h2>How to read any card</h2>
            <ol class="teach-recap-list">
                <li><strong>Overall score is a class rank, not a grade.</strong> A 68 doesn't mean 68/100 — it means the stock beats 68% of everything else on this list, nothing more.</li>
                <li><strong>The money line</strong> asks whether real cash is coming in the door — free cash flow or margins — not just profit on paper.</li>
                <li><strong>The safety line</strong> asks whether the balance sheet could survive a bad year — how much debt it carries, whether it can cover this year's bills.</li>
                <li><strong>The growth/momentum line</strong> asks whether sales are actually growing and whether the market has started to notice.</li>
            </ol>
        </section>

        <section class="teach-search">
            <h2>Curious about a specific company?</h2>
            <input type="search" class="universe-search teach-search-input" id="teachSearchInput" placeholder="Search by name or ticker">
            <div class="teach-search-results" id="teachSearchResults"></div>
        </section>

        <div class="add-ticker-section hidden" id="addTickerSection">
            <p class="add-ticker-label">Don't see a ticker? Add it — it gets pulled fresh from Yahoo Finance and scored the same way as everything else.</p>
            <div class="add-ticker-row">
                <input type="text" class="add-ticker-input" id="addTickerInput" placeholder="e.g. NVDA" maxlength="10">
                <button type="button" class="add-ticker-btn" id="addTickerBtn">Add ticker</button>
            </div>
            <p class="add-ticker-msg hidden" id="addTickerMsg"></p>
        </div>

        <button type="button" class="step-cta" id="teachCta">See what we filtered out →</button>
    `;

    const examplesRoot = root.querySelector('#teachExamples');
    const blocks = ['strong', 'trap', 'mediocre']
        .filter((kind) => examples[kind])
        .map((kind) => buildTeachExample(kind, examples[kind], universe));
    appendLines(examplesRoot, blocks);

    const searchInput = root.querySelector('#teachSearchInput');
    const searchResults = root.querySelector('#teachSearchResults');
    searchInput.addEventListener('input', () => {
        renderTeachSearchResults(searchResults, universe, searchInput.value);
    });

    root.querySelector('#teachCta').addEventListener('click', () => showStep(3));

    // Full re-render (not just the search results) on a successful add:
    // `universe` above is captured once per render and handed to every
    // example card for percentile math, and a fresh add could change which
    // stock Teach.pickTeachingExamples even picks.
    wireAddTickerForm(root, () => renderTeachStep(root));
    maybeOpenDebugSheet();
}

// Full-screen detail sheet for one stock. Top-level so Tasks 6/7 can call
// it directly from their own tables/lists.
function openStockSheet(ticker) {
    // Focus lives on whatever triggered this (a card, or another sheet's
    // control) — remember it before touching the DOM so closeSheet() can
    // hand it back later.
    const previouslyFocused = document.activeElement;

    // A sheet may already be open (e.g. a second card activated via
    // keyboard before the first sheet's Escape listener fires). Route
    // through the existing sheet's own closeSheet() — stored on the overlay
    // by the code below — rather than a bare .remove(), so its document-level
    // Escape listener is torn down too instead of leaking.
    document.querySelectorAll('.sheet-overlay').forEach((n) => {
        if (n._close) n._close(); else n.remove();
    });

    const universe = appData.stocks || [];
    const stock = universe.find((s) => s.ticker === ticker);
    if (!stock) return;

    const overlay = el('div', 'sheet-overlay');
    const sheet = el('div', 'sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    overlay.appendChild(sheet);

    function focusableEls() {
        return Array.from(sheet.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ));
    }

    function closeSheet() {
        overlay.remove();
        document.body.classList.remove('sheet-open');
        document.removeEventListener('keydown', onKeydown);
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    }
    overlay._close = closeSheet;

    function onKeydown(e) {
        if (e.key === 'Escape') {
            closeSheet();
            return;
        }
        if (e.key === 'Tab') {
            // Simple focus trap: wrap Tab/Shift+Tab between the first and
            // last focusable elements so background cards (still tabbable
            // in the DOM) never receive focus while the sheet is open.
            const focusables = focusableEls();
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    const closeBtn = el('button', 'sheet-close', 'Close ✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close detail sheet');
    closeBtn.addEventListener('click', closeSheet);
    sheet.appendChild(closeBtn);

    const header = el('div', 'sheet-header');
    header.appendChild(el('div', 'sheet-ticker', esc(stock.ticker)));
    header.appendChild(el('h1', 'sheet-name', esc(stock.name || stock.ticker)));
    const metaRow = el('div', 'sheet-meta-row');
    metaRow.appendChild(el('span', 'sector-chip', esc(stock.sector || 'Unknown sector')));
    metaRow.appendChild(el('span', 'sheet-price', formatUsdPrice(stock.price)));
    header.appendChild(metaRow);
    header.appendChild(renderMetricLine('market_cap', stock, universe));
    sheet.appendChild(header);

    const summaryBlock = el('div', 'sheet-summary');
    if (stock.summary) summaryBlock.appendChild(el('p', '', esc(firstSentences(stock.summary, 2))));
    summaryBlock.appendChild(el('p', 'sheet-ceo', `CEO: ${esc(stock.ceo || 'Not listed')}`));
    sheet.appendChild(summaryBlock);

    const scoreStrip = el('div', 'score-strip');
    appendLines(scoreStrip, ['scores.overall', 'scores.quality', 'scores.hype', 'scores.profitability', 'scores.cash_flow', 'scores.safety']
        .map((key) => renderScoreBar(key, stock, universe)));
    sheet.appendChild(scoreStrip);

    const SHEET_GROUPS = [
        { title: 'Does it make money?', keys: ['operating_margin', 'net_margin', 'roe'] },
        { title: 'Does cash actually come in?', keys: ['fcf_yield'] },
        { title: 'Can it survive trouble?', keys: ['debt_to_equity', 'current_ratio'] },
        { title: 'Is it growing?', keys: ['revenue_growth', 'earnings_growth'] },
        { title: 'Has the market noticed?', keys: ['momentum_6m', 'momentum_1y', 'scores.hype'] },
        { title: 'What are you paying?', keys: ['forward_pe', 'trailing_pe', 'price_to_book', 'dividend_yield'] },
    ];
    SHEET_GROUPS.forEach((group) => {
        const section = el('div', 'sheet-group');
        section.appendChild(el('h2', '', group.title));
        appendLines(section, group.keys.map((key) => renderMetricLine(key, stock, universe)));
        sheet.appendChild(section);
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
    document.addEventListener('keydown', onKeydown);

    document.body.appendChild(overlay);
    document.body.classList.add('sheet-open');
    closeBtn.focus();
}

// Step 3 — "Set your floor": the five quality-floor rules as explained
// cards with live kill counts. Each rule maps to exactly one field on
// WizardState.floor (same shape as PortfolioBuilder.DEFAULT_FLOOR).
// Disabling a rule sets that field to its disabled sentinel (see
// migrateLegacyState's comment on why these are finite, not +/-Infinity)
// rather than tracking a separate on/off flag — "enabled" is always
// derivable from WizardState.floor alone, so nothing can drift out of sync
// across a reload. Copy adapted from the old three-tab UI's `title=`
// tooltips (old index.html:295-315), same voice as Steps 1-2.
const FLOOR_RULES = [
    {
        id: 'fcf',
        field: 'hypergrowthRevenueGrowth',
        disabledValue: -Number.MAX_VALUE,
        title: 'Positive free cash flow',
        protects: 'Keeps out companies that depend on investors’ goodwill to survive because they burn more cash than they bring in — unless they’re a hypergrowth company burning cash on purpose to grow.',
        warning: 'You are now allowing companies that burn cash and aren’t growing fast enough to justify it.',
        min: 0, max: 1, step: 0.01,
        thresholdLabel: (v) => `Hypergrowth exception: companies growing revenue faster than ${Math.round(v * 100)}%/yr are allowed to burn cash`,
    },
    {
        id: 'current',
        field: 'minCurrentRatio',
        disabledValue: -Number.MAX_VALUE,
        title: 'Current ratio ≥ 1',
        protects: 'Keeps out companies that may not be able to pay the bills coming due this year with what they can turn into cash this year.',
        warning: 'You are now allowing companies that may not be able to pay this year’s bills with this year’s assets.',
        min: 0.2, max: 3, step: 0.1,
        thresholdLabel: (v) => `Minimum current ratio: ${v.toFixed(1)}`,
    },
    {
        id: 'debt',
        field: 'maxDebtToEquity',
        disabledValue: Number.MAX_VALUE,
        title: 'Debt-to-equity ≤ 2.0×',
        protects: 'Keeps out companies so loaded with debt that a bad year could wipe out shareholders before it even touches the lenders.',
        warning: 'You are now allowing companies that owe more — sometimes far more — than shareholders actually own.',
        min: 50, max: 500, step: 10,
        thresholdLabel: (v) => `Maximum debt-to-equity: ${(v / 100).toFixed(1)}×`,
    },
    {
        id: 'rev',
        field: 'minRevenueGrowth',
        disabledValue: -Number.MAX_VALUE,
        title: 'Revenue growing (YoY > 0)',
        protects: 'Keeps out companies whose sales are shrinking — a growth portfolio holding a shrinking business defeats the purpose.',
        warning: 'You are now allowing companies whose sales are shrinking, not growing — the opposite of what a growth portfolio is supposed to hold.',
        min: -0.1, max: 0.2, step: 0.01,
        thresholdLabel: (v) => `Minimum revenue growth: ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%/yr`,
    },
    {
        id: 'mcap',
        field: 'minMarketCap',
        disabledValue: 0,
        title: 'Market cap ≥ $2B',
        protects: 'Keeps out companies small enough to be lottery-ticket territory — more volatile, thinner trading, less scrutinized than a novice should take on.',
        warning: 'You are now allowing small, thinly-traded companies — lottery-ticket territory for a novice.',
        min: 0, max: 10e9, step: 0.5e9,
        thresholdLabel: (v) => `Minimum market cap: $${(v / 1e9).toFixed(1)}B`,
    },
];

function floorAllDisabledConfig() {
    const cfg = {};
    FLOOR_RULES.forEach((r) => { cfg[r.field] = r.disabledValue; });
    return cfg;
}

function floorRuleEnabled(rule) {
    return WizardState.floor[rule.field] !== rule.disabledValue;
}

// Cache of "last value the user actually set" for each rule, so switching a
// rule off and back on restores where it was instead of snapping to the
// shipped default. Persisted on WizardState.floorSaved (not reset on
// render) rather than kept in module scope: showStep re-renders Step 3 on
// every navigation, so a module-scope stash was wiped by an ordinary visit
// to another step and back, silently reverting the threshold to the
// shipped default the next time the rule was re-enabled. It is kept
// separate from WizardState.floor itself because that shape must match
// PortfolioBuilder.DEFAULT_FLOOR exactly.
function floorEffectiveValue(rule) {
    if (floorRuleEnabled(rule)) return WizardState.floor[rule.field];
    if (rule.id in WizardState.floorSaved) return WizardState.floorSaved[rule.id];
    return PortfolioBuilder.DEFAULT_FLOOR[rule.field];
}

// "This rule alone removes N of {universe.length}" — universe run through
// applyQualityFloor with every OTHER rule at its disabled sentinel and this
// one at its current/last threshold. Computed against the full universe
// (appData.stocks), not the current survivor set, so kill counts never
// compound with each other.
function floorRuleKillCount(rule, universe) {
    const cfg = floorAllDisabledConfig();
    cfg[rule.field] = floorEffectiveValue(rule);
    const survivors = PortfolioBuilder.applyQualityFloor(universe, cfg);
    return universe.length - survivors.length;
}

function floorSurvivorCount(universe) {
    return PortfolioBuilder.applyQualityFloor(universe, WizardState.floor).length;
}

// Builds one full-width rule card. `notifyChange` is called after every
// commit (toggle flip or slider drag) so the caller can refresh every
// card's kill count plus the survivor bar — kill counts are cheap (392
// stocks x 5 rules) so a full recompute on every change is simpler than
// tracking which cards actually need updating, and stays correct even
// though only the changed rule's own count could, in principle, change.
function buildFloorCard(rule, universe, notifyChange) {
    const card = el('article', 'floor-card');

    const head = el('div', 'floor-card-head');
    head.appendChild(el('h3', 'floor-card-title', rule.title));

    const toggleLabel = el('label', 'floor-toggle');
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.className = 'floor-toggle-input';
    toggleInput.setAttribute('aria-label', `Turn the "${rule.title}" rule on or off`);
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(el('span', 'floor-toggle-track', '<span class="floor-toggle-thumb"></span>'));
    head.appendChild(toggleLabel);
    card.appendChild(head);

    card.appendChild(el('p', 'floor-card-protects', rule.protects));

    const thresholdRow = el('div', 'floor-threshold-row');
    const thresholdLabel = el('label', 'floor-threshold-label', '');
    thresholdLabel.setAttribute('for', `floorThresh-${rule.id}`);
    const rangeInput = document.createElement('input');
    rangeInput.type = 'range';
    rangeInput.id = `floorThresh-${rule.id}`;
    rangeInput.min = String(rule.min);
    rangeInput.max = String(rule.max);
    rangeInput.step = String(rule.step);
    thresholdRow.appendChild(thresholdLabel);
    thresholdRow.appendChild(rangeInput);
    card.appendChild(thresholdRow);

    const killLine = el('p', 'floor-kill', '');
    card.appendChild(killLine);

    const warningLine = el('p', 'floor-warning tone-caution hidden', rule.warning);
    card.appendChild(warningLine);

    function commit(enabled, value) {
        if (enabled) {
            WizardState.floor[rule.field] = value;
            WizardState.floorSaved[rule.id] = value;
        } else {
            WizardState.floorSaved[rule.id] = WizardState.floor[rule.field];
            WizardState.floor[rule.field] = rule.disabledValue;
        }
        saveState();
        notifyChange();
    }

    toggleInput.addEventListener('change', () => {
        if (toggleInput.checked) {
            const restore = rule.id in WizardState.floorSaved ? WizardState.floorSaved[rule.id] : PortfolioBuilder.DEFAULT_FLOOR[rule.field];
            commit(true, restore);
        } else {
            commit(false);
        }
    });

    rangeInput.addEventListener('input', () => {
        commit(true, Number(rangeInput.value));
    });

    function refresh() {
        const enabled = floorRuleEnabled(rule);
        const value = floorEffectiveValue(rule);
        toggleInput.checked = enabled;
        rangeInput.value = String(value);
        rangeInput.disabled = !enabled;
        thresholdLabel.textContent = rule.thresholdLabel(value);
        const kill = floorRuleKillCount(rule, universe);
        killLine.innerHTML = enabled
            ? `This rule alone removes <strong>${kill}</strong> of ${universe.length}.`
            : `Turned on, this rule would remove <strong>${kill}</strong> of ${universe.length}.`;
        card.classList.toggle('floor-card-off', !enabled);
        warningLine.classList.toggle('hidden', enabled);
    }

    return { node: card, refresh };
}

// Sticky survivor bar: total survivors under every currently-enabled rule
// combined, plus the "Rank the survivors" CTA into Step 4.
function buildFloorBar(universe) {
    const bar = el('div', 'floor-bar');
    const inner = el('div', 'floor-bar-inner');
    const textWrap = el('div', 'floor-bar-text');
    const countLine = el('div', 'floor-bar-count', '');
    const messageLine = el('p', 'floor-bar-message hidden', '');
    textWrap.appendChild(countLine);
    textWrap.appendChild(messageLine);
    inner.appendChild(textWrap);

    const cta = el('button', 'step-cta floor-bar-cta', 'Rank the survivors →');
    cta.type = 'button';
    cta.addEventListener('click', () => showStep(4));
    inner.appendChild(cta);

    bar.appendChild(inner);

    function refresh() {
        const survivors = floorSurvivorCount(universe);
        countLine.innerHTML = `<strong>${survivors}</strong> of ${universe.length} survive your floor`;
        bar.classList.remove('tone-caution-bg', 'tone-bad-bg');
        messageLine.classList.add('hidden');
        messageLine.textContent = '';
        const minCount = (WizardState.guardrails && WizardState.guardrails.count) || 18;
        if (survivors < minCount) {
            bar.classList.add('tone-bad-bg');
            messageLine.textContent = `That is fewer survivors than your portfolio needs (at least ${minCount}) — loosen a rule before moving on.`;
            messageLine.classList.remove('hidden');
        } else if (survivors < 40) {
            bar.classList.add('tone-caution-bg');
            messageLine.textContent = 'Your floor is tighter than your portfolio — loosen something or accept fewer picks.';
            messageLine.classList.remove('hidden');
        }
    }

    return { node: bar, refresh };
}

function renderFloorStep(root) {
    const universe = appData.stocks || [];

    if (universe.length === 0) {
        root.innerHTML = `
            <h1>Set your floor</h1>
            <p class="tone-na">Still loading the universe — hang tight.</p>
        `;
        return;
    }

    root.innerHTML = `
        <h1>Set your floor</h1>
        <p>Before we rank anything, we throw out the junk. Each rule below removes companies with a specific disease. You can turn any of them off — but you'll be told what you're letting in.</p>
        <div class="floor-cards" id="floorCards"></div>
        <div class="floor-spacer"></div>
    `;

    const cardsRoot = root.querySelector('#floorCards');
    const cardEls = {};

    function refreshAll() {
        FLOOR_RULES.forEach((rule) => cardEls[rule.id].refresh());
        bar.refresh();
    }

    FLOOR_RULES.forEach((rule) => {
        cardEls[rule.id] = buildFloorCard(rule, universe, refreshAll);
        cardsRoot.appendChild(cardEls[rule.id].node);
    });

    const bar = buildFloorBar(universe);
    root.appendChild(bar.node);

    refreshAll();
}

// Step 4/5 — "Build" and "Homework & track": both steps rank against the
// SAME survivor set (WizardState.floor) and build the SAME weighted
// allocation (WizardState.weights + guardrails), so this pipeline is
// factored out here rather than duplicated — Step 5's study sheets always
// describe exactly what Step 4's table shows, even if a user jumps straight
// to #step-5 without visiting Step 4 first.
function computeAllocation(universe) {
    const survivors = PortfolioBuilder.applyQualityFloor(universe, WizardState.floor);
    const ranked = PortfolioBuilder.computeGrowthScores(survivors, WizardState.weights);
    const picked = PortfolioBuilder.selectPortfolio(ranked, {
        n: WizardState.guardrails.count,
        sectorCapPct: WizardState.guardrails.sectorCapPct,
    });
    const weighted = PortfolioBuilder.computeWeights(picked, {
        minPct: WizardState.guardrails.minPosPct,
        maxPct: WizardState.guardrails.maxPosPct,
    });
    return { survivors, ranked, picked, weighted };
}

// Re-walks the exact greedy pass PortfolioBuilder.selectPortfolio uses (rank
// order, sector cap, dedup by company) but records which candidates were
// rejected purely for hitting their sector's cap. selectPortfolio itself
// only returns the picks, not the reasons, and the core module is out of
// scope for this task — so this mirrors its branches exactly (same order,
// same conditions) rather than guessing from the output.
function computeSectorCapSkips(ranked, guardrails) {
    const n = guardrails.count;
    const sectorCapPct = guardrails.sectorCapPct;
    const maxPerSector = Math.max(1, Math.floor(n * sectorCapPct / 100));
    const perSector = {};
    const seenCompanies = new Set();
    const skips = [];
    let pickedCount = 0;
    for (const s of ranked) {
        if (pickedCount >= n) break;
        const company = s.name || s.ticker;
        const sector = s.sector || 'Unknown';
        if (seenCompanies.has(company)) continue; // dual share class, not a cap skip
        if ((perSector[sector] || 0) >= maxPerSector) {
            skips.push({ ticker: s.ticker, sector, capPct: sectorCapPct });
            continue;
        }
        perSector[sector] = (perSector[sector] || 0) + 1;
        seenCompanies.add(company);
        pickedCount++;
    }
    return skips;
}

// The four inputs to a growth score, each as its raw contribution
// (weight_i * percentile_i) — mirrors PortfolioBuilder.computeGrowthScores'
// own math exactly (same series, same percentile fn) so the drivers shown
// always add up to the score displayed. Used by the "why it's here" line.
function growthDrivers(stock, survivors, weights) {
    const w = Object.assign({}, PortfolioBuilder.DEFAULT_WEIGHTS, weights || {});
    const revSeries = survivors.map((s) => s.revenue_growth);
    const earnSeries = survivors.map((s) => s.earnings_growth);
    const momOf = (s) => (s.momentum_6m + s.momentum_1y) / 2;
    const momSeries = survivors.map(momOf);
    const pct = (series, v) => PortfolioBuilder.computePercentile(series, v);

    const drivers = [
        { key: 'revenue_growth', label: 'revenue growth', weight: w.revenue_growth, pctile: pct(revSeries, stock.revenue_growth), isScore: false },
        { key: 'earnings_growth', label: 'earnings growth', weight: w.earnings_growth, pctile: pct(earnSeries, stock.earnings_growth), isScore: false },
        { key: 'momentum', label: 'momentum', weight: w.momentum, pctile: pct(momSeries, momOf(stock)), isScore: false },
        { key: 'quality', label: 'quality', weight: w.quality, pctile: (stock.scores && isFinite(stock.scores.quality)) ? stock.scores.quality : 0, isScore: true },
    ];
    drivers.forEach((d) => { d.contribution = d.weight * d.pctile; });
    drivers.sort((a, b) => b.contribution - a.contribution);
    return drivers;
}

// Top-2 drivers by contribution, e.g. "Here mostly for momentum (94th pct)
// and revenue growth (88th)."
function whyItsHereLine(stock, survivors, weights) {
    const drivers = growthDrivers(stock, survivors, weights);
    const top = drivers.slice(0, 2);
    if (top.every((d) => d.contribution <= 0)) return 'Squeaked in — no single metric here stands out.';
    const parts = top.map((d, i) => `${d.label} (${Math.round(d.pctile)}th${i === 0 ? ' pct' : ''})`);
    return `Here mostly for ${parts.join(' and ')}.`;
}

function formatCad(v) {
    if (v === null || v === undefined || !isFinite(v)) return 'N/A';
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);
}

// Ported from old app.js's STUDY_CHECKLIST_ITEMS, rephrased to match the
// task brief's five items (one-sentence explanation, why it's in the
// portfolio, TipRanks cross-check, a sell trigger, accepting a 40% drawdown).
const STUDY_CHECKLIST_ITEMS = [
    'I can explain in one sentence what this company does and who pays it money.',
    "I can explain why it's in this portfolio — which score(s) earned it a spot.",
    'I checked the analyst consensus (e.g. TipRanks) and looked into any disagreement with this score.',
    "I've named one specific thing that would make me sell it.",
    'I accept this position could drop 40%+ in a bad year, and I would not panic-sell.',
];

// WizardState.homework[ticker] is a 5-item boolean array matching
// STUDY_CHECKLIST_ITEMS by index. Missing/malformed entries default to all
// unchecked rather than throwing, so a corrupted or legacy value never
// blocks the sheet from rendering.
function homeworkArr(ticker) {
    const arr = WizardState.homework[ticker];
    if (Array.isArray(arr) && arr.length === STUDY_CHECKLIST_ITEMS.length) return arr;
    return STUDY_CHECKLIST_ITEMS.map(() => false);
}

function sheetComplete(ticker) {
    return homeworkArr(ticker).every(Boolean);
}

// Weight-slider copy adapted from old index.html:330-342 tooltips.
const WEIGHT_SLIDER_DEFS = [
    { key: 'revenue_growth', label: 'Revenue growth', meaning: 'How fast sales grew over the last year — the most direct evidence a business is expanding.' },
    { key: 'earnings_growth', label: 'Earnings growth', meaning: 'How fast profits grew. Noisier than revenue (one-off events distort it), hence the lower default weight.' },
    { key: 'momentum', label: 'Momentum (6m + 1y)', meaning: 'Price performance over the last 6 months and year — recent winners tend to keep winning a little, for a while. This is the disciplined version of "buy what\'s booming."' },
    { key: 'quality', label: 'Quality (tiebreaker)', meaning: 'The screener’s fundamental quality score — profitability, cash flow, safety. Favors real businesses over pure stories.' },
];

// Guardrail copy adapted from old index.html:352-364 tooltips.
const GUARDRAIL_DEFS = [
    { key: 'count', label: 'Portfolio size', meaning: 'How many stocks to hold. Fewer means each pick matters more; beyond ~25 you are rebuilding an index fund.', min: 10, max: 25, step: 1, suffix: '' },
    { key: 'sectorCapPct', label: 'Max per sector', meaning: 'Largest share of holdings from a single sector. Stops an accidental all-in bet on one theme.', min: 10, max: 100, step: 5, suffix: '%' },
    { key: 'maxPosPct', label: 'Max position', meaning: 'Largest single position. Caps how much one blow-up can hurt you.', min: 5, max: 15, step: 1, suffix: '%' },
    { key: 'minPosPct', label: 'Min position', meaning: 'Smallest position worth holding. Below this a stock cannot move the needle either way.', min: 1, max: 5, step: 1, suffix: '%' },
];

// Builds one allocation-table row: rank, clickable stock (-> openStockSheet)
// with its "why it's here" line, sector, weight %, and (only when an amount
// is set) the CAD amount. `survivors` is the same set computeGrowthScores
// ranked against, so the percentiles inside whyItsHereLine line up with the
// score actually shown.
function buildAllocationRow(stock, rank, survivors, hasAmount) {
    const tr = document.createElement('tr');
    tr.className = 'allocation-row';

    const rankTd = document.createElement('td');
    rankTd.className = 'allocation-rank';
    rankTd.textContent = String(rank);
    tr.appendChild(rankTd);

    const stockTd = document.createElement('td');
    const wrap = el('div', 'allocation-stock');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', `Open detail sheet for ${stock.ticker}`);
    wrap.appendChild(el('span', 'allocation-ticker', esc(stock.ticker)));
    wrap.appendChild(el('span', 'allocation-name', esc(stock.name || stock.ticker)));
    wrap.appendChild(el('p', 'allocation-why', esc(whyItsHereLine(stock, survivors, WizardState.weights))));
    wrap.addEventListener('click', () => openStockSheet(stock.ticker));
    wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openStockSheet(stock.ticker);
        }
    });
    stockTd.appendChild(wrap);
    tr.appendChild(stockTd);

    const sectorTd = document.createElement('td');
    sectorTd.appendChild(el('span', 'sector-chip', esc(stock.sector || 'Unknown sector')));
    tr.appendChild(sectorTd);

    const weightTd = document.createElement('td');
    weightTd.className = 'val-bold';
    weightTd.textContent = `${stock.weightPct.toFixed(2)}%`;
    tr.appendChild(weightTd);

    if (hasAmount) {
        const amountTd = document.createElement('td');
        amountTd.className = 'val-bold';
        amountTd.textContent = formatCad(WizardState.amount * stock.weightPct / 100);
        tr.appendChild(amountTd);
    }

    return tr;
}

// Step 4 — "Build": amount, weight sliders (auto-balancing), a live top-10
// preview, guardrails, and the resulting allocation table + FX line. Every
// dynamic piece funnels through refreshAll() so a single slider drag stays
// consistent across the preview, the table, the shortfall warning, the
// sector-cap footnote, and the FX line in one pass.
function renderBuildStep(root) {
    const universe = appData.stocks || [];

    if (universe.length === 0) {
        root.innerHTML = `
            <h1>Build</h1>
            <p class="tone-na">Still loading the universe — hang tight.</p>
        `;
        return;
    }

    root.innerHTML = `
        <h1>Build</h1>
        <p>This is where your floor and your priorities turn into an actual list of tickers and weights. Move a slider, watch the table below change — that is the whole point of doing this yourself instead of copying someone's stock tips.</p>

        <section class="build-amount">
            <label class="build-amount-label" for="buildAmountInput">How much are you investing?</label>
            <div class="build-amount-row">
                <span class="build-amount-prefix">$</span>
                <input type="number" id="buildAmountInput" class="build-amount-input" min="0" step="100" inputmode="decimal" placeholder="e.g. 5000">
                <span class="build-amount-suffix">CAD</span>
            </div>
            <p class="build-amount-hint">Leave this blank to browse weights only — dollar amounts show up below only once you fill this in. Nothing here is a default; it's only ever what you actually type.</p>
        </section>

        <section class="build-weights">
            <h2>Growth scoring</h2>
            <p>Survivors are ranked by percentile on each metric below, then blended by these weights. Drag one and the other three rebalance automatically so they always add to 100%.</p>
            <div class="weight-sliders" id="weightSliders"></div>
        </section>

        <section class="build-preview">
            <h2>Top 10 right now</h2>
            <ol class="preview-list" id="previewList"></ol>
            <p class="preview-note">Watch what your sliders do here.</p>
        </section>

        <section class="build-guardrails">
            <h2>Guardrails</h2>
            <p>Caps that stop the math from handing you 18 AI stocks.</p>
            <div class="guardrail-grid" id="guardrailGrid"></div>
        </section>

        <section class="build-allocation">
            <h2>Your allocation</h2>
            <p class="allocation-shortfall hidden" id="allocShortfall"></p>
            <div class="allocation-empty hidden" id="allocEmpty"></div>
            <div class="allocation-table-wrap" id="allocationWrap">
                <table class="allocation-table" id="allocationTable">
                    <thead id="allocationThead"></thead>
                    <tbody id="allocationBody"></tbody>
                </table>
            </div>
            <p class="allocation-skips" id="allocationSkips"></p>
            <p class="allocation-fx hidden" id="allocationFx"></p>
        </section>

        <button type="button" class="step-cta" id="buildCta">Do the homework →</button>
    `;

    // --- Amount ---
    const amountInput = root.querySelector('#buildAmountInput');
    amountInput.value = (typeof WizardState.amount === 'number') ? String(WizardState.amount) : '';
    amountInput.addEventListener('input', () => {
        const raw = amountInput.value.trim();
        if (raw === '') {
            WizardState.amount = null;
        } else {
            const n = Number(raw);
            WizardState.amount = (isFinite(n) && n > 0) ? n : null;
        }
        saveState();
        refreshAll();
    });

    // --- Weight sliders ---
    const slidersRoot = root.querySelector('#weightSliders');
    const sliderEls = {};
    WEIGHT_SLIDER_DEFS.forEach((def) => {
        const item = el('div', 'weight-slider-item');
        const head = el('div', 'weight-slider-head');
        head.appendChild(el('span', 'weight-slider-label', esc(def.label)));
        const valEl = el('span', 'weight-slider-value', '');
        head.appendChild(valEl);
        item.appendChild(head);
        item.appendChild(el('p', 'weight-slider-meaning', esc(def.meaning)));
        const range = document.createElement('input');
        range.type = 'range';
        range.min = '0';
        range.max = '100';
        range.step = '1';
        range.className = 'weight-slider-range';
        range.setAttribute('aria-label', `${def.label} weight`);
        item.appendChild(range);
        const warn = el('p', 'weight-slider-warning tone-caution hidden', '');
        item.appendChild(warn);
        slidersRoot.appendChild(item);
        sliderEls[def.key] = { valEl, range, warn };

        range.addEventListener('input', () => {
            const newValue = Number(range.value);
            const w = WizardState.weights;
            const diff = newValue - w[def.key];
            const otherKeys = WEIGHT_SLIDER_DEFS.map((d) => d.key).filter((k) => k !== def.key);
            const sumOthers = otherKeys.reduce((sum, k) => sum + w[k], 0);
            otherKeys.forEach((k) => {
                const proportion = sumOthers > 0 ? w[k] / sumOthers : 1 / otherKeys.length;
                w[k] = Math.max(0, w[k] - diff * proportion);
            });
            w[def.key] = newValue;
            saveState();
            refreshAll();
        });
    });

    function refreshWeightSliders() {
        WEIGHT_SLIDER_DEFS.forEach((def) => {
            const { valEl, range } = sliderEls[def.key];
            const v = Math.round(WizardState.weights[def.key]);
            range.value = String(v);
            valEl.textContent = `${v}%`;
        });
        const momWarn = sliderEls.momentum.warn;
        if (WizardState.weights.momentum > 50) {
            momWarn.textContent = "That much momentum is performance-chasing with extra steps — you're betting the recent past repeats.";
            momWarn.classList.remove('hidden');
        } else {
            momWarn.classList.add('hidden');
        }
        const qualWarn = sliderEls.quality.warn;
        if (Math.round(WizardState.weights.quality) <= 0) {
            qualWarn.textContent = 'Nothing anchors this to real businesses anymore.';
            qualWarn.classList.remove('hidden');
        } else {
            qualWarn.classList.add('hidden');
        }
    }

    // --- Guardrails ---
    const guardrailRoot = root.querySelector('#guardrailGrid');
    const guardrailEls = {};
    GUARDRAIL_DEFS.forEach((def) => {
        const item = el('div', 'guardrail-item');
        const head = el('div', 'guardrail-head');
        head.appendChild(el('span', 'guardrail-label', esc(def.label)));
        const valEl = el('span', 'guardrail-value', '');
        head.appendChild(valEl);
        item.appendChild(head);
        item.appendChild(el('p', 'guardrail-meaning', esc(def.meaning)));
        const range = document.createElement('input');
        range.type = 'range';
        range.min = String(def.min);
        range.max = String(def.max);
        range.step = String(def.step);
        range.setAttribute('aria-label', def.label);
        item.appendChild(range);
        guardrailRoot.appendChild(item);
        guardrailEls[def.key] = { valEl, range };

        range.addEventListener('input', () => {
            WizardState.guardrails[def.key] = Number(range.value);
            saveState();
            refreshAll();
        });
    });

    function refreshGuardrails() {
        GUARDRAIL_DEFS.forEach((def) => {
            const v = WizardState.guardrails[def.key];
            guardrailEls[def.key].range.value = String(v);
            guardrailEls[def.key].valEl.textContent = `${v}${def.suffix}`;
        });
    }

    // --- Allocation pipeline: preview, table, shortfall, skips, FX ---
    function refreshAllocationHead(hasAmount) {
        const thead = root.querySelector('#allocationThead');
        thead.innerHTML = '';
        const tr = document.createElement('tr');
        ['#', 'Stock', 'Sector', 'Weight'].concat(hasAmount ? ['Amount'] : []).forEach((h) => {
            const th = document.createElement('th');
            th.textContent = h;
            tr.appendChild(th);
        });
        thead.appendChild(tr);
    }

    function refreshAll() {
        refreshWeightSliders();
        refreshGuardrails();

        const survivors = PortfolioBuilder.applyQualityFloor(universe, WizardState.floor);
        const ranked = PortfolioBuilder.computeGrowthScores(survivors, WizardState.weights);

        const previewList = root.querySelector('#previewList');
        previewList.innerHTML = '';
        appendLines(previewList, ranked.slice(0, 10).map((s) => {
            const li = el('li', 'preview-item');
            li.appendChild(el('span', 'preview-ticker', esc(s.ticker)));
            li.appendChild(el('span', 'preview-name', esc(s.name || s.ticker)));
            li.appendChild(el('span', 'preview-score', s.growthScore.toFixed(1)));
            return li;
        }));

        const picked = PortfolioBuilder.selectPortfolio(ranked, {
            n: WizardState.guardrails.count,
            sectorCapPct: WizardState.guardrails.sectorCapPct,
        });
        const weighted = PortfolioBuilder.computeWeights(picked, {
            minPct: WizardState.guardrails.minPosPct,
            maxPct: WizardState.guardrails.maxPosPct,
        });

        const shortfallEl = root.querySelector('#allocShortfall');
        const emptyEl = root.querySelector('#allocEmpty');
        const wrap = root.querySelector('#allocationWrap');
        const skipsEl = root.querySelector('#allocationSkips');
        const fxEl = root.querySelector('#allocationFx');

        if (weighted.length === 0) {
            wrap.classList.add('hidden');
            shortfallEl.classList.add('hidden');
            skipsEl.textContent = '';
            fxEl.classList.add('hidden');
            emptyEl.classList.remove('hidden');
            emptyEl.innerHTML = '';
            emptyEl.appendChild(el('p', 'tone-bad', 'Your floor left nothing to build an allocation from.'));
            const link = el('button', 'step-cta', 'Go loosen it in Step 3 →');
            link.type = 'button';
            link.addEventListener('click', () => showStep(3));
            emptyEl.appendChild(link);
            return;
        }
        emptyEl.classList.add('hidden');
        wrap.classList.remove('hidden');

        if (weighted.length < WizardState.guardrails.count) {
            shortfallEl.textContent = `Only ${weighted.length} of the ${WizardState.guardrails.count} stocks you asked for are available — loosen your floor (Step 3) or the sector cap to fill the rest.`;
            shortfallEl.classList.remove('hidden');
        } else {
            shortfallEl.classList.add('hidden');
        }

        const hasAmount = typeof WizardState.amount === 'number' && WizardState.amount > 0;
        refreshAllocationHead(hasAmount);

        const body = root.querySelector('#allocationBody');
        body.innerHTML = '';
        appendLines(body, weighted.map((stock, i) => buildAllocationRow(stock, i + 1, survivors, hasAmount)));

        const skips = computeSectorCapSkips(ranked, WizardState.guardrails);
        skipsEl.textContent = skips.length
            ? 'SKIPPED: ' + skips.map((s) => `${s.ticker} — ${s.sector} already at your ${s.capPct}% cap.`).join('  ·  ')
            : '';

        if (hasAmount) {
            const fx = PortfolioBuilder.estimateFxCost(weighted, WizardState.amount, 1.5);
            fxEl.textContent = `≈ ${formatCad(fx.costCad)} eaten by currency conversion on the US-listed part — one-time, only hurts if you churn.`;
            fxEl.classList.remove('hidden');
        } else {
            fxEl.classList.add('hidden');
        }
    }

    root.querySelector('#buildCta').addEventListener('click', () => showStep(5));

    refreshAll();
}

// Builds one collapsible study sheet: company blurb, its 4 card verdicts,
// score drivers, and the 5-item checklist. `onChange` is called after every
// checkbox toggle so the caller can refresh the shared progress line + the
// export button's enabled state.
function buildStudySheet(stock, survivors, universe, onChange) {
    const details = document.createElement('details');
    details.className = 'study-sheet';

    const summary = document.createElement('summary');
    summary.className = 'study-sheet-summary';
    summary.appendChild(el('span', 'study-sheet-ticker', esc(stock.ticker)));
    summary.appendChild(el('span', 'study-sheet-name', esc(stock.name || stock.ticker)));
    summary.appendChild(el('span', 'study-sheet-weight', `${stock.weightPct.toFixed(2)}%`));
    const statusBadge = el('span', 'study-sheet-status', '');
    summary.appendChild(statusBadge);
    details.appendChild(summary);

    const body = el('div', 'study-sheet-body');

    if (stock.summary) body.appendChild(el('p', 'study-sheet-blurb', esc(firstSentences(stock.summary, 2))));

    const openBtn = el('button', 'study-sheet-open-btn', 'Open full detail sheet →');
    openBtn.type = 'button';
    openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openStockSheet(stock.ticker);
    });
    body.appendChild(openBtn);

    const verdictsWrap = el('div', 'study-sheet-verdicts');
    appendLines(verdictsWrap, Interpret.verdictsForCard(stock, universe).map((line) => renderMetricLine(line.key, stock, universe)));
    body.appendChild(verdictsWrap);

    const drivers = growthDrivers(stock, survivors, WizardState.weights);
    const driversWrap = el('div', 'study-sheet-drivers');
    driversWrap.appendChild(el('h3', '', 'Score drivers'));
    const list = el('ul', 'study-sheet-drivers-list');
    drivers.forEach((d) => {
        const metricLine = d.isScore ? `quality score of ${Math.round(d.pctile)}` : `${Math.round(d.pctile)}th percentile`;
        list.appendChild(el('li', '', `${esc(d.label)} — ${metricLine}, ${Math.round(d.weight)}% of the blend`));
    });
    driversWrap.appendChild(list);
    body.appendChild(driversWrap);

    const checklistWrap = el('div', 'study-sheet-checklist');
    checklistWrap.appendChild(el('h3', '', 'The checklist'));
    STUDY_CHECKLIST_ITEMS.forEach((item, idx) => {
        const label = el('label', 'study-check-item');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!homeworkArr(stock.ticker)[idx];
        cb.addEventListener('change', () => {
            const arr = homeworkArr(stock.ticker).slice();
            arr[idx] = cb.checked;
            WizardState.homework[stock.ticker] = arr;
            saveState();
            refreshStatus();
            onChange();
        });
        label.appendChild(cb);
        label.appendChild(el('span', '', esc(item)));
        checklistWrap.appendChild(label);
    });
    body.appendChild(checklistWrap);

    details.appendChild(body);

    function refreshStatus() {
        const complete = sheetComplete(stock.ticker);
        const done = homeworkArr(stock.ticker).filter(Boolean).length;
        statusBadge.textContent = complete ? 'Done' : `${done}/${STUDY_CHECKLIST_ITEMS.length}`;
        statusBadge.classList.toggle('tone-good', complete);
        statusBadge.classList.toggle('tone-na', !complete);
        details.classList.toggle('study-sheet-complete', complete);
    }
    refreshStatus();

    return details;
}

function renderStudySheets(root, weighted, survivors, universe) {
    const container = root.querySelector('#studySheets');
    container.innerHTML = '';

    function updateProgress() {
        const done = weighted.filter((s) => sheetComplete(s.ticker)).length;
        const progressEl = root.querySelector('#homeworkProgress');
        if (progressEl) progressEl.textContent = `${done} of ${weighted.length} sheets done`;
        const exportBtn = root.querySelector('#exportCsvBtn');
        if (exportBtn) {
            const allDone = done === weighted.length;
            exportBtn.disabled = !allDone;
            exportBtn.textContent = allDone ? 'Download CSV' : 'Finish the homework first';
        }
    }

    appendLines(container, weighted.map((stock) => buildStudySheet(stock, survivors, universe, updateProgress)));
    updateProgress();
}

// Ports old app.js's `exportBuilderCsv` — same header shape, extended to
// drop the Amount column entirely when no amount is set rather than writing
// a fabricated $0 figure.
function exportAllocationCsv(weighted) {
    if (!weighted.length) return;
    const hasAmount = typeof WizardState.amount === 'number' && WizardState.amount > 0;
    const escCsv = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['Ticker', 'Company', 'Sector', 'Growth Score', 'Weight %'].concat(hasAmount ? ['Amount CAD'] : []).join(',');
    const lines = weighted.map((s) => {
        const row = [escCsv(s.ticker), escCsv(s.name), escCsv(s.sector), s.growthScore.toFixed(1), s.weightPct.toFixed(2)];
        if (hasAmount) row.push((WizardState.amount * s.weightPct / 100).toFixed(2));
        return row.join(',');
    });
    const blob = new Blob([header + '\n' + lines.join('\n') + '\n'], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'soundhype-allocation.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

function wireExport(root, weighted) {
    const btn = root.querySelector('#exportCsvBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        exportAllocationCsv(weighted);
    });
}

// --- Tracker ("What you actually did") ------------------------------------
// Ports old app.js's mock-portfolio add/list/remove logic, reading and
// writing the SAME `soundhype_portfolio` localStorage key so holdings
// entered in the old three-tab UI still show up here.
const PORTFOLIO_STORAGE_KEY = 'soundhype_portfolio';

function loadPortfolio() {
    try {
        const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function savePortfolio(items) {
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(items));
}

function buildTrackerRow(item, idx, universe, onChange) {
    const tr = document.createElement('tr');
    const masterStock = universe.find((s) => s.ticker === item.ticker);
    const currentPrice = masterStock ? masterStock.price : null;
    const name = masterStock ? masterStock.name : item.ticker;
    const costBasis = item.buyPrice * item.shares;
    const currentVal = (isFinite(currentPrice) ? currentPrice : item.buyPrice) * item.shares;
    const gain = currentVal - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;

    const stockTd = document.createElement('td');
    const wrap = el('div', 'tracker-stock');
    wrap.appendChild(el('span', 'tracker-ticker', esc(item.ticker)));
    wrap.appendChild(el('span', 'tracker-name', esc(name)));
    stockTd.appendChild(wrap);
    tr.appendChild(stockTd);

    const sharesTd = document.createElement('td');
    sharesTd.textContent = item.shares.toLocaleString(undefined, { maximumFractionDigits: 4 });
    tr.appendChild(sharesTd);

    const paidTd = document.createElement('td');
    paidTd.textContent = formatUsdPrice(item.buyPrice);
    tr.appendChild(paidTd);

    const nowTd = document.createElement('td');
    nowTd.textContent = masterStock ? formatUsdPrice(currentPrice) : 'N/A';
    tr.appendChild(nowTd);

    const valTd = document.createElement('td');
    valTd.className = 'val-bold';
    valTd.textContent = formatUsdPrice(currentVal);
    tr.appendChild(valTd);

    const gainTd = document.createElement('td');
    gainTd.className = `val-bold ${gain >= 0 ? 'gain-positive' : 'gain-negative'}`;
    gainTd.textContent = `${gain >= 0 ? '+' : ''}${formatUsdPrice(gain)} (${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)`;
    tr.appendChild(gainTd);

    const actionTd = document.createElement('td');
    const removeBtn = el('button', 'tracker-remove-btn', 'Remove');
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => {
        const items = loadPortfolio();
        items.splice(idx, 1);
        savePortfolio(items);
        onChange();
    });
    actionTd.appendChild(removeBtn);
    tr.appendChild(actionTd);

    return tr;
}

function wireTracker(root, universe) {
    const form = root.querySelector('#trackerForm');
    const tickerInput = root.querySelector('#trackerTicker');
    const sharesInput = root.querySelector('#trackerShares');
    const priceInput = root.querySelector('#trackerPrice');

    function refresh() {
        const items = loadPortfolio();
        const emptyEl = root.querySelector('#trackerEmpty');
        const table = root.querySelector('#trackerTable');
        const body = root.querySelector('#trackerBody');
        body.innerHTML = '';
        if (items.length === 0) {
            emptyEl.classList.remove('hidden');
            table.classList.add('hidden');
            return;
        }
        emptyEl.classList.add('hidden');
        table.classList.remove('hidden');
        appendLines(body, items.map((item, idx) => buildTrackerRow(item, idx, universe, refresh)));
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ticker = tickerInput.value.trim().toUpperCase();
        const shares = parseFloat(sharesInput.value);
        const price = parseFloat(priceInput.value);
        if (!ticker || !isFinite(shares) || shares <= 0 || !isFinite(price) || price <= 0) return;

        const items = loadPortfolio();
        const existing = items.find((it) => it.ticker === ticker);
        if (existing) {
            const oldCost = existing.buyPrice * existing.shares;
            const newCost = price * shares;
            existing.shares += shares;
            existing.buyPrice = (oldCost + newCost) / existing.shares;
        } else {
            items.push({ ticker, shares, buyPrice: price });
        }
        savePortfolio(items);
        tickerInput.value = '';
        sharesInput.value = '';
        priceInput.value = '';
        refresh();
    });

    refresh();
}

// Step 5 — "Homework & track": the gate, one collapsible study sheet per
// allocation row, CSV export (locked until every sheet is checked off), and
// the "what you actually did" tracker.
function renderHomeworkStep(root) {
    const universe = appData.stocks || [];

    if (universe.length === 0) {
        root.innerHTML = `
            <h1>Homework &amp; track</h1>
            <p class="tone-na">Still loading the universe — hang tight.</p>
        `;
        return;
    }

    const { survivors, weighted } = computeAllocation(universe);

    root.innerHTML = `
        <h1>Homework &amp; track</h1>
        <div class="homework-gate">
            <p><strong>You do not own a stock until you can explain it.</strong> One sheet per holding — check every box or don't buy.</p>
        </div>
        <div id="studySection"></div>
        <section class="tracker">
            <h2>What you actually did</h2>
            <p>Record what you actually bought — the tool only knows what you tell it.</p>
            <form class="tracker-form" id="trackerForm">
                <input type="text" id="trackerTicker" placeholder="Ticker, e.g. NVDA" maxlength="10" required>
                <input type="number" id="trackerShares" placeholder="Shares" min="0" step="any" required>
                <input type="number" id="trackerPrice" placeholder="Price paid" min="0" step="any" required>
                <button type="submit" class="tracker-add-btn">Add</button>
            </form>
            <p class="tracker-empty hidden" id="trackerEmpty">Nothing tracked yet.</p>
            <div class="tracker-table-wrap">
                <table class="tracker-table hidden" id="trackerTable">
                    <thead>
                        <tr><th>Stock</th><th>Shares</th><th>Paid</th><th>Now</th><th>Value</th><th>Gain</th><th></th></tr>
                    </thead>
                    <tbody id="trackerBody"></tbody>
                </table>
            </div>
        </section>
    `;

    const studySection = root.querySelector('#studySection');
    if (weighted.length === 0) {
        studySection.appendChild(el('p', 'tone-bad', 'Nothing to study yet — your floor (Step 3) left no allocation to build homework from.'));
        const link = el('button', 'step-cta', 'Back to Step 3 →');
        link.type = 'button';
        link.addEventListener('click', () => showStep(3));
        studySection.appendChild(link);
    } else {
        studySection.innerHTML = `
            <p class="homework-progress" id="homeworkProgress"></p>
            <div class="study-sheets" id="studySheets"></div>
            <section class="homework-export">
                <h2>Export &amp; buy</h2>
                <p>Wealthsimple wants percentage weights, not dollar amounts, and it supports fractional shares — so you never have to round to whole shares or convert weights into exact dollar figures yourself. Enter each ticker, then its weight % from the table below (or the CAD amount, if you set one).</p>
                <button type="button" class="step-cta homework-export-btn" id="exportCsvBtn" disabled>Finish the homework first</button>
            </section>
        `;
        renderStudySheets(root, weighted, survivors, universe);
        wireExport(root, weighted);
    }

    wireTracker(root, universe);
}

const STEPS = {
    1: { title: STEP_TITLES[0], render: renderIdeaStep },
    2: { title: STEP_TITLES[1], render: renderTeachStep },
    3: { title: STEP_TITLES[2], render: renderFloorStep },
    4: { title: STEP_TITLES[3], render: renderBuildStep },
    5: { title: STEP_TITLES[4], render: renderHomeworkStep },
};

// --- Router / shell --------------------------------------------------------

let currentStep = null;

function renderProgressRail() {
    const rail = document.getElementById('progressRail');
    rail.innerHTML = '';
    STEP_TITLES.forEach((title, i) => {
        const n = i + 1;
        const btn = el('button', 'rail-step',
            `<span class="rail-num">${n}</span><span class="rail-title">${title}</span>`);
        btn.type = 'button';
        btn.addEventListener('click', () => showStep(n));
        rail.appendChild(btn);
    });
}

function updateProgressRail(n) {
    const rail = document.getElementById('progressRail');
    Array.from(rail.children).forEach((btn, i) => {
        const stepNum = i + 1;
        btn.classList.toggle('active', stepNum === n);
        btn.classList.toggle('visited', !!WizardState.visited[stepNum]);
    });
}

function showStep(n) {
    if (!STEPS[n]) return;
    const root = document.getElementById('stepRoot');
    WizardState.visited[n] = true;
    STEPS[n].render(root);
    updateProgressRail(n);
    currentStep = n;
    if (location.hash !== '#step-' + n) location.hash = 'step-' + n;
    saveState();
}

function renderDataStatus() {
    const chip = document.getElementById('dataStatus');
    if (!appData.lastUpdated) {
        chip.textContent = '';
        return;
    }
    const updated = new Date(appData.lastUpdated);
    const ageDays = (Date.now() - updated.getTime()) / 86400000;
    const stale = isFinite(ageDays) && ageDays > 7;
    chip.textContent = `Refreshed: ${appData.lastUpdated}`;
    chip.classList.toggle('stale', stale);
    chip.title = stale ? 'This data is more than 7 days old.' : '';
}

async function init() {
    renderProgressRail();
    try {
        const res = await fetch('portfolio_data.json');
        if (!res.ok) throw new Error();
        const data = await res.json();
        appData.stocks = data.stocks;
        appData.lastUpdated = data.last_updated;
    } catch (e) {
        document.getElementById('stepRoot').innerHTML =
            '<p class="tone-bad">Could not load the stock data. If you are offline, that is why. Otherwise, tell Laurence the site is broken.</p>';
        return;
    }
    renderDataStatus();
    const fromHash = parseInt((location.hash.match(/step-(\d)/) || [])[1], 10);
    showStep(fromHash >= 1 && fromHash <= 5 ? fromHash : 1);
}

window.addEventListener('hashchange', () => {
    const n = parseInt((location.hash.match(/step-(\d)/) || [])[1], 10);
    if (n >= 1 && n <= 5 && n !== currentStep) showStep(n);
});

init();
