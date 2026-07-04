// SoundHype shell — data fetch, section router, header nav, and data-status
// chip. Loaded last, owns init(). wizard.js provides the tutorial section
// (STEPS, renderTutorialStep, renderProgressRail) plus the shared render
// helpers (el, esc, openStockSheet, ...); dashboard.js and simulate.js
// register window.Dashboard / window.Simulate when loaded — the router and
// nav light those sections up only when present. DOM only — no test
// framework covers this file; it is verified with headless Chromium.

const DEFAULT_HASH = '#dashboard';

const NAV_LINKS = [
    { hash: '#dashboard', label: 'Dashboard', section: 'dashboard', ready: () => !!window.Dashboard },
    { hash: '#simulate', label: 'Simulations', section: 'simulate', ready: () => !!window.Simulate },
    { hash: '#step-1', label: 'Learn the method', section: 'tutorial', ready: () => true },
];

let currentRoute = null;

function parseRoute(hash) {
    let m = hash.match(/^#step-(\d)$/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (STEPS[n]) return { section: 'tutorial', key: 'step-' + n, step: n };
    }
    // Tickers contain dots and dashes (RY.TO, BRK-B) — match anything after
    // the prefix rather than a word class.
    m = hash.match(/^#stock-(.+)$/);
    if (m && window.Dashboard) {
        return { section: 'dashboard', key: 'dashboard', ticker: decodeURIComponent(m[1]) };
    }
    if (hash === '#dashboard' && window.Dashboard) return { section: 'dashboard', key: 'dashboard' };
    if (hash === '#simulate' && window.Simulate) return { section: 'simulate', key: 'simulate' };
    return null;
}

function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash; // hashchange listener calls route()
}

function route() {
    const target = parseRoute(location.hash) || parseRoute(DEFAULT_HASH);
    const root = document.getElementById('stepRoot');
    document.body.dataset.section = target.section;
    updateSectionNav(target.section);
    // Re-routing to the section already on screen (e.g. a stock sheet
    // closing back to #dashboard via replaceState) must not rebuild it —
    // that would reset the dashboard's sort and scroll position.
    if (target.key !== currentRoute) {
        if (target.section === 'tutorial') renderTutorialStep(target.step, root);
        else if (target.section === 'dashboard') Dashboard.render(root);
        else if (target.section === 'simulate') Simulate.render(root);
        currentRoute = target.key;
        window.scrollTo(0, 0);
    }
    if (target.ticker) openStockSheet(target.ticker);
}

function renderSectionNav() {
    const nav = document.getElementById('sectionNav');
    nav.innerHTML = '';
    const links = NAV_LINKS.filter((l) => l.ready());
    if (links.length < 2) return; // a nav with one destination is noise
    links.forEach((l) => {
        const a = el('a', 'section-link', esc(l.label));
        a.href = l.hash;
        a.dataset.section = l.section;
        nav.appendChild(a);
    });
}

function updateSectionNav(section) {
    document.querySelectorAll('#sectionNav a').forEach((a) => {
        a.classList.toggle('active', a.dataset.section === section);
        if (a.dataset.section === section) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
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
    renderSectionNav();
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
    route();
}

window.addEventListener('hashchange', route);

init();
