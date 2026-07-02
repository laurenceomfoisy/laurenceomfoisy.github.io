// SoundHype Wizard — shell, router, and shared state for the five-step
// guided picker. Depends on PortfolioBuilder (defaults), CopyDeck (metric
// copy) and Interpret (verdicts), all loaded as classic scripts before this
// file. DOM only — no test framework covers this file; it is verified with
// headless Chromium (see task brief).

const STEP_TITLES = ['The idea', 'The universe', 'Your floor', 'Build', 'Homework & track'];

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

// Ported from old app.js `drawSparkline` — same viewBox/scaling, colors
// swapped to the CSS vars already defined in style.css's :root.
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
    const strokeColor = isPositive ? 'var(--color-success)' : 'var(--color-danger)';
    return `<svg viewBox="0 0 ${width} ${height}" class="sparkline-svg" preserveAspectRatio="none">
        <polyline fill="none" stroke="${strokeColor}" stroke-width="2" points="${points}" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
}

// --- Steps (Tasks 4-7 replace these render bodies) ------------------------

function stubStep(title) {
    return {
        title,
        render(root) {
            root.innerHTML = `<h1>${title}</h1><p>Coming in a later task.</p>`;
        },
    };
}

// Step 1 — "The idea": narrative + data honesty. Pure copy and layout, no
// state to read or write beyond the CTA's showStep(2). Tolerates rendering
// before appData.stocks has loaded (falls back to "hundreds").
function renderIdeaStep(root) {
    const count = appData.stocks && appData.stocks.length;
    // "392 stocks" when we know the count, "hundreds of stocks" when we
    // don't — both read correctly wherever a noun follows immediately.
    const countOf = count ? String(count) : 'hundreds of';
    // "Meet the 392 →" / "Meet the hundreds →" — no trailing noun, so no "of".
    const countBare = count ? String(count) : 'hundreds';

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

        <button type="button" class="step-cta" id="ideaCta">Meet the ${countBare} →</button>
    `;

    root.querySelector('#ideaCta').addEventListener('click', () => showStep(2));
}

// Step 2 — "Meet the universe": the full stock list as scannable cards,
// each carrying its verdict lines, plus a detail sheet with the full
// interpreted breakdown. State (search/sector/sort/pagination) lives at
// module scope and resets whenever the step is (re)entered, but persists
// across in-step re-renders (typing, filtering) so focus/scroll are not
// lost on every keystroke — only the card list re-renders, not the controls.
let universeQuery = '';
let universeSector = '';
let universeSort = 'overall';
let universeVisible = 25;

const UNIVERSE_SORT_OPTIONS = [
    { value: 'overall', key: 'scores.overall', label: 'Best blend first' },
    { value: 'quality', key: 'scores.quality', label: 'Best businesses first' },
    { value: 'hype', key: 'scores.hype', label: 'Most market attention first' },
    { value: 'momentum6m', key: 'momentum_6m', label: 'Biggest 6-month movers first' },
    { value: 'revgrowth', key: 'revenue_growth', label: 'Fastest sales growth first' },
];

