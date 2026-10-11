// PC performance baseline for the Android port (fase 2). Measurement only:
// drives the existing app in Chrome and records timings. No app code changes.
//
// Usage (PowerShell, from the repo root):
//   $env:XT_URL='http://host:port'; $env:XT_USER='...'; $env:XT_PASS='...'
//   node tools/android/perf-baseline.mjs
//
// Optional env: RUNS (default 3), TARGETS (default "dev,prod"),
// DEV_URL (default http://localhost:4200), PROD_PORT (default 4300),
// BACKEND_URL (default http://localhost:3000), HEADED=1.
//
// Credentials are only read from the environment and never written: results
// keep the Xtream action name, timings, sizes and item counts. Results and
// failure screenshots go to dist/performance/android-baseline/.
// Baseline and method: docs/android-measurements.md.
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const outDir = path.join(repoRoot, 'dist/performance/android-baseline');
const env = process.env;
const XT_URL = (env.XT_URL ?? '').trim();
const XT_USER = env.XT_USER ?? '';
const XT_PASS = env.XT_PASS ?? '';
if (!XT_URL || !XT_USER || !XT_PASS) {
    console.error('Set XT_URL, XT_USER and XT_PASS first.');
    process.exit(2);
}
const RUNS = Number(env.RUNS ?? 3);
const TARGETS = (env.TARGETS ?? 'dev,prod').split(',').map((t) => t.trim());
const DEV_URL = env.DEV_URL ?? 'http://localhost:4200';
const PROD_PORT = Number(env.PROD_PORT ?? 4300);
const BACKEND_URL = env.BACKEND_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1920, height: 1080 };
const CATALOG_ACTIONS = [
    'get_live_categories',
    'get_live_streams',
    'get_vod_categories',
    'get_vod_streams',
    'get_series_categories',
    'get_series',
];
const METRIC_KEYS = [
    'TaskDuration',
    'ScriptDuration',
    'LayoutDuration',
    'RecalcStyleDuration',
    'JSHeapUsedSize',
];

const log = (...args) =>
    console.log(new Date().toISOString().slice(11, 19), ...args);
const median = (values) => {
    const sorted = values
        .filter((v) => Number.isFinite(v))
        .sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
};

// ---------- static server for dist/apps/web-android ----------
function startStaticServer(root, port) {
    const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.txt': 'text/plain; charset=utf-8',
    };
    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(
            new URL(req.url, 'http://x').pathname
        );
        // The android build ships BACKEND_URL ''; the runtime config file is the
        // supported override, so point it at the local backend for this run.
        if (urlPath === '/assets/app-config.js') {
            res.writeHead(200, { 'content-type': types['.js'] });
            res.end(
                `window.__IPTVNATOR_CONFIG__ = Object.assign({}, window.__IPTVNATOR_CONFIG__, { BACKEND_URL: ${JSON.stringify(BACKEND_URL)} });\n`
            );
            return;
        }
        let file = path.join(root, urlPath);
        if (
            !file.startsWith(root) ||
            !fs.existsSync(file) ||
            fs.statSync(file).isDirectory()
        ) {
            file = path.join(root, 'index.html');
        }
        res.writeHead(200, {
            'content-type':
                types[path.extname(file)] ?? 'application/octet-stream',
        });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// ---------- direct provider timing (no browser, no backend) ----------
function playerApiUrl(action) {
    let base = XT_URL.replace(/\/+$/, '');
    if (!/\/player_api\.php$/i.test(base)) base += '/player_api.php';
    const url = new URL(base);
    url.searchParams.set('username', XT_USER);
    url.searchParams.set('password', XT_PASS);
    if (action) url.searchParams.set('action', action);
    return url;
}

