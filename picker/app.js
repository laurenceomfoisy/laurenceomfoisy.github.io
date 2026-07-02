// Global State
let appData = {
    lastUpdated: '',
    stocks: []
};

let activeFilters = {
    search: '',
    sortBy: 'overall',
    sector: 'all',
    minOverall: 0,
    minQuality: 0,
    minHype: 0,
    quickFilter: null
};

// Custom Ranking Weights (Initial equal balance = 25% each)
let rankingWeights = {
    profitability: 0.25,
    cash_flow: 0.25,
    safety: 0.25,
    hype: 0.25
};

// Mock Portfolio State (Loaded from localStorage)
let mockPortfolio = [];

// Selected stock in modal
let selectedStock = null;

// Pagination state
let visibleCount = 40;

// DOM Elements
const loadingIndicator = document.getElementById('loadingIndicator');
const noResults = document.getElementById('noResults');
const stocksGrid = document.getElementById('stocksGrid');
const searchInput = document.getElementById('searchInput');
const sortBySelect = document.getElementById('sortBySelect');
const sectorFilter = document.getElementById('sectorFilter');
const lastUpdatedBadge = document.getElementById('lastUpdatedBadge');
const loadMoreBtn = document.getElementById('loadMoreBtn');

// Screener Sliders & Values
const scoreRange = document.getElementById('scoreRange');
const scoreVal = document.getElementById('scoreVal');
const qualityRange = document.getElementById('qualityRange');
const qualityVal = document.getElementById('qualityVal');
const hypeRange = document.getElementById('hypeRange');
const hypeVal = document.getElementById('hypeVal');

// Stat Elements
const statCount = document.getElementById('statCount');
const statTopPick = document.getElementById('statTopPick');
const statHighestHype = document.getElementById('statHighestHype');
const statHighestQuality = document.getElementById('statHighestQuality');

// Dynamic Ranking Sliders
const weightProfitability = document.getElementById('weightProfitability');
const weightProfitabilityVal = document.getElementById('weightProfitabilityVal');
const weightCashflow = document.getElementById('weightCashflow');
const weightCashflowVal = document.getElementById('weightCashflowVal');
const weightSafety = document.getElementById('weightSafety');
const weightSafetyVal = document.getElementById('weightSafetyVal');
const weightHype = document.getElementById('weightHype');
const weightHypeVal = document.getElementById('weightHypeVal');

// Navigation Tabs
const tabScreenerBtn = document.getElementById('tabScreenerBtn');
const tabPortfolioBtn = document.getElementById('tabPortfolioBtn');
const screenerTabContent = document.getElementById('screenerTabContent');
const portfolioTabContent = document.getElementById('portfolioTabContent');
const portfolioCountBadge = document.getElementById('portfolioCountBadge');

// Add Ticker Elements
const addTickerInput = document.getElementById('addTickerInput');
const addTickerBtn = document.getElementById('addTickerBtn');
const addBtnText = document.getElementById('addBtnText');
const addBtnSpinner = document.getElementById('addBtnSpinner');
const addTickerMessage = document.getElementById('addTickerMessage');

// Portfolio Summary Elements
const portfolioTotalValue = document.getElementById('portfolioTotalValue');
const portfolioTotalInvested = document.getElementById('portfolioTotalInvested');
const portfolioProfitLoss = document.getElementById('portfolioProfitLoss');
const portfolioQualityScore = document.getElementById('portfolioQualityScore');
const portfolioHypeScore = document.getElementById('portfolioHypeScore');
const portfolioTableBody = document.getElementById('portfolioTableBody');
const emptyPortfolioMsg = document.getElementById('emptyPortfolioMsg');

// Modal Elements
const detailModal = document.getElementById('detailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTicker = document.getElementById('modalTicker');
const modalName = document.getElementById('modalName');
const modalSectorIndustry = document.getElementById('modalSectorIndustry');
const modalPrice = document.getElementById('modalPrice');
const modalChange = document.getElementById('modalChange');
const modalSummary = document.getElementById('modalSummary');
const modalWebsite = document.getElementById('modalWebsite');
const modalCeoName = document.getElementById('modalCeoName');
const modalOfficersList = document.getElementById('modalOfficersList');

// Modal Scores
const modalOverallScore = document.getElementById('modalOverallScore');
const modalRadialOverall = document.getElementById('modalRadialOverall');
const modalProfitabilityScore = document.getElementById('modalProfitabilityScore');
const modalProfitabilityFill = document.getElementById('modalProfitabilityFill');
const modalCashflowScore = document.getElementById('modalCashflowScore');
const modalCashflowFill = document.getElementById('modalCashflowFill');
const modalSafetyScore = document.getElementById('modalSafetyScore');
const modalSafetyFill = document.getElementById('modalSafetyFill');
const modalHypeScore = document.getElementById('modalHypeScore');
const modalHypeFill = document.getElementById('modalHypeFill');

// Modal Table
const tableOpMargin = document.getElementById('tableOpMargin');
const tableNetMargin = document.getElementById('tableNetMargin');
const tableRoe = document.getElementById('tableRoe');
const tableRoa = document.getElementById('tableRoa');
const tableRevGrowth = document.getElementById('tableRevGrowth');
const tableEarnGrowth = document.getElementById('tableEarnGrowth');
const tableDebtEquity = document.getElementById('tableDebtEquity');
const tableCurrentRatio = document.getElementById('tableCurrentRatio');
const tableForwardPe = document.getElementById('tableForwardPe');
const tableTrailingPe = document.getElementById('tableTrailingPe');
const tablePriceToBook = document.getElementById('tablePriceToBook');
const tableDivYield = document.getElementById('tableDivYield');

// Modal History Table
const modalHistoryTableBody = document.getElementById('modalHistoryTableBody');
const modalHistoryTableHeaders = document.getElementById('modalHistoryTableHeaders');

// Modal Buy Form Elements
const buyQty = document.getElementById('buyQty');
const buyPrice = document.getElementById('buyPrice');
const buyTotalCost = document.getElementById('buyTotalCost');
const buyConfirmBtn = document.getElementById('buyConfirmBtn');
const buySuccessMessage = document.getElementById('buySuccessMessage');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadPortfolioFromStorage();
    loadData();
    setupEventListeners();
    setupWeightsSliders();
    setupBuilder();
});

// Load mock portfolio from localStorage
function loadPortfolioFromStorage() {
    const saved = localStorage.getItem('soundhype_portfolio');
    if (saved) {
        try {
            mockPortfolio = JSON.parse(saved);
        } catch (e) {
            mockPortfolio = [];
        }
    }
    updatePortfolioBadges();
}

