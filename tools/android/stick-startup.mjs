#!/usr/bin/env node
// Cold-start measurement on a device over ADB (plan Task 3.4, repeated in 6.1).
//
// Each run: force-stop, clear logcat, `am start`, attach to the WebView over
// DevTools, open Live of the first Xtream source in-app (no reload), click the
// first category as soon as nothing covers it, and read `Start proc …
// <package>` from logcat and the `[perf] live-list-ready` console mark over
// DevTools (the APK keeps Capacitor's logcat bridge off). Then it
// waits for the catalogue to settle and records PSS of the app process and of
// the WebView renderer (`sandboxed_process`). Needs a source already added in
// the app; it never reads or prints credentials.
//
// After Live is ready it also presses D-pad Down on the channel list until the
// movies and series import ends, to measure jank (see browseWhileImporting).
//
// Usage: node tools/android/stick-startup.mjs [runs=3] [serial]
// Output: dist/performance/android-stick/<timestamp>.json and a summary.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PKG = 'com.victor.iptvnator';
const RUNS = Number(process.argv[2] ?? 3);
const SERIAL = process.argv[3] ?? process.env.ANDROID_SERIAL;
const PORT = 9222;
const SETTLE_MS = 20_000;

const adb = (...args) =>
    execFileSync('adb', [...(SERIAL ? ['-s', SERIAL] : []), ...args], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });

async function waitFor(label, fn, timeoutMs = 120_000, stepMs = 100) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        const value = await fn().catch(() => undefined);
        if (value) return value;
        await sleep(stepMs);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

async function connectPage() {
    const pid = await waitFor('app pid', async () =>
        adb('shell', 'pidof', PKG).trim()
    );
    await waitFor('devtools socket', async () =>
        adb('shell', 'cat', '/proc/net/unix').includes(
            `webview_devtools_remote_${pid}`
        )
    );
    adb(
        'forward',
        `tcp:${PORT}`,
        `localabstract:webview_devtools_remote_${pid}`
    );
    const target = await waitFor('page target', async () => {
        const list = await (
            await fetch(`http://localhost:${PORT}/json`)
        ).json();
        return list.find((t) => t.type === 'page');
    });
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    let id = 0;
    const pending = new Map();
    // Console marks with the device's epoch-ms timestamp. Runtime.enable also
    // replays what was logged before we attached.
    const consoleLines = [];
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
            const text = msg.params.args
                .map((arg) => arg.value ?? arg.description ?? '')
                .join(' ');
            consoleLines.push({ atMs: msg.params.timestamp, text });
            return;
        }
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
    };
    const send = (method, params = {}) =>
        new Promise((resolve) => {
            const msgId = ++id;
            pending.set(msgId, resolve);
            ws.send(JSON.stringify({ id: msgId, method, params }));
        });
    const evaluate = async (expression) =>
        (
            await send('Runtime.evaluate', {
                expression,
                returnByValue: true,
                awaitPromise: true,
            })
        ).result?.result?.value;
    await send('Runtime.enable');
    return { pid, send, evaluate, consoleLines, close: () => ws.close() };
}

// In-app navigation: Angular's router follows popstate, so no page reload.
const OPEN_LIVE = `(() => {
    const req = indexedDB.open('iptvnator');
    return new Promise((resolve) => {
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('playlists', 'readonly');
            const all = tx.objectStore('playlists').getAll();
            all.onsuccess = () => {
                const xtream = all.result.find((p) => p.serverUrl && p.username);
                if (!xtream) return resolve('no-xtream-source');
                const url = '/workspace/xtreams/' + xtream._id + '/live';
                history.pushState({}, '', url);
                dispatchEvent(new PopStateEvent('popstate', { state: {} }));
                resolve('navigated');
            };
        };
        req.onerror = () => resolve('no-db');
    });
})()`;

// Click only when the category itself is hit (no overlay on top).
const CLICK_FIRST_CATEGORY = `(() => {
    const el = document.querySelector('.context-panel .category-item');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!el.contains(hit)) return false;
    console.info('[perf] category-click');
    el.click();
    return true;
})()`;

// `logcat -v epoch` lines start with seconds since the epoch, the same clock
// as the DevTools console timestamps.
const logTime = (line) =>
    Math.round(Number(line.trim().split(/\s+/)[0]) * 1000);

function readTimes(consoleLines) {
    const log = adb('logcat', '-d', '-v', 'epoch');
    const find = (re) => log.split('\n').find((l) => re.test(l));
    const mark = (re) => consoleLines.find((line) => re.test(line.text));
    const start = find(new RegExp(`Start proc \\d+:${PKG}/`));
    const click = mark(/\[perf\] category-click/);
    const ready = mark(/\[perf\] live-list-ready/);
    const died = log
        .split('\n')
        .filter(
            (l) => l.includes(PKG) && /has died|lowmemorykiller|Kill/i.test(l)
        );
    if (!start || !ready)
        throw new Error('missing start or live-list-ready mark');
    const t0 = logTime(start);
    // PortalDebug lines: "<action> request <id>" / "<action> response <id> <ms>ms".
    const requests = consoleLines
        .map((line) => ({
            line,
            m: line.text.match(
                /\[PortalDebug:xtream\] (\w+) (request|response|error) \S+(?: ([\d.]+)ms)?/
            ),
        }))
        .filter(({ m }) => m)
        .map(({ line, m }) => ({
            atMs: Math.round(line.atMs - t0),
            action: m[1],
            event: m[2],
            ...(m[3] ? { durationMs: Math.round(Number(m[3])) } : {}),
        }));
    return {
        startToCategoryClickMs: click ? Math.round(click.atMs - t0) : null,
        startToLiveListReadyMs: Math.round(ready.atMs - t0),
        processDeathLines: died,
        requests,
    };
}