async function measureProviderDirect() {
    const rows = [];
    for (const action of CATALOG_ACTIONS) {
        const t0 = performance.now();
        try {
            const res = await fetch(playerApiUrl(action), {
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
            });
            const ttfb = performance.now() - t0;
            const buf = Buffer.from(await res.arrayBuffer());
            const downloaded = performance.now() - t0;
            const tParse = performance.now();
            let items = null;
            try {
                const json = JSON.parse(buf.toString('utf8'));
                items = Array.isArray(json) ? json.length : null;
            } catch {
                items = 'non-json';
            }
            rows.push({
                action,
                status: res.status,
                encoding: res.headers.get('content-encoding') ?? 'identity',
                ttfbMs: Math.round(ttfb),
                totalMs: Math.round(downloaded),
                nodeJsonParseMs: Math.round(performance.now() - tParse),
                bytes: buf.length,
                items,
            });
        } catch (error) {
            rows.push({
                action,
                error: String(error?.cause?.code ?? error?.message ?? error),
            });
        }
    }
    return rows;
}

// ---------- browser instrumentation ----------
const INIT_SCRIPT = () => {
    window.__perf = { longtasks: [] };
    try {
        new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
                window.__perf.longtasks.push({
                    start: e.startTime,
                    duration: e.duration,
                });
            }
        }).observe({ type: 'longtask', buffered: true });
    } catch {
        // longtask timing unavailable
    }
};

async function metricsSnapshot(cdp) {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const out = {};
    for (const m of metrics)
        if (METRIC_KEYS.includes(m.name)) out[m.name] = m.value;
    return out;
}

function metricsDelta(a, b) {
    const ms = (k) => Math.round(((b[k] ?? 0) - (a[k] ?? 0)) * 1000);
    const task = ms('TaskDuration');
    const script = ms('ScriptDuration');
    const layout = ms('LayoutDuration');
    const style = ms('RecalcStyleDuration');
    return {
        mainThreadBusyMs: task,
        scriptMs: script,
        styleMs: style,
        layoutMs: layout,
        otherMs: task - script - style - layout, // paint, parse, GC, IDB clone…
        jsHeapUsedMB: Math.round((b.JSHeapUsedSize ?? 0) / 1048576),
    };
}

function actionOf(url) {
    try {
        const u = new URL(url);
        if (u.pathname.endsWith('/provider-targets')) return 'provider-targets';
        if (u.pathname.endsWith('/xtream'))
            return u.searchParams.get('action') ?? 'get_account_info';
        return null;
    } catch {
        return null;
    }
}

function trackRequests(page) {
    const records = [];
    const pending = new Set();
    page.on('request', (req) => {
        if (actionOf(req.url())) pending.add(req);
    });
    const settle = async (req, failed) => {
        const action = actionOf(req.url());
        if (!action) return;
        pending.delete(req);
        const t = req.timing();
        const rec = {
            action,
            method: req.method(),
            startEpochMs: t.startTime,
            ttfbMs: t.responseStart >= 0 ? Math.round(t.responseStart) : null,
            totalMs: t.responseEnd >= 0 ? Math.round(t.responseEnd) : null,
            failed: failed ? (req.failure()?.errorText ?? 'failed') : undefined,
        };
        if (!failed) {
            try {
                const res = await req.response();
                rec.status = res?.status();
                const sizes = await req.sizes();
                rec.transferBytes = sizes.responseBodySize;
                const body = await res.body();
                rec.decodedBytes = body.length;
                try {
                    const json = JSON.parse(body.toString('utf8'));
                    const payload = json?.payload ?? json;
                    rec.items = Array.isArray(payload) ? payload.length : null;
                } catch {
                    rec.items = 'non-json';
                }
            } catch (error) {
                rec.note = String(error?.message ?? error).slice(0, 120);
            }
        }
        records.push(rec);
    };
    page.on('requestfinished', (req) => void settle(req, false));
    page.on('requestfailed', (req) => void settle(req, true));
    return { records, pending };
}