// Save portfolio to localStorage
function savePortfolioToStorage() {
    localStorage.setItem('soundhype_portfolio', JSON.stringify(mockPortfolio));
    updatePortfolioBadges();
}

function updatePortfolioBadges() {
    const totalShares = mockPortfolio.reduce((sum, item) => sum + item.shares, 0);
    if (totalShares > 0) {
        portfolioCountBadge.textContent = mockPortfolio.length;
        portfolioCountBadge.classList.remove('hidden');
    } else {
        portfolioCountBadge.classList.add('hidden');
    }
}

// Load data from the static JSON file (relative path: works both under the
// local Flask server and when hosted at a subpath like mfoisy.com/picker/)
async function loadData() {
    try {
        const response = await fetch('portfolio_data.json');
        if (!response.ok) {
            throw new Error('Failed to load stock data.');
        }
        const data = await response.json();
        appData.lastUpdated = data.last_updated;
        appData.stocks = data.stocks;
        
        loadingIndicator.classList.add('hidden');
        
        populateSectorFilter();
        recalculateAndRenderAll();
        renderBuilder();

        lastUpdatedBadge.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Refreshed: ${appData.lastUpdated}`;
    } catch (error) {
        console.error('Error loading data:', error);
        loadingIndicator.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; font-size: 3rem;"></i>
            <h3>Failed to connect to local API</h3>
            <p style="max-width: 500px; text-align: center; margin-top: 10px;">
                Make sure you are running the backend Flask server by typing <code>python3 app.py</code> in the terminal.
            </p>
        `;
    }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    // Navigation Tabs
    tabScreenerBtn.addEventListener('click', () => switchTab('screener'));
    tabPortfolioBtn.addEventListener('click', () => switchTab('portfolio'));
    tabBuilderBtn.addEventListener('click', () => switchTab('builder'));

    // Search and Sort
    searchInput.addEventListener('input', (e) => {
        activeFilters.search = e.target.value.toLowerCase();
        visibleCount = 40;
        renderStocks();
    });
    sortBySelect.addEventListener('change', (e) => {
        activeFilters.sortBy = e.target.value;
        visibleCount = 40;
        renderStocks();
    });
    sectorFilter.addEventListener('change', (e) => {
        activeFilters.sector = e.target.value;
        visibleCount = 40;
        renderStocks();
    });

    // Score sliders
    scoreRange.addEventListener('input', (e) => {
        activeFilters.minOverall = parseInt(e.target.value);
        scoreVal.textContent = e.target.value;
        visibleCount = 40;
        renderStocks();
    });
    qualityRange.addEventListener('input', (e) => {
        activeFilters.minQuality = parseInt(e.target.value);
        qualityVal.textContent = e.target.value;
        visibleCount = 40;
        renderStocks();
    });
    hypeRange.addEventListener('input', (e) => {
        activeFilters.minHype = parseInt(e.target.value);
        hypeVal.textContent = e.target.value;
        visibleCount = 40;
        renderStocks();
    });

    // Preset Screening Badges
    document.querySelectorAll('.badge-btn').forEach(btn => {
        if (btn.id === 'resetFilters') return;
        btn.addEventListener('click', () => {
            const filterType = btn.dataset.type;
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                activeFilters.quickFilter = null;
            } else {
                document.querySelectorAll('.badge-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilters.quickFilter = filterType;
            }
            visibleCount = 40;
            renderStocks();
        });
    });

    document.getElementById('resetFilters').addEventListener('click', () => {
        resetFilters();
    });

    // Load More Button
    loadMoreBtn.addEventListener('click', () => {
        visibleCount += 40;
        renderStocks();
    });

    // Add Ticker Button
    addTickerBtn.addEventListener('click', addTickerToDatabase);
    addTickerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addTickerToDatabase();
    });

    // Add Ticker needs the local Flask backend (live yfinance scrape). The
    // section is hidden by default and only revealed if the backend responds,
    // so the statically hosted version (GitHub Pages) never shows it.
    fetch('/api/stocks', { method: 'HEAD' })
        .then((r) => {
            if (r.ok) document.querySelector('.add-ticker-section').classList.remove('hidden');
        })
        .catch(() => {});

    // Modal Close
    closeModalBtn.addEventListener('click', closeModal);
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Modal Tabs Navigation
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetId = btn.dataset.target;
            document.querySelectorAll('.modal-tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // Buy Form calculations
    buyQty.addEventListener('input', updateBuySummary);
    buyPrice.addEventListener('input', updateBuySummary);
    buyConfirmBtn.addEventListener('click', executePortfolioTransaction);
}

// Switch between Screener, Portfolio, and Builder View Tabs
function switchTab(tabName) {
    const tabs = {
        screener: { btn: tabScreenerBtn, content: screenerTabContent },
        portfolio: { btn: tabPortfolioBtn, content: portfolioTabContent },
        builder: { btn: tabBuilderBtn, content: builderTabContent }
    };
    Object.entries(tabs).forEach(([name, tab]) => {
        tab.btn.classList.toggle('active', name === tabName);
        tab.content.classList.toggle('hidden', name !== tabName);
    });
    if (tabName === 'portfolio') renderPortfolioDashboard();
    if (tabName === 'builder') renderBuilder();
}

// Reset filter state
function resetFilters() {
    searchInput.value = '';
    sortBySelect.value = 'overall';
    sectorFilter.value = 'all';
    
    scoreRange.value = 0;
    scoreVal.textContent = '0';
    qualityRange.value = 0;
    qualityVal.textContent = '0';
    hypeRange.value = 0;
    hypeVal.textContent = '0';
    
    document.querySelectorAll('.badge-btn').forEach(b => b.classList.remove('active'));
    
    visibleCount = 40;
    activeFilters = {
        search: '',
        sortBy: 'overall',
        sector: 'all',
        minOverall: 0,
        minQuality: 0,
        minHype: 0,
        quickFilter: null
    };
    
    renderStocks();
}

// Populate Sector dropdown menu
function populateSectorFilter() {
    sectorFilter.innerHTML = '<option value="all">All Sectors</option>';
    const sectors = new Set();
    appData.stocks.forEach(stock => {
        if (stock.sector && stock.sector !== 'N/A') {
            sectors.add(stock.sector);
        }
    });
    Array.from(sectors).sort().forEach(sector => {
        const option = document.createElement('option');
        option.value = sector;
        option.textContent = sector;
        sectorFilter.appendChild(option);
    });
}

// Recalculates stats & ranks based on current weights
function recalculateAndRenderAll() {
    calculateOverallScoresBasedOnWeights();
    calculateSummaryStats();
    renderStocks();
}

