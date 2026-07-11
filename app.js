'use strict';

const STORAGE_KEY = 'github_portfolio_v7_lux';
const TWSE_URL = './data/market.json';
const GAS_AI_URL = './data/report.json';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_STOCKS = 500;

const defaultStocks = Object.freeze([
    { id: '1', symbol: '00403A', name: '主動統一升級50', shares: 15000, cost: 10.13, price: 10.48 },
    { id: '2', symbol: '00878', name: '國泰永續高股息', shares: 25000, cost: 18.72, price: 33.19 },
    { id: '3', symbol: '009816', name: '凱基台灣TOP50', shares: 15000, cost: 10.88, price: 15.23 },
    { id: '4', symbol: '00981A', name: '主動統一台股增長', shares: 14000, cost: 26.25, price: 29.95 },
    { id: '5', symbol: '1216', name: '統一', shares: 3000, cost: 61.79, price: 78.40 },
    { id: '6', symbol: '1717', name: '長興', shares: 2000, cost: 37.19, price: 73.80 },
    { id: '7', symbol: '2886', name: '兆豐金', shares: 10000, cost: 33.44, price: 46.70 },
    { id: '8', symbol: '6274', name: '台燿', shares: 1000, cost: 157.48, price: 1570 },
    { id: '9', symbol: '8028', name: '昇陽半導體', shares: 2000, cost: 75.84, price: 312.5 },
    { id: '10', symbol: '8112', name: '至上', shares: 5000, cost: 47.69, price: 85 },
    { id: '11', symbol: '2881', name: '富邦金', shares: 8000, cost: 26.7, price: 124.5 },
    { id: '12', symbol: 'MA', name: '銀行資產', shares: 0, cost: 1, price: 1 }
]);

let stocks = loadStocks();
let currentEditingId = null;

function cloneDefaults() {
    return defaultStocks.map((stock) => ({ ...stock }));
}

function isFiniteInRange(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
}

function normalizeStock(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const id = typeof value.id === 'string' ? value.id.trim().slice(0, 64) : '';
    const symbol = typeof value.symbol === 'string' ? value.symbol.trim().toUpperCase().slice(0, 20) : '';
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '';
    const shares = Number(value.shares);
    const cost = Number(value.cost);
    const price = Number(value.price);

    if (!id || !symbol || !name || !Number.isSafeInteger(shares) ||
        !isFiniteInRange(shares, 0, 1e12) || !isFiniteInRange(cost, 0, 1e9) ||
        !isFiniteInRange(price, 0, 1e9)) return null;

    return { id, symbol, name, shares, cost, price: symbol === 'MA' ? 1 : price };
}

function loadStocks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return cloneDefaults();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length > MAX_STOCKS) throw new Error('invalid portfolio');
        const normalized = parsed.map(normalizeStock);
        if (normalized.some((stock) => !stock)) throw new Error('invalid stock');
        if (new Set(normalized.map((stock) => stock.id)).size !== normalized.length) throw new Error('duplicate id');
        return normalized;
    } catch (error) {
        console.warn('Invalid local portfolio was ignored.', error);
        return cloneDefaults();
    }
}

