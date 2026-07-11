import { mkdir, writeFile } from 'node:fs/promises';

const twseUrl = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
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

function parseReport(text) {
    const trimmed = text.trim();
    const match = trimmed.match(/^onReceiveAiReport\s*\(\s*([\s\S]*)\s*\)\s*;?$/);
    const value = JSON.parse(match ? match[1] : trimmed);
    if (!value || value.status !== 'success' || typeof value.date !== 'string' || typeof value.report !== 'string') throw new Error('Invalid report payload');
    return { fetchedAt: new Date().toISOString(), date: value.date.slice(0, 40), report: value.report.slice(0, 50000) };
}

await mkdir('data', { recursive: true });
const results = await Promise.allSettled([requestText(twseUrl), requestText(reportUrl)]);
let updated = 0;

if (results[0].status === 'fulfilled') {
    const stocks = validateMarket(JSON.parse(results[0].value));
    await writeFile('data/market.json', `${JSON.stringify({ asOf: new Date().toISOString(), stocks }, null, 2)}\n`);
    updated += 1;
} else {
    console.error('Market update failed:', results[0].reason);
}

if (results[1].status === 'fulfilled') {
    const report = parseReport(results[1].value);
    await writeFile('data/report.json', `${JSON.stringify(report, null, 2)}\n`);
    updated += 1;
} else {
    console.error('Report update failed:', results[1].reason);
}

if (updated === 0) process.exitCode = 1;