// --- Dynamic Weight Balancing (Must add up to 100%) ---
function setupWeightsSliders() {
    const sliders = [
        { el: weightProfitability, key: 'profitability', valEl: weightProfitabilityVal },
        { el: weightCashflow, key: 'cash_flow', valEl: weightCashflowVal },
        { el: weightSafety, key: 'safety', valEl: weightSafetyVal },
        { el: weightHype, key: 'hype', valEl: weightHypeVal }
    ];

    sliders.forEach(slider => {
        slider.el.addEventListener('input', (e) => {
            const newValue = parseInt(e.target.value) / 100;
            const key = slider.key;
            
            // Calculate sum of other sliders
            const oldVal = rankingWeights[key];
            const diff = newValue - oldVal;
            
            // Distribute the difference proportionally among the other 3 sliders
            const keysToAdjust = sliders.map(s => s.key).filter(k => k !== key);
            const sumOthers = keysToAdjust.reduce((sum, k) => sum + rankingWeights[k], 0);
            
            if (sumOthers > 0) {
                keysToAdjust.forEach(k => {
                    const proportion = rankingWeights[k] / sumOthers;
                    rankingWeights[k] = Math.max(0, rankingWeights[k] - diff * proportion);
                });
            } else {
                // If all others were 0, distribute equally
                keysToAdjust.forEach(k => {
                    rankingWeights[k] = Math.max(0, (1 - newValue) / 3);
                });
            }
            
            rankingWeights[key] = newValue;
            
            // Adjust slider values in UI
            sliders.forEach(s => {
                const roundedPct = Math.round(rankingWeights[s.key] * 100);
                s.el.value = roundedPct;
                s.valEl.textContent = roundedPct + '%';
            });
            
            // Recalculate scores & re-render stocks
            recalculateAndRenderAll();
        });
    });
}

// Calculate the Overall score for each stock based on user's weighted percentages
function calculateOverallScoresBasedOnWeights() {
    appData.stocks.forEach(stock => {
        const pScore = stock.scores.profitability * rankingWeights.profitability;
        const cfScore = stock.scores.cash_flow * rankingWeights.cash_flow;
        const sScore = stock.scores.safety * rankingWeights.safety;
        const hScore = stock.scores.hype * rankingWeights.hype;
        
        stock.scores.overall = Math.round(pScore + cfScore + sScore + hScore);
    });
}

// Summary Statistics Panel update
function calculateSummaryStats() {
    if (appData.stocks.length === 0) return;
    
    statCount.textContent = appData.stocks.length;
    
    // Sort copy to find top picks
    const sortedByOverall = [...appData.stocks].sort((a, b) => b.scores.overall - a.scores.overall);
    const topOverall = sortedByOverall[0];
    statTopPick.textContent = `${topOverall.ticker} (${topOverall.scores.overall})`;
    
    let bestQuality = appData.stocks[0];
    let bestHype = appData.stocks[0];
    
    appData.stocks.forEach(stock => {
        if (stock.scores.quality > bestQuality.scores.quality) {
            bestQuality = stock;
        }
        if (stock.scores.hype > bestHype.scores.hype) {
            bestHype = stock;
        }
    });
    
    statHighestQuality.textContent = `${bestQuality.ticker} (${bestQuality.scores.quality})`;
    statHighestHype.textContent = `${bestHype.ticker} (${bestHype.scores.hype})`;
}

// --- Render Stock Screener Grid ---
function renderStocks() {
    let filtered = [...appData.stocks];
    
    if (activeFilters.sector !== 'all') {
        filtered = filtered.filter(s => s.sector === activeFilters.sector);
    }
    
    if (activeFilters.search) {
        filtered = filtered.filter(s => 
            s.ticker.toLowerCase().includes(activeFilters.search) || 
            s.name.toLowerCase().includes(activeFilters.search)
        );
    }
    
    filtered = filtered.filter(s => 
        s.scores.overall >= activeFilters.minOverall &&
        s.scores.quality >= activeFilters.minQuality &&
        s.scores.hype >= activeFilters.minHype
    );
    
    if (activeFilters.quickFilter) {
        switch (activeFilters.quickFilter) {
            case 'sound-giants':
                filtered = filtered.filter(s => s.scores.quality >= 70 && (s.market_cap || 0) >= 1e11);
                break;
            case 'high-growth-hype':
                filtered = filtered.filter(s => s.scores.hype >= 75);
                break;
            case 'cash-cows':
                filtered = filtered.filter(s => s.scores.cash_flow >= 70);
                break;
            case 'clean-balance':
                filtered = filtered.filter(s => s.scores.safety >= 70 && (s.debt_to_equity === null || s.debt_to_equity < 80));
                break;
        }
    }
    
    // Sort
    filtered.sort((a, b) => {
        switch (activeFilters.sortBy) {
            case 'overall':
                return b.scores.overall - a.scores.overall;
            case 'quality':
                return b.scores.quality - a.scores.quality;
            case 'hype':
                return b.scores.hype - a.scores.hype;
            case 'revenue_growth':
                return (b.revenue_growth || -999) - (a.revenue_growth || -999);
            case 'operating_margin':
                return (b.operating_margin || -999) - (a.operating_margin || -999);
            case 'market_cap':
                return (b.market_cap || 0) - (a.market_cap || 0);
            default:
                return 0;
        }
    });

    stocksGrid.innerHTML = '';
    
    if (filtered.length === 0) {
        noResults.classList.remove('hidden');
        loadMoreBtn.classList.add('hidden');
        return;
    }
    
    noResults.classList.add('hidden');
    
    // Check if we need to show the Load More button
    if (filtered.length > visibleCount) {
        loadMoreBtn.classList.remove('hidden');
    } else {
        loadMoreBtn.classList.add('hidden');
    }
    
    // Render sliced sub-array for performance
    const renderedStocks = filtered.slice(0, visibleCount);
    
    renderedStocks.forEach(stock => {
        const card = document.createElement('div');
        card.className = 'stock-card';
        card.addEventListener('click', () => openModal(stock));
        
        const return1y = stock.momentum_1y;
        const trendClass = return1y >= 0 ? 'positive' : 'negative';
        const trendIcon = return1y >= 0 ? 'fa-caret-up' : 'fa-caret-down';
        const formattedReturn = return1y !== null ? `${return1y >= 0 ? '+' : ''}${(return1y * 100).toFixed(1)}%` : 'N/A';
        
        card.innerHTML = `
            <div class="card-header">
                <div class="ticker-info">
                    <span class="ticker-badge">${stock.ticker}</span>
                    <span class="company-name" title="${stock.name}">${stock.name}</span>
                </div>
                <div class="card-price-area">
                    <div class="card-price">${formatPrice(stock.price)}</div>
                    <div class="price-change ${trendClass}">
                        <i class="fa-solid ${trendIcon}"></i> ${formattedReturn}
                    </div>
                </div>
            </div>
            
            <div class="card-sparkline-container">
                ${drawSparkline(stock.sparkline, return1y >= 0)}
            </div>
            
            <div class="card-scores-row">
                <div class="score-metric">
                    <div class="score-circle overall">${Math.round(stock.scores.overall)}</div>
                    <label>Overall</label>
                </div>
                <div class="score-metric">
                    <div class="score-circle quality">${Math.round(stock.scores.quality)}</div>
                    <label>Quality</label>
                </div>
                <div class="score-metric">
                    <div class="score-circle hype">${Math.round(stock.scores.hype)}</div>
                    <label>Hype</label>
                </div>
            </div>
            
            <div class="card-stats-list">
                <div class="card-stat-item">
                    <span>Mkt Cap</span>
                    <span>${formatLargeNum(stock.market_cap)}</span>
                </div>
                <div class="card-stat-item">
                    <span>Rev Growth</span>
                    <span>${formatPercent(stock.revenue_growth)}</span>
                </div>
                <div class="card-stat-item">
                    <span>Op Margin</span>
                    <span>${formatPercent(stock.operating_margin)}</span>
                </div>
                <div class="card-stat-item">
                    <span>ROE</span>
                    <span>${formatPercent(stock.roe)}</span>
                </div>
                <div class="card-stat-item">
                    <span>FCF Yield</span>
                    <span>${formatPercent(stock.fcf_yield)}</span>
                </div>
                <div class="card-stat-item">
                    <span>Debt/Equity</span>
                    <span>${stock.debt_to_equity !== null ? (stock.debt_to_equity / 100).toFixed(2) : 'N/A'}</span>
                </div>
            </div>
            
            <div class="card-footer">
                <div class="card-ceo"><i class="fa-solid fa-user"></i> CEO: ${stock.ceo}</div>
                <div class="card-sector">${stock.sector}</div>
            </div>
        `;
        stocksGrid.appendChild(card);
    });
}