function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stocks));
        return true;
    } catch (error) {
        console.error('Unable to save portfolio.', error);
        document.getElementById('update-status').textContent = '儲存失敗 · 瀏覽器可能已停用本機儲存';
        return false;
    }
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function renderPortfolio() {
    const container = document.getElementById('stock-list-container');
    container.replaceChildren();
    let totalMarketValue = 0;
    let totalCostValue = 0;

    stocks.forEach((stock) => {
        const costSum = stock.shares * stock.cost;
        const marketValueSum = stock.shares * stock.price;
        const profit = marketValueSum - costSum;
        const profitPercent = costSum > 0 ? (profit / costSum) * 100 : 0;
        totalMarketValue += marketValueSum;
        totalCostValue += costSum;

        const card = element('div', 'glass-panel border border-slate-800/70 rounded-2xl p-5 flex flex-wrap justify-between items-center gap-4 active:bg-slate-800/80 transition cursor-pointer shadow-md');
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.addEventListener('click', () => openEditModal(stock));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openEditModal(stock);
            }
        });

        const details = element('div', 'space-y-1.5 min-w-[200px] flex-1');
        const title = element('div', 'flex items-baseline gap-2 flex-wrap');
        title.append(element('span', 'font-mono font-black text-slate-400 text-sm', stock.symbol));
        title.append(element('span', 'font-black text-slate-100 text-base tracking-wide', stock.name));
        details.append(title);

        const description = element('div', 'text-xs text-slate-400 font-bold leading-relaxed');
        if (stock.symbol === 'MA') {
            description.append('可用餘額: ', element('span', 'money-value text-slate-200', stock.shares.toLocaleString()), ' 元');
        } else {
            description.append('庫存: ', element('span', 'money-value text-slate-200', stock.shares.toLocaleString()), ' 股 · 成本: ', element('span', 'money-value text-slate-200', String(stock.cost)), document.createElement('br'), '最新收盤價: ', element('span', 'money-value text-teal-400 font-extrabold', stock.price.toLocaleString()), ' 元');
        }
        details.append(description);

        const summary = element('div', 'flex items-center gap-3.5 ml-auto text-right flex-wrap justify-end');
        const values = element('div', 'space-y-1');
        values.append(element('div', 'money-value font-mono font-black text-slate-200 text-base', `$${Math.round(marketValueSum).toLocaleString()}`));
        values.append(element('div', 'money-value text-xs text-slate-400 font-bold', `成本 $${Math.round(costSum).toLocaleString()}`));
        const profitClass = stock.symbol === 'MA' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : profit >= 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        const badgeText = stock.symbol === 'MA' ? '儲蓄' : `${profit >= 0 ? '+' : ''}${profitPercent.toFixed(1)}%`;
        summary.append(values, element('div', `money-value px-2.5 py-1.5 rounded-xl text-xs font-mono font-black border ${profitClass} min-w-[82px] text-center shadow-inner shrink-0`, badgeText));
        card.append(details, summary);
        container.append(card);
    });

    const totalProfit = totalMarketValue - totalCostValue;
    const totalProfitPercent = totalCostValue > 0 ? (totalProfit / totalCostValue) * 100 : 0;
    document.getElementById('total-value').textContent = `$${Math.round(totalMarketValue).toLocaleString()}`;
    document.getElementById('total-cost').textContent = `$${Math.round(totalCostValue).toLocaleString()}`;
    const totalProfitEl = document.getElementById('total-profit');
    totalProfitEl.textContent = `${totalProfit >= 0 ? '+' : ''}${Math.round(totalProfit).toLocaleString()} (${totalProfitPercent.toFixed(2)}%)`;
    totalProfitEl.className = `money-value responsive-profit font-black text-base ${totalProfit >= 0 ? 'text-rose-400' : 'text-green-400'}`;
}

async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchPricesDirectly() {
    const btn = document.getElementById('btn-refresh');
    const status = document.getElementById('update-status');
    btn.textContent = '⏳ 同步中…';
    btn.disabled = true;
    try {
        const payload = await fetchJson(TWSE_URL);
        const rawData = payload?.stocks;
        if (!Array.isArray(rawData) || typeof payload.asOf !== 'string') throw new Error('Unexpected market response');
        const prices = new Map();
        rawData.forEach((item) => {
            const code = typeof item.Code === 'string' ? item.Code.trim() : '';
            const price = Number.parseFloat(item.ClosingPrice);
            if (code && Number.isFinite(price) && price > 0) prices.set(code, price);
        });
        let updated = 0;
        let missing = 0;
        stocks = stocks.map((stock) => {
            if (stock.symbol === 'MA') return { ...stock, price: 1 };
            const price = prices.get(stock.symbol);
            if (!price) {
                missing += 1;
                return stock;
            }
            updated += 1;
            return { ...stock, price };
        });
        const timestamp = new Date(payload.asOf);
        if (Number.isNaN(timestamp.getTime())) throw new Error('Invalid market timestamp');
        status.textContent = `行情資料 ${timestamp.toLocaleString('zh-TW', { hour12: false })} · 更新 ${updated} 筆 · 未找到 ${missing} 筆 · 固定資產略過`;
        saveToLocalStorage();
        renderPortfolio();
    } catch (error) {
        console.error('Price sync failed.', error);
        status.textContent = '行情服務連線或資料解析失敗 · 保留上次資料';
    } finally {
        btn.textContent = '🔄 同步數據';
        btn.disabled = false;
    }
}