function filteredSortedUniverse() {
    const q = universeQuery.trim().toLowerCase();
    let list = appData.stocks.filter((s) => {
        if (universeSector && s.sector !== universeSector) return false;
        if (q && !((s.ticker || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q))) return false;
        return true;
    });
    const sortOpt = UNIVERSE_SORT_OPTIONS.find((o) => o.value === universeSort) || UNIVERSE_SORT_OPTIONS[0];
    list = list.slice().sort((a, b) => {
        const av = Interpret.getValue(a, sortOpt.key);
        const bv = Interpret.getValue(b, sortOpt.key);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
    });
    return list;
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

function renderUniverseStep(root) {
    const universe = appData.stocks || [];

    if (universe.length === 0) {
        root.innerHTML = `
            <h1>The universe</h1>
            <p>Every stock below is scored against the others — here's the whole universe, best blend first.</p>
            <p class="tone-na">Still loading the universe — hang tight.</p>
        `;
        maybeOpenDebugSheet();
        return;
    }

    // Reset search/sector/sort/pagination each time the step is (re)entered
    // (e.g. hopping to step 1 and back) — matches the comment above the
    // state vars. Within a single visit, input/change handlers below mutate
    // these and call refreshList() directly so typing doesn't nuke focus.
    universeQuery = '';
    universeSector = '';
    universeSort = 'overall';
    universeVisible = 25;

    const sectors = Array.from(new Set(universe.map((s) => s.sector).filter(Boolean))).sort();

    root.innerHTML = `
        <h1>The universe</h1>
        <p>Every stock below is scored against the other ${universe.length - 1} — here's the whole universe, best blend first.</p>
        <div class="universe-controls">
            <input type="search" class="universe-search" id="universeSearch" placeholder="Search by name or ticker" value="${universeQuery.replace(/"/g, '&quot;')}">
            <select class="universe-select" id="universeSectorSelect">
                <option value="">All sectors</option>
                ${sectors.map((s) => `<option value="${esc(s)}"${s === universeSector ? ' selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
            <select class="universe-select" id="universeSortSelect">
                ${UNIVERSE_SORT_OPTIONS.map((o) => `<option value="${o.value}"${o.value === universeSort ? ' selected' : ''}>${o.label}</option>`).join('')}
            </select>
        </div>
        <div class="add-ticker-section hidden" id="addTickerSection">
            <p class="add-ticker-label">Don't see a ticker? Add it — it gets pulled fresh from Yahoo Finance and scored the same way as everything else.</p>
            <div class="add-ticker-row">
                <input type="text" class="add-ticker-input" id="addTickerInput" placeholder="e.g. NVDA" maxlength="10">
                <button type="button" class="add-ticker-btn" id="addTickerBtn">Add ticker</button>
            </div>
            <p class="add-ticker-msg hidden" id="addTickerMsg"></p>
        </div>
        <div class="card-list" id="cardList"></div>
        <button type="button" class="show-more-btn hidden" id="showMoreBtn">Show 25 more</button>
    `;

    const searchInput = root.querySelector('#universeSearch');
    const sectorSelect = root.querySelector('#universeSectorSelect');
    const sortSelect = root.querySelector('#universeSortSelect');
    const cardList = root.querySelector('#cardList');
    const showMoreBtn = root.querySelector('#showMoreBtn');

    function refreshList() {
        const list = filteredSortedUniverse();
        cardList.innerHTML = '';
        if (list.length === 0) {
            cardList.appendChild(el('p', 'tone-na', 'No stocks match those filters.'));
            showMoreBtn.classList.add('hidden');
            return;
        }
        appendLines(cardList, list.slice(0, universeVisible).map((stock) => buildStockCard(stock, universe)));
        showMoreBtn.classList.toggle('hidden', list.length <= universeVisible);
    }

    searchInput.addEventListener('input', () => {
        universeQuery = searchInput.value;
        universeVisible = 25;
        refreshList();
    });
    sectorSelect.addEventListener('change', () => {
        universeSector = sectorSelect.value;
        universeVisible = 25;
        refreshList();
    });
    sortSelect.addEventListener('change', () => {
        universeSort = sortSelect.value;
        universeVisible = 25;
        refreshList();
    });
    showMoreBtn.addEventListener('click', () => {
        universeVisible += 25;
        refreshList();
    });

    refreshList();
    // Full re-render (not just refreshList) on a successful add: `universe`
    // above is captured once per render and handed to every card/verdict
    // for percentile math, so a stale reference here would silently price
    // every percentile against the pre-add stock count.
    wireAddTickerForm(root, () => renderUniverseStep(root));
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

const STEPS = {
    1: { title: STEP_TITLES[0], render: renderIdeaStep },
    2: { title: STEP_TITLES[1], render: renderUniverseStep },
    3: { title: STEP_TITLES[2], render: renderFloorStep },
    4: stubStep(STEP_TITLES[3]),
    5: stubStep(STEP_TITLES[4]),
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