// --- Dynamic Add Ticker Backend Request ---
async function addTickerToDatabase() {
    const ticker = addTickerInput.value.trim().toUpperCase();
    if (!ticker) return;

    // UI Feedback loading state
    addTickerBtn.disabled = true;
    addBtnText.classList.add('hidden');
    addBtnSpinner.classList.remove('hidden');
    
    addTickerMessage.className = 'add-ticker-msg hidden';
    addTickerMessage.textContent = '';

    try {
        const response = await fetch('/api/add-ticker', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ticker: ticker })
        });
        
        const result = await response.json();
        
        if (result.success) {
            addTickerMessage.className = 'add-ticker-msg success';
            addTickerMessage.textContent = `${ticker} was successfully scraped, ranked, and saved.`;
            addTickerMessage.classList.remove('hidden');
            
            // Update local stocks dataset and re-rank
            appData.stocks = result.stocks;
            populateSectorFilter();
            recalculateAndRenderAll();
            
            addTickerInput.value = '';
        } else {
            addTickerMessage.className = 'add-ticker-msg error';
            addTickerMessage.textContent = `Error: ${result.error || 'Failed to fetch ticker details.'}`;
            addTickerMessage.classList.remove('hidden');
        }
    } catch (e) {
        console.error("API error adding ticker:", e);
        addTickerMessage.className = 'add-ticker-msg error';
        addTickerMessage.textContent = `Network connection failure. Make sure the backend server is running.`;
        addTickerMessage.classList.remove('hidden');
    } finally {
        addTickerBtn.disabled = false;
        addBtnText.classList.remove('hidden');
        addBtnSpinner.classList.add('hidden');
    }
}

// --- Render Portfolio Dashboard ---
function renderPortfolioDashboard() {
    portfolioTableBody.innerHTML = '';
    
    if (mockPortfolio.length === 0) {
        emptyPortfolioMsg.classList.remove('hidden');
        document.getElementById('portfolioTable').classList.add('hidden');
        
        portfolioTotalValue.textContent = formatPrice(0);
        portfolioTotalInvested.textContent = formatPrice(0);
        portfolioProfitLoss.textContent = '$0.00 (0.00%)';
        portfolioProfitLoss.className = 'p-profit-loss neutral';
        portfolioQualityScore.textContent = '0';
        portfolioHypeScore.textContent = '0';
        return;
    }
    
    emptyPortfolioMsg.classList.add('hidden');
    document.getElementById('portfolioTable').classList.remove('hidden');
    
    let totalInvested = 0;
    let totalCurrentVal = 0;
    let weightedQualitySum = 0;
    let weightedHypeSum = 0;
    
    mockPortfolio.forEach((item, index) => {
        // Find latest price and scores from master stock list
        const masterStock = appData.stocks.find(s => s.ticker === item.ticker);
        const currentPrice = masterStock ? masterStock.price : item.buyPrice;
        const qScore = masterStock ? masterStock.scores.quality : 50;
        const hScore = masterStock ? masterStock.scores.hype : 50;
        const name = masterStock ? masterStock.name : item.ticker;
        
        const costBasis = item.buyPrice * item.shares;
        const currentVal = currentPrice * item.shares;
        const profit = currentVal - costBasis;
        const profitPct = costBasis > 0 ? (profit / costBasis) * 100 : 0;
        
        totalInvested += costBasis;
        totalCurrentVal += currentVal;
        
        weightedQualitySum += qScore * currentVal;
        weightedHypeSum += hScore * currentVal;
        
        const tr = document.createElement('tr');
        
        const profitClass = profit >= 0 ? 'positive' : 'negative';
        const profitSign = profit >= 0 ? '+' : '';
        
        tr.innerHTML = `
            <td>
                <div class="p-table-ticker">
                    <span>${item.ticker}</span>
                    <span>${name}</span>
                </div>
            </td>
            <td>${item.shares.toLocaleString(undefined, {maximumFractionDigits: 4})}</td>
            <td>${formatPrice(item.buyPrice)}</td>
            <td>${formatPrice(currentPrice)}</td>
            <td>${formatPrice(costBasis)}</td>
            <td class="val-bold">${formatPrice(currentVal)}</td>
            <td>
                <div class="p-table-scores">
                    <span class="p-table-badge q" title="Quality Score">${Math.round(qScore)}</span>
                    <span class="p-table-badge h" title="Hype Score">${Math.round(hScore)}</span>
                </div>
            </td>
            <td class="val-bold ${profitClass}">
                ${profitSign}${formatPrice(profit)}<br>
                <small>${profitSign}${profitPct.toFixed(2)}%</small>
            </td>
            <td>
                <button class="btn-danger" onclick="removePortfolioItem(${index})"><i class="fa-solid fa-trash-can"></i> Sell</button>
            </td>
        `;
        portfolioTableBody.appendChild(tr);
    });
    
    // Calculate portfolio aggregate summary
    const overallProfit = totalCurrentVal - totalInvested;
    const overallProfitPct = totalInvested > 0 ? (overallProfit / totalInvested) * 100 : 0;
    
    portfolioTotalValue.textContent = formatPrice(totalCurrentVal);
    portfolioTotalInvested.textContent = formatPrice(totalInvested);
    
    const profitClass = overallProfit >= 0 ? 'positive' : 'negative';
    const profitSign = overallProfit >= 0 ? '+' : '';
    portfolioProfitLoss.textContent = `${profitSign}${formatPrice(overallProfit)} (${profitSign}${overallProfitPct.toFixed(2)}%)`;
    portfolioProfitLoss.className = `p-profit-loss ${profitClass}`;
    
    // Weighted average score
    const avgQuality = totalCurrentVal > 0 ? weightedQualitySum / totalCurrentVal : 0;
    const avgHype = totalCurrentVal > 0 ? weightedHypeSum / totalCurrentVal : 0;
    
    portfolioQualityScore.textContent = Math.round(avgQuality);
    portfolioHypeScore.textContent = Math.round(avgHype);
}

