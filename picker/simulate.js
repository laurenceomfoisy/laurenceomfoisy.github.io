// SoundHype Simulate — the "what would have happened" section: lump-sum
// single-stock simulation and whole-portfolio backtest, each with optional
// benchmark overlays (S&P 500, XEQT.TO). Math lives in SimCore; weekly
// price series come from prices.json, fetched lazily the first time this
// section renders so the dashboard's first paint never pays for it.
// Depends on wizard.js shared helpers (el, esc, computeAllocation,
// WizardState, appData), CopyDeck, SimCore. DOM only — verified with
// headless Chromium.
(function () {
    let pricesPromise = null;
    let prices = null;

    // Display currency. Money is entered and shown in CAD by default (the
    // Build step's amounts are CAD); the math always runs in USD.
    let displayCad = true;

    const lumpState = { ticker: null, amount: null, startDate: null, gspc: false, xeqt: false };
    const portState = { source: 'built', basket: [], amount: null, startDate: null, gspc: false, xeqt: false };

    const BENCHMARKS = [
        { stateKey: 'gspc', dataKey: 'GSPC', label: 'S&P 500', cls: 'sim-line-bench1' },
        { stateKey: 'xeqt', dataKey: 'XEQT.TO', label: 'XEQT.TO', cls: 'sim-line-bench2' },
    ];

    function loadPrices() {
        if (!pricesPromise) {
            pricesPromise = fetch('prices.json')
                .then((r) => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then((data) => { prices = data; return data; });
        }
        return pricesPromise;
    }

    function fill(tpl, vars) {
        return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    }

    function fmtMoney(v) {
        return new Intl.NumberFormat(displayCad ? 'en-CA' : 'en-US', {
            style: 'currency',
            currency: displayCad ? 'CAD' : 'USD',
            maximumFractionDigits: 0,
        }).format(v);
    }

    // CAD per USD at the week containing isoDate.
    function cadRate(isoDate) {
        return SimCore.toCadValue(1, isoDate, prices.dates, prices.usd_cad);
    }

    function toDisplayValue(usdValue, isoDate) {
        return displayCad ? SimCore.toCadValue(usdValue, isoDate, prices.dates, prices.usd_cad) : usdValue;
    }

    function toDisplaySeries(usdSeries) {
        return displayCad ? SimCore.toCadSeries(usdSeries, prices.dates, prices.usd_cad) : usdSeries;
    }

    // ---- Chart ------------------------------------------------------------

    // Multi-series SVG line chart. seriesList: [{label, points, cls}] with
    // points already in the display currency. Identity is never color-alone:
    // the portfolio line is solid black, benchmarks gray solid / gray
    // dashed, plus a legend and direct end labels.
    function renderChart(container, seriesList) {
        container.innerHTML = '';
        const live = seriesList.filter((s) => s.points && s.points.length >= 2);
        if (live.length === 0) return;

        const W = 640, H = 240, PAD_L = 10, PAD_R = 10, PAD_T = 14, PAD_B = 26;
        const allDates = live[0].points.map((p) => p.date);
        const dateIdx = new Map(allDates.map((d, i) => [d, i]));
        let min = Infinity, max = -Infinity;
        live.forEach((s) => s.points.forEach((p) => {
            if (p.value < min) min = p.value;
            if (p.value > max) max = p.value;
        }));
        if (max === min) max = min + 1;

        const x = (date) => {
            const i = dateIdx.has(date) ? dateIdx.get(date) : 0;
            return PAD_L + (i / (allDates.length - 1)) * (W - PAD_L - PAD_R);
        };
        const y = (v) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);

        let svg = `<svg viewBox="0 0 ${W} ${H}" class="sim-chart-svg" role="img" aria-label="Value over time">`;
        [0.25, 0.5, 0.75].forEach((f) => {
            const gy = PAD_T + f * (H - PAD_T - PAD_B);
            svg += `<line class="sim-grid" x1="${PAD_L}" y1="${gy.toFixed(1)}" x2="${W - PAD_R}" y2="${gy.toFixed(1)}"/>`;
        });
        live.forEach((s) => {
            const pts = s.points
                .filter((p) => dateIdx.has(p.date))
                .map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
                .join(' ');
            svg += `<polyline class="sim-line ${s.cls}" points="${pts}"/>`;
        });
        svg += `<line class="sim-crosshair hidden" x1="0" y1="${PAD_T}" x2="0" y2="${H - PAD_B}"/>`;
        svg += '</svg>';

        const wrap = el('div', 'sim-chart');
        wrap.innerHTML = `
            <div class="sim-legend">${live.map((s) =>
                `<span class="sim-legend-item"><span class="sim-swatch ${s.cls}"></span>${esc(s.label)}</span>`).join('')}</div>
            ${svg}
            <div class="sim-chart-scale">
                <span>${esc(allDates[0])} → ${esc(allDates[allDates.length - 1])}</span>
                <span>${fmtMoney(min)} – ${fmtMoney(max)}</span>
            </div>
            <div class="sim-tooltip hidden"></div>
        `;
        container.appendChild(wrap);

        // Hover: nearest-week crosshair + tooltip with one value per series.
        const svgEl = wrap.querySelector('svg');
        const cross = wrap.querySelector('.sim-crosshair');
        const tip = wrap.querySelector('.sim-tooltip');
        svgEl.addEventListener('mousemove', (e) => {
            const rect = svgEl.getBoundingClientRect();
            const fx = (e.clientX - rect.left) / rect.width * W;
            const i = Math.max(0, Math.min(allDates.length - 1,
                Math.round((fx - PAD_L) / (W - PAD_L - PAD_R) * (allDates.length - 1))));
            const date = allDates[i];
            const cx = x(date);
            cross.setAttribute('x1', cx.toFixed(1));
            cross.setAttribute('x2', cx.toFixed(1));
            cross.classList.remove('hidden');
            const rows = live.map((s) => {
                const pt = s.points.find((p) => p.date === date);
                return pt ? `<div><span class="sim-swatch ${s.cls}"></span>${esc(s.label)}: ${fmtMoney(pt.value)}</div>` : '';
            }).join('');
            tip.innerHTML = `<div class="sim-tip-date">${esc(date)}</div>${rows}`;
            tip.classList.remove('hidden');
            const px = (cx / W) * rect.width;
            tip.style.left = `${Math.min(px, rect.width - 170)}px`;
        });
        svgEl.addEventListener('mouseleave', () => {
            cross.classList.add('hidden');
            tip.classList.add('hidden');
        });
    }

    // ---- Shared form pieces ------------------------------------------------

    function dateBounds() {
        const dates = prices.dates;
        return {
            min: dates[0],
            // A backtest under ~8 weeks is noise, not a simulation.
            max: dates[Math.max(0, dates.length - 9)],
            oneYearAgo: dates[Math.max(0, dates.length - 53)],
        };
    }

    function amountAndDateHtml(idPrefix, state) {
        const b = dateBounds();
        return `
            <div class="sim-inputs">
                <label class="sim-field">
                    <span class="sim-field-label">Amount</span>
                    <span class="sim-amount-row"><span class="sim-amount-prefix">$</span>
                    <input type="number" id="${idPrefix}Amount" min="0" step="100" inputmode="decimal"
                        placeholder="e.g. 1000" value="${state.amount != null ? esc(String(state.amount)) : ''}">
                    <span class="sim-amount-suffix">CAD</span></span>
                </label>
                <label class="sim-field">
                    <span class="sim-field-label">Bought on</span>
                    <input type="date" id="${idPrefix}Date" min="${b.min}" max="${b.max}"
                        value="${esc(state.startDate || b.oneYearAgo)}">
                </label>
            </div>
            <div class="sim-bench">
                <span>Compare against:</span>
                <label><input type="checkbox" id="${idPrefix}Gspc" ${state.gspc ? 'checked' : ''}> S&amp;P 500</label>
                <label><input type="checkbox" id="${idPrefix}Xeqt" ${state.xeqt ? 'checked' : ''}> XEQT.TO</label>
            </div>
        `;
    }

    function wireAmountAndDate(card, idPrefix, state, rerun) {
        if (!state.startDate) state.startDate = dateBounds().oneYearAgo;
        card.querySelector(`#${idPrefix}Amount`).addEventListener('input', (e) => {
            const raw = e.target.value.trim();
            state.amount = raw === '' ? null : Number(raw);
            rerun();
        });
        card.querySelector(`#${idPrefix}Date`).addEventListener('input', (e) => {
            state.startDate = e.target.value || null;
            rerun();
        });
        card.querySelector(`#${idPrefix}Gspc`).addEventListener('change', (e) => { state.gspc = e.target.checked; rerun(); });
        card.querySelector(`#${idPrefix}Xeqt`).addEventListener('change', (e) => { state.xeqt = e.target.checked; rerun(); });
    }

    // As-you-type search over the universe (same interaction as the
    // tutorial's Step-2 lookup), but picking feeds the simulator instead of
    // opening the sheet.
    function wireSearch(card, inputSel, resultsSel, onPick) {
        const input = card.querySelector(inputSel);
        const results = card.querySelector(resultsSel);
        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            results.innerHTML = '';
            if (!q) return;
            const matches = (appData.stocks || [])
                .filter((s) => (s.ticker || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q))
                .slice(0, 8);
            if (matches.length === 0) {
                results.appendChild(el('p', 'teach-search-empty', 'No matches.'));
                return;
            }
            matches.forEach((stock) => {
                const row = el('button', 'teach-search-row',
                    `<span class="teach-search-ticker">${esc(stock.ticker)}</span><span class="teach-search-name">${esc(stock.name || stock.ticker)}</span>`);
                row.type = 'button';
                row.addEventListener('click', () => {
                    input.value = '';
                    results.innerHTML = '';
                    onPick(stock);
                });
                results.appendChild(row);
            });
        });
    }

    function errorLine(reason) {
        const msg = CopyDeck.sections.simulate.errors[reason] || CopyDeck.sections.simulate.errors['no-data'];
        return `<p class="sim-error tone-caution">${msg}</p>`;
    }

    // Runs the benchmark overlays for a simulation and returns
    // {series: [...chart series], verdicts: [html]} in display currency.
    function benchmarkRuns(state, amountUsd, startDate, mainReturnPct, mainAmountDisplay) {
        const deckBench = CopyDeck.sections.simulate.benchmark;
        const out = { series: [], verdicts: [] };
        BENCHMARKS.forEach((b) => {
            if (!state[b.stateKey]) return;
            const closes = prices.benchmarks && prices.benchmarks[b.dataKey];
            if (!closes) return;
            const run = SimCore.simulateLumpSum(prices.dates, closes, amountUsd, startDate);
            if (!run.ok) return;
            const dispSeries = toDisplaySeries(run.series);
            const endDisplay = dispSeries[dispSeries.length - 1].value;
            const benchReturnPct = (endDisplay / mainAmountDisplay - 1) * 100;
            out.series.push({ label: b.label, points: dispSeries, cls: b.cls });
            const diff = mainReturnPct - benchReturnPct;
            let tpl, tone;
            if (Math.abs(diff) < 1) { tpl = deckBench.tiedTemplate; tone = 'fine'; }
            else if (diff > 0) { tpl = deckBench.beatTemplate; tone = 'good'; }
            else { tpl = deckBench.lostTemplate; tone = 'bad'; }
            out.verdicts.push(`<p class="sim-verdict tone-${tone}">${fill(tpl, { name: b.label, diff: Math.abs(diff).toFixed(1) })}</p>`);
        });
        return out;
    }

    function headlineHtml(amountDisplay, endDisplay) {
        const gain = endDisplay - amountDisplay;
        const pct = (endDisplay / amountDisplay - 1) * 100;
        const tone = gain >= 0 ? 'good' : 'bad';
        const sign = gain >= 0 ? '+' : '−';
        return `
            <p class="sim-headline">${fmtMoney(amountDisplay)} would be <strong>${fmtMoney(endDisplay)}</strong> today.</p>
            <p class="sim-gain tone-${tone}">${sign}${fmtMoney(Math.abs(gain))} (${sign}${Math.abs(pct).toFixed(1)}%)</p>
        `;
    }

    // ---- Card A: lump sum ---------------------------------------------------

    function runLumpSum(resultEl) {
        const deck = CopyDeck.sections.simulate;
        if (!lumpState.ticker) { resultEl.innerHTML = ''; return; }
        if (!(lumpState.amount > 0)) { resultEl.innerHTML = errorLine('bad-amount'); return; }
        if (!lumpState.startDate) { resultEl.innerHTML = ''; return; }

        const closes = prices.series[lumpState.ticker];
        if (!closes) { resultEl.innerHTML = errorLine('no-data'); return; }

        const amountUsd = lumpState.amount / cadRate(lumpState.startDate);
        const run = SimCore.simulateLumpSum(prices.dates, closes, amountUsd, lumpState.startDate);
        if (!run.ok) { resultEl.innerHTML = errorLine(run.reason); return; }

        const dispSeries = toDisplaySeries(run.series);
        const amountDisplay = displayCad ? lumpState.amount : amountUsd;
        const endDisplay = dispSeries[dispSeries.length - 1].value;
        const mainReturnPct = (endDisplay / amountDisplay - 1) * 100;

        const bench = benchmarkRuns(lumpState, amountUsd, lumpState.startDate, mainReturnPct, amountDisplay);
        const priceDisp = toDisplayValue(run.startPrice, run.startDate);

        resultEl.innerHTML = `
            ${headlineHtml(amountDisplay, endDisplay)}
            <p class="sim-fill-note">${fill(deck.lumpSum.filledTemplate, {
                date: run.startDate,
                price: fmtMoney(priceDisp),
                shares: run.shares.toFixed(2),
            })}</p>
            ${bench.verdicts.join('')}
            <div class="sim-chart-slot"></div>
        `;
        renderChart(resultEl.querySelector('.sim-chart-slot'), [
            { label: esc(lumpState.ticker), points: dispSeries, cls: 'sim-line-main' },
        ].concat(bench.series));
    }

    function renderLumpCard(container) {
        const deck = CopyDeck.sections.simulate;
        const card = el('section', 'sim-card');
        card.innerHTML = `
            <h2>${deck.lumpSum.title}</h2>
            <p>${deck.lumpSum.blurb}</p>
            <div class="sim-picker">
                <input type="search" class="universe-search teach-search-input" id="lumpSearch"
                    placeholder="Search by name or ticker">
                <div class="teach-search-results" id="lumpResults"></div>
                <p class="sim-chosen" id="lumpChosen"></p>
            </div>
            ${amountAndDateHtml('lump', lumpState)}
            <div class="sim-result" id="lumpResult"></div>
        `;
        container.appendChild(card);

        const resultEl = card.querySelector('#lumpResult');
        const chosenEl = card.querySelector('#lumpChosen');
        const rerun = () => runLumpSum(resultEl);

        function showChosen() {
            if (!lumpState.ticker) { chosenEl.innerHTML = ''; return; }
            const stock = (appData.stocks || []).find((s) => s.ticker === lumpState.ticker);
            chosenEl.innerHTML = `<span class="sim-chip">${esc(lumpState.ticker)}</span> ${esc(stock ? stock.name : '')}`;
        }

        wireSearch(card, '#lumpSearch', '#lumpResults', (stock) => {
            lumpState.ticker = stock.ticker;
            showChosen();
            rerun();
        });
        wireAmountAndDate(card, 'lump', lumpState, rerun);
        showChosen();
        rerun();
    }

    // ---- Card B: portfolio backtest -----------------------------------------

    // The basket to buy, per the selected source. 'built' uses what the
    // Build step actually built (persisted as WizardState.lastBuild), or
    // falls back to the default pipeline with a note.
    function portfolioHoldings() {
        if (portState.source === 'basket') {
            const w = 100 / Math.max(1, portState.basket.length);
            return { holdings: portState.basket.map((t) => ({ ticker: t, weightPct: w })), note: null };
        }
        const deckBt = CopyDeck.sections.simulate.backtest;
        if (WizardState.lastBuild && Array.isArray(WizardState.lastBuild.holdings) && WizardState.lastBuild.holdings.length > 0) {
            return { holdings: WizardState.lastBuild.holdings, note: deckBt.builtNote };
        }
        const { weighted } = computeAllocation(appData.stocks || []);
        return {
            holdings: weighted.map((s) => ({ ticker: s.ticker, weightPct: s.weightPct })),
            note: deckBt.defaultsNote,
        };
    }

    function runPortfolio(resultEl) {
        const deckBt = CopyDeck.sections.simulate.backtest;
        if (!(portState.amount > 0)) { resultEl.innerHTML = errorLine('bad-amount'); return; }
        if (!portState.startDate) { resultEl.innerHTML = ''; return; }

        const { holdings, note } = portfolioHoldings();
        if (holdings.length === 0) { resultEl.innerHTML = errorLine('no-holdings'); return; }

        const amountUsd = portState.amount / cadRate(portState.startDate);
        const run = SimCore.simulatePortfolio(prices.dates, prices.series, holdings, amountUsd, portState.startDate);
        if (!run.ok) { resultEl.innerHTML = errorLine(run.reason); return; }

        const dispSeries = toDisplaySeries(run.series);
        const amountDisplay = displayCad ? portState.amount : amountUsd;
        const endDisplay = dispSeries[dispSeries.length - 1].value;
        const mainReturnPct = (endDisplay / amountDisplay - 1) * 100;

        const bench = benchmarkRuns(portState, amountUsd, portState.startDate, mainReturnPct, amountDisplay);

        const holdingRows = run.perHolding
            .slice()
            .sort((a, b) => b.endValue - a.endValue)
            .map((h) => {
                const tone = h.returnPct >= 0 ? 'good' : 'bad';
                const sign = h.returnPct >= 0 ? '+' : '−';
                return `<tr>
                    <td class="sim-h-ticker">${esc(h.ticker)}</td>
                    <td class="sim-h-num">${h.weightPct.toFixed(1)}%</td>
                    <td class="sim-h-num">${fmtMoney(toDisplayValue(h.amount, run.series[0].date))}</td>
                    <td class="sim-h-num">${fmtMoney(toDisplayValue(h.endValue, run.series[run.series.length - 1].date))}</td>
                    <td class="sim-h-num tone-${tone}">${sign}${Math.abs(h.returnPct).toFixed(1)}%</td>
                </tr>`;
            }).join('');

        const skippedHtml = run.skipped
            .map((sk) => `<p class="sim-skip tone-caution">${fill(deckBt.skippedTemplate, { ticker: esc(sk.ticker) })}</p>`)
            .join('');

        resultEl.innerHTML = `
            ${note ? `<p class="sim-note">${note}</p>` : ''}
            ${headlineHtml(amountDisplay, endDisplay)}
            ${bench.verdicts.join('')}
            <div class="sim-chart-slot"></div>
            <div class="allocation-table-wrap sim-holdings-wrap">
                <table class="allocation-table">
                    <thead><tr><th>Stock</th><th class="sim-h-num">Weight</th><th class="sim-h-num">Invested</th><th class="sim-h-num">Now</th><th class="sim-h-num">Return</th></tr></thead>
                    <tbody>${holdingRows}</tbody>
                </table>
            </div>
            ${skippedHtml}
        `;
        renderChart(resultEl.querySelector('.sim-chart-slot'), [
            { label: 'Your portfolio', points: dispSeries, cls: 'sim-line-main' },
        ].concat(bench.series));
    }

    function renderPortfolioCard(container) {
        const deck = CopyDeck.sections.simulate;
        const card = el('section', 'sim-card');
        card.innerHTML = `
            <h2>${deck.backtest.title}</h2>
            <p>${deck.backtest.blurb}</p>
            <p class="sim-warning">${deck.backtest.hindsightWarning}</p>
            <div class="sim-source" role="radiogroup" aria-label="Portfolio source">
                <label><input type="radio" name="portSource" value="built" ${portState.source === 'built' ? 'checked' : ''}> The portfolio you built</label>
                <label><input type="radio" name="portSource" value="basket" ${portState.source === 'basket' ? 'checked' : ''}> Hand-picked basket</label>
            </div>
            <div class="sim-picker hidden" id="basketPicker">
                <p class="sim-hint">${deck.backtest.basketHint}</p>
                <input type="search" class="universe-search teach-search-input" id="portSearch"
                    placeholder="Search by name or ticker">
                <div class="teach-search-results" id="portResults"></div>
                <div class="sim-chips" id="basketChips"></div>
            </div>
            ${amountAndDateHtml('port', portState)}
            <div class="sim-result" id="portResult"></div>
        `;
        container.appendChild(card);

        const resultEl = card.querySelector('#portResult');
        const basketPicker = card.querySelector('#basketPicker');
        const chipsEl = card.querySelector('#basketChips');
        const rerun = () => runPortfolio(resultEl);

        function showChips() {
            chipsEl.innerHTML = '';
            portState.basket.forEach((ticker) => {
                const chip = el('button', 'sim-chip sim-chip-removable', `${esc(ticker)} ×`);
                chip.type = 'button';
                chip.setAttribute('aria-label', `Remove ${ticker}`);
                chip.addEventListener('click', () => {
                    portState.basket = portState.basket.filter((t) => t !== ticker);
                    showChips();
                    rerun();
                });
                chipsEl.appendChild(chip);
            });
        }

        card.querySelectorAll('input[name="portSource"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                portState.source = radio.value;
                basketPicker.classList.toggle('hidden', portState.source !== 'basket');
                rerun();
            });
        });
        basketPicker.classList.toggle('hidden', portState.source !== 'basket');

        wireSearch(card, '#portSearch', '#portResults', (stock) => {
            if (!portState.basket.includes(stock.ticker)) portState.basket.push(stock.ticker);
            showChips();
            rerun();
        });
        wireAmountAndDate(card, 'port', portState, rerun);
        showChips();
        rerun();
    }

    // ---- Section entry -------------------------------------------------------

    function renderTools(root) {
        const deck = CopyDeck.sections.simulate;
        const body = root.querySelector('#simBody');
        body.innerHTML = `
            <div class="sim-currency" role="group" aria-label="Display currency">
                <button type="button" id="simCad" class="sim-cur-btn">CAD</button><button type="button" id="simUsd" class="sim-cur-btn">USD</button>
            </div>
            <div id="simCards"></div>
            <section class="sim-fineprint">
                <p>${deck.weeklyNote}</p>
                <p>${deck.dividendNote}</p>
                <p>${deck.currencyNote}</p>
            </section>
        `;
        const cards = body.querySelector('#simCards');
        renderLumpCard(cards);
        renderPortfolioCard(cards);

        const cadBtn = body.querySelector('#simCad');
        const usdBtn = body.querySelector('#simUsd');
        function paintCurrency() {
            cadBtn.classList.toggle('active', displayCad);
            usdBtn.classList.toggle('active', !displayCad);
        }
        function setCurrency(cad) {
            if (displayCad === cad) return;
            displayCad = cad;
            paintCurrency();
            runLumpSum(body.querySelector('#lumpResult'));
            runPortfolio(body.querySelector('#portResult'));
        }
        cadBtn.addEventListener('click', () => setCurrency(true));
        usdBtn.addEventListener('click', () => setCurrency(false));
        paintCurrency();
    }

    function render(root) {
        const deck = CopyDeck.sections.simulate;
        root.innerHTML = `
            <section class="simulate">
                <h1>Simulations</h1>
                <p class="sim-lede">${deck.lede}</p>
                <div id="simBody"><p class="sim-loading">${deck.errors.loading}</p></div>
            </section>
        `;
        loadPrices()
            .then(() => {
                // The user may have navigated away while the fetch ran.
                if (root.querySelector('#simBody')) renderTools(root);
            })
            .catch(() => {
                const bodyEl = root.querySelector('#simBody');
                if (bodyEl) bodyEl.innerHTML = `<p class="tone-bad">${deck.errors.loadFailed}</p>`;
            });
    }

    window.Simulate = { render };
})();
