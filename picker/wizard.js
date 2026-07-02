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

const STEPS = {
    1: stubStep(STEP_TITLES[0]),
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