// Window global function so the inline HTML button can trigger it
window.removePortfolioItem = function(index) {
    mockPortfolio.splice(index, 1);
    savePortfolioToStorage();
    renderPortfolioDashboard();
};

// --- Open Details Modal & Fill Tabs ---
function openModal(stock) {
    selectedStock = stock;
    
    // Reset modal tabs active state (back to Overview)
    document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-target="modalTabOverview"]').classList.add('active');
    document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('modalTabOverview').classList.remove('hidden');

    // Fill Header
    modalTicker.textContent = stock.ticker;
    modalName.textContent = stock.name;
    modalSectorIndustry.textContent = `${stock.sector} &bull; ${stock.industry}`;
    modalPrice.textContent = formatPrice(stock.price);
    
    const return1y = stock.momentum_1y;
    modalChange.className = `modal-change ${return1y >= 0 ? 'positive' : 'negative'}`;
    modalChange.innerHTML = `${return1y >= 0 ? '<i class="fa-solid fa-caret-up"></i>' : '<i class="fa-solid fa-caret-down"></i>'} ${return1y !== null ? (return1y * 100).toFixed(1) : '0.0'}% (1 Year)`;
    
    // Fill Overview Content
    modalSummary.textContent = stock.summary;
    if (stock.website) {
        modalWebsite.href = stock.website;
        modalWebsite.classList.remove('hidden');
    } else {
        modalWebsite.classList.add('hidden');
    }
    
    modalCeoName.textContent = stock.ceo;
    
    // Officers
    modalOfficersList.innerHTML = '';
    if (stock.officers && stock.officers.length > 0) {
        stock.officers.forEach(off => {
            if (off.name === stock.ceo) return;
            const salaryText = off.salary ? formatPrice(off.salary) : 'N/A';
            const item = document.createElement('div');
            item.className = 'officer-item';
            item.innerHTML = `
                <div>
                    <span class="officer-name">${off.name}</span>
                    <div class="officer-title">${off.title}</div>
                </div>
                <span class="officer-pay">${salaryText}</span>
            `;
            modalOfficersList.appendChild(item);
        });
    } else {
        modalOfficersList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No executive team data listed.</div>';
    }
    
    // Scores
    modalOverallScore.textContent = Math.round(stock.scores.overall);
    const overallColor = '#818cf8';
    modalRadialOverall.style.background = `radial-gradient(closest-side, #0f1322 79%, transparent 80% 100%), conic-gradient(${overallColor} ${stock.scores.overall}%, rgba(255, 255, 255, 0.05) 0)`;
    
    modalProfitabilityScore.textContent = Math.round(stock.scores.profitability) + '%';
    modalProfitabilityFill.style.width = stock.scores.profitability + '%';
    modalCashflowScore.textContent = Math.round(stock.scores.cash_flow) + '%';
    modalCashflowFill.style.width = stock.scores.cash_flow + '%';
    modalSafetyScore.textContent = Math.round(stock.scores.safety) + '%';
    modalSafetyFill.style.width = stock.scores.safety + '%';
    modalHypeScore.textContent = Math.round(stock.scores.hype) + '%';
    modalHypeFill.style.width = stock.scores.hype + '%';
    
    // Financial Ratios Table
    tableOpMargin.textContent = formatPercent(stock.operating_margin);
    tableNetMargin.textContent = formatPercent(stock.net_margin);
    tableRoe.textContent = formatPercent(stock.roe);
    tableRoa.textContent = formatPercent(stock.roa);
    tableRevGrowth.textContent = formatPercent(stock.revenue_growth);
    tableEarnGrowth.textContent = formatPercent(stock.earnings_growth);
    tableDebtEquity.textContent = stock.debt_to_equity !== null ? (stock.debt_to_equity / 100).toFixed(2) : 'N/A';
    tableCurrentRatio.textContent = stock.current_ratio !== null ? stock.current_ratio.toFixed(2) : 'N/A';
    tableForwardPe.textContent = stock.forward_pe !== null ? stock.forward_pe.toFixed(1) : 'N/A';
    tableTrailingPe.textContent = stock.trailing_pe !== null ? stock.trailing_pe.toFixed(1) : 'N/A';
    tablePriceToBook.textContent = stock.price_to_book !== null ? stock.price_to_book.toFixed(1) : 'N/A';
    tableDivYield.textContent = stock.dividend_yield !== null ? (stock.dividend_yield * 100).toFixed(2) + '%' : 'N/A';
    
    // Fill Historical Statements Tab Table
    renderHistoricalStatementsTable(stock);

    // Reset Buy Form
    buyQty.value = '';
    buyPrice.value = stock.price ? stock.price.toFixed(2) : '';
    buyTotalCost.textContent = '$0.00';
    buySuccessMessage.classList.add('hidden');
    buySuccessMessage.textContent = '';
    
    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Generate the 3-Year historical statements table
