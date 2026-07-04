// SoundHype Dashboard — the landing section: every tracked stock in one
// ranked, sortable, searchable table. Learning stays attached to the
// numbers: column ⓘ toggles explain each metric straight from CopyDeck,
// and every row opens the same full stock sheet the tutorial uses.
// Depends on the wizard.js shared helpers (el, esc, openStockSheet,
// renderSparkline, formatUsdPrice), CopyDeck and Interpret, all loaded as
// classic scripts before this file. DOM only — no test framework covers
// this file; it is verified with headless Chromium.
(function () {
    // `deck: true` columns get an ⓘ that opens the shared explainer panel.
    // `secondary: true` columns disappear on narrow screens (CSS).
    const COLUMNS = [
        { key: 'company', label: 'Company' },
        { key: 'price', label: 'Price', numeric: true, mobileHide: true },
        { key: 'scores.overall', label: 'Overall', numeric: true, deck: true },
        { key: 'scores.quality', label: 'Quality', numeric: true, deck: true, secondary: true },
        { key: 'scores.hype', label: 'Hype', numeric: true, deck: true, secondary: true },
        { key: 'momentum_1y', label: '1y move', numeric: true, deck: true },
    ];

    let sortKey = 'scores.overall';
    let sortDesc = true;
    let query = '';
    let openDeckKey = null;

    function sortValue(stock, key) {
        if (key === 'company') return (stock.name || stock.ticker || '').toLowerCase();
        return Interpret.getValue(stock, key);
    }

    function compareStocks(a, b) {
        const va = sortValue(a, sortKey);
        const vb = sortValue(b, sortKey);
        // Missing values sink to the bottom whichever way the sort points.
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return sortDesc ? -cmp : cmp;
    }

    function matchesQuery(stock) {
        if (!query) return true;
        return Teach.searchMatches(stock, query);
    }

    // One toned cell for a score/momentum column: value + tone dot. The
    // tone comes from Interpret against the FULL universe — percentiles
    // must never be computed against the filtered rows.
    function tonedCellHtml(key, stock, universe) {
        const r = Interpret.interpret(key, stock, universe);
        if (r.value === null) return '<span class="dash-na">—</span>';
        return `<span class="dash-dot" style="background:var(--tone-${r.tone})"></span>${r.display}`;
    }

    function rowHtml(stock, rank, universe) {
        const up = typeof stock.momentum_1y === 'number' && stock.momentum_1y > 0;
        const spark = (stock.sparkline && stock.sparkline.length >= 2)
            ? renderSparkline(stock.sparkline, up)
            : '';
        return `
            <td class="dash-rank">${rank}</td>
            <td class="dash-company">
                <span class="dash-ticker">${esc(stock.ticker)}</span>
                <span class="dash-name">${esc(stock.name)}</span>
                <span class="dash-sector">${esc(stock.sector || '')}</span>
            </td>
            <td class="dash-num dash-col-mobile-hide">${formatUsdPrice(stock.price)}</td>
            <td class="dash-num">${tonedCellHtml('scores.overall', stock, universe)}</td>
            <td class="dash-num dash-col-secondary">${tonedCellHtml('scores.quality', stock, universe)}</td>
            <td class="dash-num dash-col-secondary">${tonedCellHtml('scores.hype', stock, universe)}</td>
            <td class="dash-num">${tonedCellHtml('momentum_1y', stock, universe)}</td>
            <td class="dash-spark dash-col-secondary">${spark}</td>
        `;
    }

    function renderTbody(tbody, countLine) {
        const universe = appData.stocks || [];
        const rows = universe.filter(matchesQuery).sort(compareStocks);

        const frag = document.createDocumentFragment();
        rows.forEach((stock, i) => {
            const tr = el('tr', 'dash-row');
            tr.tabIndex = 0;
            tr.dataset.ticker = stock.ticker;
            tr.setAttribute('role', 'button');
            tr.setAttribute('aria-label', `Open ${stock.ticker} details`);
            tr.innerHTML = rowHtml(stock, i + 1, universe);
            frag.appendChild(tr);
        });
        tbody.innerHTML = '';
        tbody.appendChild(frag);

        if (rows.length === 0) {
            countLine.textContent = CopyDeck.sections.dashboard.searchEmpty;
        } else {
            countLine.textContent = `${rows.length} of ${universe.length} stocks shown`;
        }
    }

    function updateHeaderState(thead) {
        thead.querySelectorAll('button.dash-sort').forEach((btn) => {
            const active = btn.dataset.key === sortKey;
            btn.classList.toggle('active', active);
            btn.querySelector('.dash-sort-arrow').textContent =
                active ? (sortDesc ? '↓' : '↑') : '';
            const th = btn.closest('th');
            if (active) th.setAttribute('aria-sort', sortDesc ? 'descending' : 'ascending');
            else th.removeAttribute('aria-sort');
        });
    }

    // The shared explainer panel under the controls row — one panel for the
    // whole table (per-row tooltips at 392 rows would be noise), filled from
    // the same CopyDeck entries the tutorial teaches with.
    function toggleDeckPanel(panel, key) {
        if (openDeckKey === key) {
            openDeckKey = null;
            panel.classList.add('hidden');
            return;
        }
        const info = CopyDeck.metrics[key];
        if (!info) return;
        let html = `<p class="dash-deck-label">${esc(info.label)}</p>`;
        if (info.short) html += `<p>${info.short}</p>`;
        if (info.why) html += `<p>${info.why}</p>`;
        if (info.trap) html += `<p><strong>The trap:</strong> ${info.trap}</p>`;
        panel.innerHTML = html;
        panel.classList.remove('hidden');
        openDeckKey = key;
    }

    function openRow(ticker) {
        // replaceState (not pushState / hash assignment): Back should leave
        // the dashboard, not walk through every sheet ever opened, and no
        // hashchange fires so the table keeps its sort and scroll.
        history.replaceState(null, '', '#stock-' + encodeURIComponent(ticker));
        openStockSheet(ticker);
    }

    function render(root) {
        const s = CopyDeck.sections.dashboard;
        openDeckKey = null;

        const simLink = window.Simulate
            ? ` <a class="dash-lede-link" href="#simulate">${s.simulateCta} →</a>`
            : '';
        root.innerHTML = `
            <section class="dashboard">
                <h1>Every stock, ranked</h1>
                <p class="dash-lede">${s.lede}</p>
                <p class="dash-lede-links"><a class="dash-lede-link" href="#step-1">${s.learnCta} →</a>${simLink}</p>
                <div class="dash-controls">
                    <input type="search" id="dashSearch" placeholder="Search ticker, name, or sector" aria-label="Search stocks">
                    <span class="dash-count" id="dashCount"></span>
                </div>
                <p class="dash-hint">${s.tableHint}</p>
                <div class="info-panel dash-deck-panel hidden" id="dashDeckPanel"></div>
                <div class="dashboard-table-wrap">
                    <table class="dashboard-table">
                        <thead><tr id="dashHead"></tr></thead>
                        <tbody id="dashBody"></tbody>
                    </table>
                </div>
            </section>
        `;

        const thead = root.querySelector('#dashHead');
        const tbody = root.querySelector('#dashBody');
        const countLine = root.querySelector('#dashCount');
        const deckPanel = root.querySelector('#dashDeckPanel');

        // Rank column header (not sortable — it IS the current sort order).
        thead.appendChild(el('th', 'dash-rank', '#'));
        COLUMNS.forEach((col) => {
            const th = el('th', col.secondary ? 'dash-col-secondary' : (col.mobileHide ? 'dash-col-mobile-hide' : ''));
            if (col.numeric) th.classList.add('dash-num');
            const btn = el('button', 'dash-sort',
                `${esc(col.label)} <span class="dash-sort-arrow"></span>`);
            btn.type = 'button';
            btn.dataset.key = col.key;
            btn.addEventListener('click', () => {
                if (sortKey === col.key) {
                    sortDesc = !sortDesc;
                } else {
                    sortKey = col.key;
                    sortDesc = col.key !== 'company'; // numbers rank best-first
                }
                renderTbody(tbody, countLine);
                updateHeaderState(thead);
            });
            th.appendChild(btn);
            if (col.deck && CopyDeck.metrics[col.key]) {
                const info = el('button', 'info-toggle', 'ⓘ');
                info.type = 'button';
                info.setAttribute('aria-label', `More about ${col.label}`);
                info.addEventListener('click', () => toggleDeckPanel(deckPanel, col.key));
                th.appendChild(info);
            }
            thead.appendChild(th);
        });
        thead.appendChild(el('th', 'dash-spark dash-col-secondary', 'Trend'));

        root.querySelector('#dashSearch').addEventListener('input', (e) => {
            query = e.target.value.trim();
            renderTbody(tbody, countLine);
        });

        tbody.addEventListener('click', (e) => {
            const tr = e.target.closest('tr.dash-row');
            if (tr) openRow(tr.dataset.ticker);
        });
        tbody.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const tr = e.target.closest('tr.dash-row');
            if (tr) {
                e.preventDefault();
                openRow(tr.dataset.ticker);
            }
        });

        renderTbody(tbody, countLine);
        updateHeaderState(thead);
    }

    window.Dashboard = { render };
})();