async function waitForXtreamIdle(tracker, quietMs = 3000, maxMs = 15 * 60_000) {
    const start = Date.now();
    let quietSince = Date.now();
    while (Date.now() - start < maxMs) {
        if (tracker.pending.size > 0) quietSince = Date.now();
        else if (Date.now() - quietSince >= quietMs) return;
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('xtream requests did not settle');
}

async function attributeProcessing(page, records, journeyEndEpoch) {
    const { timeOrigin, longtasks } = await page.evaluate(() => ({
        timeOrigin: performance.timeOrigin,
        longtasks: window.__perf?.longtasks ?? [],
    }));
    const ends = records
        .filter((r) => r.totalMs != null)
        .map((r) => ({ r, end: r.startEpochMs + r.totalMs }))
        .sort((a, b) => a.end - b.end);
    ends.forEach(({ r, end }, i) => {
        const next = ends[i + 1]?.end ?? journeyEndEpoch;
        r.longTaskMsAfterResponse = Math.round(
            longtasks
                .filter((lt) => {
                    const s = timeOrigin + lt.start;
                    return s >= end && s < next;
                })
                .reduce((sum, lt) => sum + lt.duration, 0)
        );
    });
}

function relativize(records, t0Epoch) {
    return records
        .sort((a, b) => a.startEpochMs - b.startEpochMs)
        .map(({ startEpochMs, ...rest }) => ({
            startAtMs: Math.round(startEpochMs - t0Epoch),
            ...rest,
        }));
}

async function newInstrumentedPage(context) {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
    // The native shell's CapacitorHttp has no browser HTTP cache: never let a
    // cached catalogue response make the PC numbers look better than they are.
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    return { page, cdp };
}

// Journey 1: empty app → add the Xtream source → catalogue downloaded.
async function journeyAddSource(context, baseUrl, out) {
    const { page, cdp } = await newInstrumentedPage(context);
    const tracker = trackRequests(page);
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
    await page
        .getByRole('button', { name: 'Add playlist' })
        .first()
        .click({ timeout: 60_000 });
    const dialog = page.locator('mat-dialog-container');
    await dialog.getByRole('radio', { name: /Xtream credentials/i }).click();
    await dialog.locator('#title').fill('perf-baseline');
    await dialog.locator('#serverUrl').fill(XT_URL);
    await dialog.locator('#username').fill(XT_USER);
    await dialog.locator('#password').fill(XT_PASS);
    const add = dialog.getByRole('button', {
        name: 'Add playlist',
        exact: true,
    });
    await add.waitFor({ state: 'visible' });
    const m0 = await metricsSnapshot(cdp);
    tracker.records.length = 0;
    const t0 = Date.now();
    await add.click({ timeout: 60_000 });
    await page.waitForURL(/xtreams\/[^/]+\//, { timeout: 120_000 });
    const sourceId = page.url().match(/xtreams\/([^/?#]+)/)?.[1];
    await waitForXtreamIdle(tracker);
    const tEnd = Date.now() - 3000; // idle detection waited 3 s after the last response
    const m1 = await metricsSnapshot(cdp);
    await attributeProcessing(page, tracker.records, tEnd);
    out.addSource = {
        catalogueDoneMs: tEnd - t0,
        mainThread: metricsDelta(m0, m1),
        requests: relativize(tracker.records, t0),
    };
    await page.close();
    return sourceId;
}

// Journey 2: open the app straight into Live (new page, same profile) and
// time until a channel can be chosen: categories visible, then first channel
// row after selecting the first category.
async function journeyOpenLive(context, baseUrl, sourceId, out) {
    const { page, cdp } = await newInstrumentedPage(context);
    const tracker = trackRequests(page);
    const m0 = await metricsSnapshot(cdp);
    const t0 = Date.now();
    await page.goto(`${baseUrl}/workspace/xtreams/${sourceId}/live`, {
        waitUntil: 'commit',
    });
    const category = page.locator('.context-panel .category-item').first();
    await category.waitFor({ state: 'visible', timeout: 15 * 60_000 });
    const tCategories = Date.now() - t0;
    const mCat = await metricsSnapshot(cdp);
    const tClick = Date.now();
    await category.click();
    await page
        .locator('app-channel-list-item')
        .first()
        .waitFor({ state: 'visible', timeout: 15 * 60_000 });
    const tChannels = Date.now() - t0;
    const categoryToRowsMs = Date.now() - tClick;
    const m1 = await metricsSnapshot(cdp);
    const nav = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return {
            domContentLoadedMs: n
                ? Math.round(n.domContentLoadedEventEnd)
                : null,
            loadMs: n ? Math.round(n.loadEventEnd) : null,
            firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
        };
    });
    // Let any catalogue refresh triggered by opening finish, so it is recorded.
    await waitForXtreamIdle(tracker).catch(() => undefined);
    const tEnd = Date.now();
    const m2 = await metricsSnapshot(cdp);
    await attributeProcessing(page, tracker.records, tEnd);
    out.openLive = {
        ...nav,
        categoriesVisibleMs: tCategories,
        categoryClickToFirstRowMs: categoryToRowsMs,
        canChooseChannelMs: tChannels,
        mainThreadUntilCategories: metricsDelta(m0, mCat),
        mainThreadCategoryToRows: metricsDelta(mCat, m1),
        mainThreadAfterRowsUntilIdle: metricsDelta(m1, m2),
        requests: relativize(tracker.records, t0),
    };
    await page.close();
}

async function runTarget(browser, target, baseUrl, runIndex) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    await context.addInitScript(INIT_SCRIPT);
    const out = { target, run: runIndex + 1 };
    try {
        const sourceId = await journeyAddSource(context, baseUrl, out);
        if (!sourceId) throw new Error('source id not found in URL');
        await journeyOpenLive(context, baseUrl, sourceId, out);
    } catch (error) {
        out.error = String(error?.message ?? error).split('\n')[0];
        const shot = path.join(
            outDir,
            `failure-${target}-run${runIndex + 1}.png`
        );
        await context
            .pages()[0]
            ?.screenshot({ path: shot })
            .catch(() => undefined);
        out.screenshot = path.basename(shot);
    } finally {
        await context.close();
    }
    return out;
}

function summarize(results) {
    const lines = [];
    for (const target of TARGETS) {
        const runs = results.browser.filter(
            (r) => r.target === target && !r.error
        );
        const pick = (fn) => median(runs.map(fn));
        lines.push(
            `${target}: runs ok ${runs.length}/${RUNS} | add→catalogue ${pick((r) => r.addSource?.catalogueDoneMs)} ms | ` +
                `open→categories ${pick((r) => r.openLive?.categoriesVisibleMs)} ms | ` +
                `open→can choose channel ${pick((r) => r.openLive?.canChooseChannelMs)} ms | ` +
                `category→first row ${pick((r) => r.openLive?.categoryClickToFirstRowMs)} ms`
        );
    }
    return lines.join('\n');
}

async function main() {
    fs.mkdirSync(outDir, { recursive: true });
    const results = {
        startedAt: new Date().toISOString(),
        machine: { node: process.version, platform: process.platform },
        viewport: VIEWPORT,
        runs: RUNS,
        providerDirect: [],
        browser: [],
    };
    let staticServer;
    if (TARGETS.includes('prod')) {
        const dist = path.join(repoRoot, 'dist/apps/web-android');
        if (!fs.existsSync(path.join(dist, 'index.html'))) {
            throw new Error(
                'dist/apps/web-android missing: run pnpm nx build web --configuration=android'
            );
        }
        staticServer = await startStaticServer(dist, PROD_PORT);
        log(
            `static server for dist/apps/web-android on http://localhost:${PROD_PORT}`
        );
    }
    const browser = await chromium.launch({
        channel: 'chrome',
        headless: env.HEADED !== '1',
    });
    results.machine.chrome = browser.version();
    try {
        for (let i = 0; i < RUNS; i++) {
            log(`provider direct, run ${i + 1}/${RUNS}`);
            results.providerDirect.push({
                run: i + 1,
                rows: await measureProviderDirect(),
            });
            for (const target of TARGETS) {
                const baseUrl =
                    target === 'dev'
                        ? DEV_URL
                        : `http://localhost:${PROD_PORT}`;
                log(`${target}, run ${i + 1}/${RUNS}`);
                const r = await runTarget(browser, target, baseUrl, i);
                results.browser.push(r);
                log(
                    r.error
                        ? `  ERROR: ${r.error}`
                        : `  can choose channel after ${r.openLive.canChooseChannelMs} ms`
                );
            }
        }
    } finally {
        await browser.close();
        staticServer?.close();
    }
    results.finishedAt = new Date().toISOString();
    const file = path.join(
        outDir,
        `results-${results.startedAt.replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(file, JSON.stringify(results, null, 2));
    log('summary (medians)\n' + summarize(results));
    log(`results written to ${path.relative(repoRoot, file)}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