function renderHistoricalStatementsTable(stock) {
    modalHistoryTableBody.innerHTML = '';
    modalHistoryTableHeaders.innerHTML = '<th>Financial Concept</th>';
    
    const history = stock.history;
    if (!history || history.length === 0) {
        modalHistoryTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">No historical financial statements found for this ticker.</td></tr>';
        return;
    }
    
    // Sort history by year descending (latest first)
    history.sort((a, b) => b.year - a.year);
    
    // Populate headers with years
    history.forEach(item => {
        const th = document.createElement('th');
        th.textContent = `FY ${item.year}`;
        modalHistoryTableHeaders.appendChild(th);
    });
    
    // Define rows we want to show
    const rows = [
        { label: 'Revenue (Sales)', key: 'revenue', icon: 'fa-funnel-dollar' },
        { label: 'Gross Profit', key: 'gross_profit', icon: 'fa-wallet' },
        { label: 'Operating Income', key: 'operating_income', icon: 'fa-scale-balanced' },
        { label: 'Net Income (Earnings)', key: 'net_income', icon: 'fa-circle-dollar-to-slot' },
        { label: 'Operating Cash Flow', key: 'operating_cash_flow', icon: 'fa-money-bill-transfer' },
        { label: 'Capital Expenditure (CapEx)', key: 'capex', icon: 'fa-building-shield' },
        { label: 'Free Cash Flow', key: 'free_cash_flow', icon: 'fa-coins' },
        { label: 'Total Assets', key: 'total_assets', icon: 'fa-vault' },
        { label: 'Total Liabilities', key: 'total_liabilities', icon: 'fa-file-invoice-dollar' },
        { label: 'Total Long-term Debt', key: 'total_debt', icon: 'fa-landmark' }
    ];
    
    rows.forEach(row => {
        const tr = document.createElement('tr');
        let html = `<td><i class="fa-solid ${row.icon}" style="margin-right: 0.5rem; color: var(--text-secondary); width: 1.1rem;"></i>${row.label}</td>`;
        
        history.forEach(item => {
            const val = item[row.key];
            const formatted = val !== null ? formatLargeNum(val) : 'N/A';
            html += `<td class="val-bold">${formatted}</td>`;
        });
        
        tr.innerHTML = html;
        modalHistoryTableBody.appendChild(tr);
    });
}

// Update estimated total cost in Buy Form
function updateBuySummary() {
    const qty = parseFloat(buyQty.value) || 0;
    const price = parseFloat(buyPrice.value) || 0;
    const total = qty * price;
    buyTotalCost.textContent = formatPrice(total);
}

// Add shares to Mock Portfolio
function executePortfolioTransaction() {
    const qty = parseFloat(buyQty.value);
    const price = parseFloat(buyPrice.value);
    
    if (isNaN(qty) || qty <= 0) {
        alert("Please enter a valid positive number of shares.");
        return;
    }
    if (isNaN(price) || price <= 0) {
        alert("Please enter a valid purchase price.");
        return;
    }
    
    // Check if asset already exists in portfolio to average it out
    const existing = mockPortfolio.find(item => item.ticker === selectedStock.ticker);
    if (existing) {
        const oldCostBasis = existing.buyPrice * existing.shares;
        const newCostBasis = price * qty;
        
        existing.shares += qty;
        existing.buyPrice = (oldCostBasis + newCostBasis) / existing.shares;
    } else {
        mockPortfolio.push({
            ticker: selectedStock.ticker,
            shares: qty,
            buyPrice: price
        });
    }
    
    savePortfolioToStorage();
    
    buySuccessMessage.innerHTML = `<i class="fa-solid fa-circle-check"></i> Successfully added ${qty.toLocaleString()} shares of ${selectedStock.ticker} to portfolio!`;
    buySuccessMessage.classList.remove('hidden');
    
    buyQty.value = '';
    updateBuySummary();
}

function closeModal() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    selectedStock = null;
}