async function fetchAiReportFromGas() {
    const date = document.getElementById('ai-date');
    const content = document.getElementById('ai-report-content');
    try {
        const data = await fetchJson(GAS_AI_URL);
        if (!data || typeof data.date !== 'string' || typeof data.report !== 'string' || typeof data.fetchedAt !== 'string' || !['passed', 'rejected'].includes(data.validation)) throw new Error('Unexpected report response');
        date.textContent = data.date.slice(0, 40);
        content.textContent = data.report.slice(0, 50000);
    } catch (error) {
        console.error('Report sync failed.', error);
        date.textContent = '無法更新';
        content.textContent = '市場晨報服務暫時無法連線或回傳格式不正確。';
    }
}

function fetchAllData() {
    void Promise.allSettled([fetchPricesDirectly(), fetchAiReportFromGas()]);
}

function toggleModal(show) {
    const modal = document.getElementById('stock-modal');
    modal.classList.toggle('hidden', !show);
    if (!show) {
        document.getElementById('stock-form').reset();
        currentEditingId = null;
        document.getElementById('btn-delete').classList.add('hidden');
        document.getElementById('yahoo-link-container').style.display = 'none';
    }
}

function openEditModal(stock) {
    currentEditingId = stock.id;
    document.getElementById('form-symbol').value = stock.symbol;
    document.getElementById('form-name').value = stock.name;
    document.getElementById('form-shares').value = stock.shares;
    document.getElementById('form-cost').value = stock.cost;
    document.getElementById('form-price').value = stock.price;
    document.getElementById('btn-delete').classList.remove('hidden');

    const urls = {
        '00403A': 'https://tw.stock.yahoo.com/fund/summary/F0000179A9:FO',
        '00981A': 'https://tw.stock.yahoo.com/fund/summary/F000016N6K:FO',
        'MA': 'https://tw.stock.yahoo.com/'
    };
    const target = urls[stock.symbol] || `https://tw.stock.yahoo.com/quote/${encodeURIComponent(stock.symbol)}`;
    const button = document.getElementById('yahoo-stock-link-btn');
    button.textContent = stock.symbol === 'MA' ? '🔍 查看大盤走勢 (Yahoo 股市)' : `🔍 查詢 ${stock.symbol} 盤勢 (Yahoo 股市)`;
    button.onclick = () => window.open(target, '_blank', 'noopener,noreferrer');
    document.getElementById('yahoo-link-container').style.display = 'block';
    toggleModal(true);
}

function saveStock(event) {
    event.preventDefault();
    const candidate = normalizeStock({
        id: currentEditingId || `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`,
        symbol: document.getElementById('form-symbol').value,
        name: document.getElementById('form-name').value,
        shares: Number(document.getElementById('form-shares').value),
        cost: Number(document.getElementById('form-cost').value),
        price: Number(document.getElementById('form-price').value)
    });
    if (!candidate) {
        alert('資料格式不正確，請檢查代號、名稱與數值範圍。');
        return;
    }
    if (currentEditingId) stocks = stocks.map((stock) => stock.id === currentEditingId ? candidate : stock);
    else if (stocks.length < MAX_STOCKS) stocks.push(candidate);
    else {
        alert(`最多只能儲存 ${MAX_STOCKS} 筆資產。`);
        return;
    }
    saveToLocalStorage();
    toggleModal(false);
    renderPortfolio();
}

function deleteStock() {
    if (currentEditingId && confirm('確定要移除此持股記錄嗎？')) {
        stocks = stocks.filter((stock) => stock.id !== currentEditingId);
        saveToLocalStorage();
        toggleModal(false);
        renderPortfolio();
    }
}

function resetToDefault() {
    if (confirm('確定要將數據重置回初始設定嗎？')) {
        stocks = cloneDefaults();
        saveToLocalStorage();
        renderPortfolio();
    }
}

document.getElementById('btn-refresh').addEventListener('click', fetchAllData);
document.getElementById('btn-add').addEventListener('click', () => toggleModal(true));
document.getElementById('btn-reset').addEventListener('click', resetToDefault);
document.getElementById('btn-close').addEventListener('click', () => toggleModal(false));
document.getElementById('btn-delete').addEventListener('click', deleteStock);
document.getElementById('stock-form').addEventListener('submit', saveStock);
document.getElementById('yahoo-link-container').style.display = 'none';
renderPortfolio();
window.addEventListener('load', () => setTimeout(fetchAllData, 500));
