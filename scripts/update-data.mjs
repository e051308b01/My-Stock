import { mkdir, writeFile } from 'node:fs/promises';

const twseUrl = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const tpexUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const reportUrl = 'https://script.google.com/macros/s/AKfycbzVKjy5nvE_PxnsyP7WdL7RPMPZMiXYU6dcSY7jeb_J54ejhdt9AegGu9QxoDCUMt810w/exec';
const timeoutMs = 20000;

async function requestText(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return response.text();
}

function validateMarket(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100000) throw new Error('Invalid market payload');
    return value.map((item) => {
        const Code = typeof item?.Code === 'string' ? item.Code.trim().slice(0, 20) : '';
        const ClosingPrice = Number.parseFloat(item?.ClosingPrice);
        if (!Code || !Number.isFinite(ClosingPrice) || ClosingPrice < 0 || ClosingPrice > 1e9) return null;
        return { Code, ClosingPrice };
    }).filter(Boolean);
}

function validateTpexMarket(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100000) throw new Error('Invalid TPEx market payload');
    return value.map((item) => {
        const Code = typeof item?.SecuritiesCompanyCode === 'string' ? item.SecuritiesCompanyCode.trim().slice(0, 20) : '';
        const ClosingPrice = Number.parseFloat(item?.Close);
        if (!Code || !Number.isFinite(ClosingPrice) || ClosingPrice < 0 || ClosingPrice > 1e9) return null;
        return { Code, ClosingPrice };
    }).filter(Boolean);
}

function parseReport(text, marketStocks, marketAsOf) {
    const trimmed = text.trim();
    const match = trimmed.match(/^onReceiveAiReport\s*\(\s*([\s\S]*)\s*\)\s*;?$/);
    const value = JSON.parse(match ? match[1] : trimmed);
    if (!value || value.status !== 'success' || typeof value.date !== 'string' || typeof value.report !== 'string') throw new Error('Invalid report payload');

    const prices = new Map(marketStocks.map(({ Code, ClosingPrice }) => [Code, ClosingPrice]));
    const mentioned = new Map();
    const rejectedClaims = [];
    const codePattern = /\(([0-9]{4,6}[A-Z]?)\)/g;
    const pricePattern = /([0-9]+(?:\.[0-9]+)?)\s*元/g;

    value.report.split('\n').forEach((line) => {
        const codes = [...line.matchAll(codePattern)].map((item) => item[1]);
        const claimedPrices = [...line.matchAll(pricePattern)].map((item) => Number(item[1]));
        codes.forEach((code) => {
            const closingPrice = prices.get(code);
            const name = line.match(/[-•]\s*([^（(：:]+)\s*\(/)?.[1]?.trim() || code;
            if (!closingPrice) {
                if (claimedPrices.length > 0) rejectedClaims.push({ code, reason: 'missing-market-price' });
                return;
            }
            mentioned.set(code, { code, name, closingPrice });
            claimedPrices.forEach((claimedPrice) => {
                const difference = Math.abs(claimedPrice - closingPrice) / closingPrice;
                if (!Number.isFinite(claimedPrice) || difference > 0.35) {
                    rejectedClaims.push({ code, claimedPrice, closingPrice });
                }
            });
        });
    });

    if (rejectedClaims.length > 0) {
        const verifiedPrices = [...mentioned.values()]
            .map(({ code, name, closingPrice }) => `- ${name} (${code})：最新收盤價 ${closingPrice.toLocaleString('zh-TW')} 元`)
            .join('\n');
        return {
            fetchedAt: new Date().toISOString(),
            marketAsOf,
            date: value.date.slice(0, 40),
            validation: 'rejected',
            report: `⚠️ 本期 AI 晨報包含與官方交易所行情差距過大的價位，原文已停止發布。\n\n【經驗證的最新收盤價】\n${verifiedPrices}\n\n請等待晨報資料源修正；系統不會顯示未通過驗證的策略價位。`
        };
    }

    return {
        fetchedAt: new Date().toISOString(),
        marketAsOf,
        date: value.date.slice(0, 40),
        validation: 'passed',
        report: value.report.slice(0, 50000)
    };
}

await mkdir('data', { recursive: true });
const results = await Promise.allSettled([requestText(twseUrl), requestText(tpexUrl), requestText(reportUrl)]);
let updated = 0;
let validatedMarket = null;
let marketAsOf = null;

if (results[0].status === 'fulfilled' && results[1].status === 'fulfilled') {
    const combined = [
        ...validateMarket(JSON.parse(results[0].value)),
        ...validateTpexMarket(JSON.parse(results[1].value))
    ];
    validatedMarket = [...new Map(combined.map((stock) => [stock.Code, stock])).values()];
    marketAsOf = new Date().toISOString();
    await writeFile('data/market.json', `${JSON.stringify({ asOf: marketAsOf, stocks: validatedMarket }, null, 2)}\n`);
    updated += 1;
} else {
    console.error('Market update failed:', results[0].status === 'rejected' ? results[0].reason : results[1].reason);
}

if (results[2].status === 'fulfilled' && validatedMarket) {
    const report = parseReport(results[2].value, validatedMarket, marketAsOf);
    await writeFile('data/report.json', `${JSON.stringify(report, null, 2)}\n`);
    updated += 1;
} else {
    console.error('Report update failed:', results[2].status === 'rejected' ? results[2].reason : 'Market data unavailable for validation');
}

if (updated === 0) process.exitCode = 1;