// --- Formatting Helpers ---
function formatPrice(val) {
    if (val === null || val === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatPercent(val) {
    if (val === null || val === undefined) return 'N/A';
    return (val * 100).toFixed(1) + '%';
}

function formatLargeNum(num) {
    if (num === null || num === undefined) return 'N/A';
    const absolute = Math.abs(num);
    let formatted = num.toLocaleString();
    
    if (absolute >= 1.0e12) formatted = (num / 1.0e12).toFixed(2) + 'T';
    else if (absolute >= 1.0e9) formatted = (num / 1.0e9).toFixed(2) + 'B';
    else if (absolute >= 1.0e6) formatted = (num / 1.0e6).toFixed(2) + 'M';
    
    return formatted;
}

// --- Draw SVG Sparkline ---
function drawSparkline(prices, isPositive) {
    if (!prices || prices.length < 2) {
        return `<div style="color: var(--text-muted); font-size: 0.75rem;">No price trend</div>`;
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
    
    return `
        <svg viewBox="0 0 ${width} ${height}" class="sparkline-svg">
            <polyline fill="none" stroke="${strokeColor}" stroke-width="2" points="${points}" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `;
}

// ==========================================
// --- Portfolio Builder Tab ---
// Pipeline logic lives in portfolio-builder-core.js (window.PortfolioBuilder);
// this section only wires config <-> UI and renders results.
// ==========================================

const tabBuilderBtn = document.getElementById('tabBuilderBtn');
const builderTabContent = document.getElementById('builderTabContent');
const pbStaleBanner = document.getElementById('pbStaleBanner');
const pbSurvivorCount = document.getElementById('pbSurvivorCount');
const pbUniverseCount = document.getElementById('pbUniverseCount');
const pbWarning = document.getElementById('pbWarning');
const pbTableBody = document.getElementById('pbTableBody');
const pbTotalCad = document.getElementById('pbTotalCad');
const pbUsPortion = document.getElementById('pbUsPortion');
const pbFxCost = document.getElementById('pbFxCost');
const pbExportCsv = document.getElementById('pbExportCsv');

// Study sheet modal elements
const studyModal = document.getElementById('studyModal');
const closeStudyBtn = document.getElementById('closeStudyBtn');
const studyTicker = document.getElementById('studyTicker');
const studyName = document.getElementById('studyName');
const studySector = document.getElementById('studySector');
const studyScoreBadge = document.getElementById('studyScoreBadge');
const studySummary = document.getElementById('studySummary');
const studyMetricsBody = document.getElementById('studyMetricsBody');
const studyChecklist = document.getElementById('studyChecklist');
const studyOpenDetails = document.getElementById('studyOpenDetails');

const STUDY_CHECKLIST_ITEMS = [
    'I can explain in one sentence what this company sells and who pays for it.',
    'I read (or read about) its latest quarterly earnings.',
    'I checked the analyst consensus on TipRanks and investigated any clash with this score.',
    'I understand WHY it scored high here: growth, momentum, or both.',
    'I accept this position could fall 40%+ in a bad year, and I would not panic-sell.'
];

// Builder state: persisted to localStorage so the configuration survives reloads
let builderState = {
    floor: { fcf: true, current: true, debt: true, rev: true, mcap: true },
    weights: { revenue_growth: 30, earnings_growth: 15, momentum: 35, quality: 20 },
    n: 18,
    sectorCap: 30,
    maxPos: 10,
    minPos: 3,
    totalCad: 10000,
    study: {} // ticker -> [bool x5]
};

let builderResult = []; // last computed weighted allocation
let studyStock = null;  // stock currently open in the study modal

function loadBuilderState() {
    try {
        const saved = JSON.parse(localStorage.getItem('soundhype_builder'));
        if (saved && typeof saved === 'object') {
            builderState = {
                ...builderState,
                ...saved,
                floor: { ...builderState.floor, ...(saved.floor || {}) },
                weights: { ...builderState.weights, ...(saved.weights || {}) },
                study: saved.study || {}
            };
        }
    } catch (e) { /* corrupted storage: keep defaults */ }
}

function saveBuilderState() {
    localStorage.setItem('soundhype_builder', JSON.stringify(builderState));
}

function builderFloorConfig() {
    const f = builderState.floor;
    return {
        // Disabled toggle = threshold relaxed to "always passes".
        // (Missing-data exclusion in the core always applies regardless.)
        hypergrowthRevenueGrowth: f.fcf ? 0.30 : -Infinity,
        minCurrentRatio: f.current ? 1.0 : -Infinity,
        maxDebtToEquity: f.debt ? 200 : Infinity,
        minRevenueGrowth: f.rev ? 0 : -Infinity,
        minMarketCap: f.mcap ? 2e9 : 0
    };
}

function setupBuilder() {
    loadBuilderState();

    // Panel 1: floor toggles
    const floorToggles = [
        { el: document.getElementById('pbFloorFcf'), key: 'fcf' },
        { el: document.getElementById('pbFloorCurrent'), key: 'current' },
        { el: document.getElementById('pbFloorDebt'), key: 'debt' },
        { el: document.getElementById('pbFloorRev'), key: 'rev' },
        { el: document.getElementById('pbFloorMcap'), key: 'mcap' }
    ];
    floorToggles.forEach(t => {
        t.el.checked = builderState.floor[t.key];
        t.el.addEventListener('change', () => {
            builderState.floor[t.key] = t.el.checked;
            saveBuilderState();
            renderBuilder();
        });
    });

    // Panel 2: growth weights (auto-balance to 100, same pattern as the screener sliders)
    const weightSliders = [
        { el: document.getElementById('pbWRev'), valEl: document.getElementById('pbWRevVal'), key: 'revenue_growth' },
        { el: document.getElementById('pbWEarn'), valEl: document.getElementById('pbWEarnVal'), key: 'earnings_growth' },
        { el: document.getElementById('pbWMom'), valEl: document.getElementById('pbWMomVal'), key: 'momentum' },
        { el: document.getElementById('pbWQual'), valEl: document.getElementById('pbWQualVal'), key: 'quality' }
    ];
    const syncWeightSliders = () => {
        weightSliders.forEach(s => {
            const v = Math.round(builderState.weights[s.key]);
            s.el.value = v;
            s.valEl.textContent = v + '%';
        });
    };
    weightSliders.forEach(slider => {
        slider.el.addEventListener('input', (e) => {
            const w = builderState.weights;
            const newValue = parseInt(e.target.value);
            const diff = newValue - w[slider.key];
            const otherKeys = weightSliders.map(s => s.key).filter(k => k !== slider.key);
            const sumOthers = otherKeys.reduce((sum, k) => sum + w[k], 0);
            otherKeys.forEach(k => {
                const proportion = sumOthers > 0 ? w[k] / sumOthers : 1 / otherKeys.length;
                w[k] = Math.max(0, w[k] - diff * proportion);
            });
            w[slider.key] = newValue;
            syncWeightSliders();
            saveBuilderState();
            renderBuilder();
        });
    });
    syncWeightSliders();

    // Panel 3: guardrail sliders
    const guardSliders = [
        { el: document.getElementById('pbSize'), valEl: document.getElementById('pbSizeVal'), key: 'n' },
        { el: document.getElementById('pbSectorCap'), valEl: document.getElementById('pbSectorCapVal'), key: 'sectorCap' },
        { el: document.getElementById('pbMaxPos'), valEl: document.getElementById('pbMaxPosVal'), key: 'maxPos' },
        { el: document.getElementById('pbMinPos'), valEl: document.getElementById('pbMinPosVal'), key: 'minPos' }
    ];
    guardSliders.forEach(s => {
        s.el.value = builderState[s.key];
        s.valEl.textContent = builderState[s.key];
        s.el.addEventListener('input', (e) => {
            builderState[s.key] = parseInt(e.target.value);
            s.valEl.textContent = e.target.value;
            saveBuilderState();
            renderBuilder();
        });
    });

    // Panel 4: amount + CSV
    pbTotalCad.value = builderState.totalCad;
    pbTotalCad.addEventListener('input', () => {
        builderState.totalCad = parseFloat(pbTotalCad.value) || 0;
        saveBuilderState();
        renderBuilder();
    });
    pbExportCsv.addEventListener('click', exportBuilderCsv);

    // Study sheet modal
    closeStudyBtn.addEventListener('click', closeStudyModal);
    studyModal.addEventListener('click', (e) => {
        if (e.target === studyModal) closeStudyModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !studyModal.classList.contains('hidden')) closeStudyModal();
    });
    studyOpenDetails.addEventListener('click', () => {
        const stock = studyStock;
        closeStudyModal();
        if (stock) openModal(stock);
    });
}

// Which active floor filter excludes the most stocks right now?
function findTightestFilter(stocks) {
    const labels = {
        fcf: 'Positive free cash flow',
        current: 'Current ratio ≥ 1',
        debt: 'Debt-to-equity ≤ 2.0×',
        rev: 'Revenue growing',
        mcap: 'Market cap ≥ $2B'
    };
    const baseCount = PortfolioBuilder.applyQualityFloor(stocks, builderFloorConfig()).length;
    let best = null;
    Object.keys(builderState.floor).forEach(key => {
        if (!builderState.floor[key]) return;
        const relaxed = { ...builderState.floor, [key]: false };
        const saved = builderState.floor;
        builderState.floor = relaxed;
        const gain = PortfolioBuilder.applyQualityFloor(stocks, builderFloorConfig()).length - baseCount;
        builderState.floor = saved;
        if (gain > 0 && (!best || gain > best.gain)) best = { key, gain, label: labels[key] };
    });
    return best;
}

function renderBuilder() {
    if (!appData.stocks.length || !builderTabContent) return;

    // Stale-data banner (last_updated format: "YYYY-MM-DD HH:MM:SS")
    const updatedMs = Date.parse((appData.lastUpdated || '').replace(' ', 'T'));
    const isStale = !isNaN(updatedMs) && (Date.now() - updatedMs) > 7 * 24 * 3600 * 1000;
    pbStaleBanner.classList.toggle('hidden', !isStale);

    // Run the pipeline
    const survivors = PortfolioBuilder.applyQualityFloor(appData.stocks, builderFloorConfig());
    const ranked = PortfolioBuilder.computeGrowthScores(survivors, builderState.weights);
    const picked = PortfolioBuilder.selectPortfolio(ranked, { n: builderState.n, sectorCapPct: builderState.sectorCap });
    builderResult = PortfolioBuilder.computeWeights(picked, { minPct: builderState.minPos, maxPct: builderState.maxPos });

    pbUniverseCount.textContent = appData.stocks.length;
    pbSurvivorCount.textContent = survivors.length;

    // Shortfall warning naming the tightest filter
    if (builderResult.length < builderState.n) {
        const tightest = findTightestFilter(appData.stocks);
        pbWarning.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>
            <span>Only ${builderResult.length} of the ${builderState.n} requested stocks are available.
            ${tightest ? `The tightest filter is <strong>${tightest.label}</strong> (excludes ${tightest.gain} more stocks) — relax it, or lower the sector cap requirement.` : 'Relax a quality filter or reduce the portfolio size.'}</span>`;
        pbWarning.classList.remove('hidden');
    } else {
        pbWarning.classList.add('hidden');
    }

    // FX estimate
    const fx = PortfolioBuilder.estimateFxCost(builderResult, builderState.totalCad, 1.5);
    pbUsPortion.textContent = `${fx.usWeightPct.toFixed(1)}% (${formatPrice(fx.usPortionCad)})`;
    pbFxCost.textContent = formatPrice(fx.costCad);

    // Results table
    pbTableBody.innerHTML = '';
    builderResult.forEach((stock, i) => {
        const amount = builderState.totalCad * stock.weightPct / 100;
        const done = (builderState.study[stock.ticker] || []).filter(Boolean).length;
        const studyClass = done === STUDY_CHECKLIST_ITEMS.length ? 'done' : (done > 0 ? 'partial' : '');
        const isCanadian = stock.ticker.endsWith('.TO');
        const tr = document.createElement('tr');
        tr.className = 'pb-row';
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>
                <div class="p-table-ticker">
                    <span>${stock.ticker} ${isCanadian ? '<span class="pb-flag" title="Canadian listing — no FX conversion needed">CAD</span>' : ''}</span>
                    <span>${stock.name}</span>
                </div>
            </td>
            <td>${stock.sector}</td>
            <td><span class="p-table-badge h">${stock.growthScore.toFixed(1)}</span></td>
            <td class="val-bold">${stock.weightPct.toFixed(2)}%</td>
            <td class="val-bold">${formatPrice(amount)}</td>
            <td><span class="pb-study-badge ${studyClass}">${done}/${STUDY_CHECKLIST_ITEMS.length}</span></td>
        `;
        tr.addEventListener('click', () => openStudyModal(stock));
        pbTableBody.appendChild(tr);
    });
}

// --- Study Sheet Modal ---
function openStudyModal(stock) {
    studyStock = stock;
    studyTicker.textContent = stock.ticker;
    studyName.textContent = stock.name;
    studySector.textContent = `${stock.sector} • ${stock.industry || ''}`;
    studyScoreBadge.textContent = stock.growthScore.toFixed(1);
    studySummary.textContent = stock.summary || 'No description available.';

    // Score explanation: metric value + percentile vs the other survivors
    const survivors = PortfolioBuilder.applyQualityFloor(appData.stocks, builderFloorConfig());
    const momOf = s => (s.momentum_6m + s.momentum_1y) / 2;
    const pct = (series, v) => PortfolioBuilder.computePercentile(series, v);
    const w = builderState.weights;
    const totalW = w.revenue_growth + w.earnings_growth + w.momentum + w.quality;
    const rows = [
        { label: 'Revenue growth (YoY)', value: formatPercent(stock.revenue_growth), pctile: pct(survivors.map(s => s.revenue_growth), stock.revenue_growth), weight: w.revenue_growth },
        { label: 'Earnings growth (YoY)', value: formatPercent(stock.earnings_growth), pctile: pct(survivors.map(s => s.earnings_growth), stock.earnings_growth), weight: w.earnings_growth },
        { label: 'Momentum (6m + 1y avg)', value: formatPercent(momOf(stock)), pctile: pct(survivors.map(momOf), momOf(stock)), weight: w.momentum },
        { label: 'Quality score', value: Math.round(stock.scores.quality) + '/100', pctile: stock.scores.quality, weight: w.quality }
    ];
    studyMetricsBody.innerHTML = rows.map(r => `
        <tr>
            <td>${r.label}</td>
            <td class="val-bold">${r.value}</td>
            <td>${Math.round(r.pctile)}th pctile</td>
            <td class="val-bold">${totalW > 0 ? Math.round(r.weight / totalW * 100) : 0}% of score</td>
        </tr>
    `).join('');

    // Homework checklist with persisted state
    const state = builderState.study[stock.ticker] || STUDY_CHECKLIST_ITEMS.map(() => false);
    studyChecklist.innerHTML = '';
    STUDY_CHECKLIST_ITEMS.forEach((item, i) => {
        const label = document.createElement('label');
        label.className = 'pb-check-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!state[i];
        cb.addEventListener('change', () => {
            const arr = builderState.study[stock.ticker] || STUDY_CHECKLIST_ITEMS.map(() => false);
            arr[i] = cb.checked;
            builderState.study[stock.ticker] = arr;
            saveBuilderState();
            renderBuilder(); // refresh the n/5 badge
        });
        const span = document.createElement('span');
        span.textContent = item;
        label.appendChild(cb);
        label.appendChild(span);
        studyChecklist.appendChild(label);
    });

    studyModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeStudyModal() {
    studyModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    studyStock = null;
}

// --- CSV export (Wealthsimple-ready weights) ---
function exportBuilderCsv() {
    if (!builderResult.length) return;
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const header = 'Ticker,Company,Sector,Growth Score,Weight %,Amount CAD';
    const lines = builderResult.map(s => [
        esc(s.ticker), esc(s.name), esc(s.sector),
        s.growthScore.toFixed(1), s.weightPct.toFixed(2),
        (builderState.totalCad * s.weightPct / 100).toFixed(2)
    ].join(','));
    const blob = new Blob([header + '\n' + lines.join('\n') + '\n'], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'soundhype-allocation.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}
