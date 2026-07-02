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
                <p>Profit margins, return on equity, free cash flow, and how much debt it is carrying. The boring half — and the half that keeps you from losing your shirt when the market turns. It gets the bigger weight on purpose: hype fades, a balance sheet does not lie for long.</p>
            </div>
            <div class="score-card score-card-hype">
                <span class="score-card-badge">Hype · 40%</span>
                <h3>Is it growing, and has the market noticed?</h3>
                <p>Revenue growth, earnings growth, and price momentum. The exciting half — and the half that can make you money fast or burn you just as fast. A great business nobody is watching yet can sit flat for years; this is the half that looks for the crowd starting to arrive.</p>
            </div>
        </div>

        <div class="callout callout-percentile">
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

const STEPS = {
    1: { title: STEP_TITLES[0], render: renderIdeaStep },
    2: stubStep(STEP_TITLES[1]),
    3: stubStep(STEP_TITLES[2]),
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