function pssKb(pidOrPkg) {
    const out = adb('shell', 'dumpsys', 'meminfo', String(pidOrPkg));
    const total = out.match(/TOTAL(?: PSS)?:?\s+(\d+)/);
    return total ? Number(total[1]) : null;
}

async function run(index) {
    adb('shell', 'am', 'force-stop', PKG);
    await sleep(2000);
    adb('logcat', '-c');
    const amStart = adb(
        'shell',
        'am',
        'start',
        '-W',
        '-n',
        `${PKG}/.MainActivity`
    );
    const page = await connectPage();
    await waitFor('app shell', () =>
        page.evaluate(`!!document.querySelector('app-root *')`)
    );
    const nav = await page.evaluate(OPEN_LIVE);
    if (nav !== 'navigated') throw new Error(`open live: ${nav}`);
    await waitFor(
        'first category clickable',
        () => page.evaluate(CLICK_FIRST_CATEGORY),
        300_000
    );
    await waitFor(
        'live-list-ready',
        () =>
            page.evaluate(
                "performance.getEntriesByName('iptvnator:live-list-ready').length > 0"
            ),
        120_000,
        250
    );
    const jank = await browseWhileImporting(page);
    await sleep(SETTLE_MS);
    const times = readTimes(page.consoleLines);
    const renderer = adb('shell', 'ps', '-A')
        .split('\n')
        .find((l) => /sandboxed_process/.test(l));
    const result = {
        run: index,
        amStartTotalTimeMs: Number(amStart.match(/TotalTime: (\d+)/)?.[1]),
        ...times,
        jank,
        appAlive: adb('shell', 'pidof', PKG).trim() === page.pid,
        appPssKb: pssKb(PKG),
        rendererPssKb: renderer ? pssKb(renderer.trim().split(/\s+/)[1]) : null,
        jsHeapUsedMb: await page.evaluate(
            'performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null'
        ),
    };
    page.close();
    console.log(
        JSON.stringify({
            ...result,
            requests: result.requests.length,
            jank: undefined,
        })
    );
    console.log(JSON.stringify({ jank: result.jank }));
    return result;
}

// Jank while the rest of the catalogue imports: D-pad Down on the channel
// list every 300 ms (CDP Input.dispatchKeyEvent, the browser input path) until
// get_series has answered and 5 s more. Records how long each key took to be
// handled, long tasks and frame gaps.
const JANK_PROBE = `(() => {
    const j = (window.__jank = { longTasks: [], gaps: [], seriesDoneAt: null });
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) j.longTasks.push(Math.round(e.duration));
    }).observe({ type: 'longtask' });
    let last = performance.now();
    const frame = (t) => {
        if (t - last > 50) j.gaps.push(Math.round(t - last));
        last = t;
        if (!j.stop) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const group = console.groupCollapsed;
    console.groupCollapsed = (...args) => {
        if (/get_series (response|error)/.test(String(args[0]))) j.seriesDoneAt = performance.now();
        return group.apply(console, args);
    };
    document.querySelector('cdk-virtual-scroll-viewport')?.focus();
    return true;
})()`;

async function pressDown(page) {
    const key = {
        key: 'ArrowDown',
        code: 'ArrowDown',
        windowsVirtualKeyCode: 40,
    };
    const t = Date.now();
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    return Date.now() - t;
}

async function browseWhileImporting(page) {
    await page.evaluate(JANK_PROBE);
    const keyMs = [];
    const end = Date.now() + 120_000;
    let doneAt = null;
    while (Date.now() < end) {
        keyMs.push(await pressDown(page));
        await sleep(300);
        if (
            !doneAt &&
            (await page.evaluate('window.__jank.seriesDoneAt !== null'))
        )
            doneAt = Date.now();
        if (doneAt && Date.now() - doneAt > 5000) break;
    }
    const probe = await page.evaluate(
        '(() => { window.__jank.stop = true; return window.__jank; })()'
    );
    const sorted = [...keyMs].sort((a, b) => a - b);
    const pct = (p) =>
        sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return {
        seriesFinished: doneAt !== null,
        keys: keyMs.length,
        keyHandledMs: { median: pct(0.5), p90: pct(0.9), max: sorted.at(-1) },
        keysOver250Ms: keyMs.filter((ms) => ms > 250).length,
        longTasks: probe.longTasks.length,
        longTaskMaxMs: Math.max(0, ...probe.longTasks),
        longTasksOver500Ms: probe.longTasks.filter((d) => d > 500).length,
        frameGapsOver100Ms: probe.gaps.filter((g) => g > 100).length,
        frameGapMaxMs: Math.max(0, ...probe.gaps),
    };
}

const median = (xs) => {
    const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

// The app logs a lot; the default ring buffer drops the early lines.
adb('logcat', '-G', '16M');
const results = [];
for (let i = 1; i <= RUNS; i++) results.push(await run(i));
const summary = {
    date: new Date().toISOString(),
    device: adb('shell', 'getprop', 'ro.product.model').trim(),
    webView:
        adb('shell', 'dumpsys', 'package', 'com.amazon.webview.chromium').match(
            /versionName=(\S+)/
        )?.[1] ?? null,
    medianStartToLiveListReadyMs: median(
        results.map((r) => r.startToLiveListReadyMs)
    ),
    medianAppPssKb: median(results.map((r) => r.appPssKb)),
    medianRendererPssKb: median(results.map((r) => r.rendererPssKb)),
    runs: results,
};
mkdirSync('dist/performance/android-stick', { recursive: true });
const file = `dist/performance/android-stick/${summary.date.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, runs: undefined }, null, 2));
console.log(`written ${file}`);
