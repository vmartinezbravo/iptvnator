#!/usr/bin/env node
// Cold-start measurement on a device over ADB (plan Task 3.4, repeated in 6.1).
//
// Each run: force-stop, clear logcat, `am start`, attach to the WebView over
// DevTools, open Live of the first Xtream source in-app (no reload), click the
// first category as soon as nothing covers it, and read the timestamps of
// `Start proc … <package>` and `[perf] live-list-ready` from logcat. Then it
// waits for the catalogue to settle and records PSS of the app process and of
// the WebView renderer (`sandboxed_process`). Needs a source already added in
// the app; it never reads or prints credentials.
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
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
    };
    const evaluate = (expression) =>
        new Promise((resolve) => {
            const msgId = ++id;
            pending.set(msgId, (msg) => resolve(msg.result?.result?.value));
            ws.send(
                JSON.stringify({
                    id: msgId,
                    method: 'Runtime.evaluate',
                    params: {
                        expression,
                        returnByValue: true,
                        awaitPromise: true,
                    },
                })
            );
        });
    return { pid, evaluate, close: () => ws.close() };
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

const logTime = (line) => {
    const [, h, m, s, ms] = line.match(/^\S+ (\d+):(\d+):(\d+)\.(\d+)/);
    return ((+h * 60 + +m) * 60 + +s) * 1000 + +ms;
};

function readTimes() {
    const log = adb('logcat', '-d', '-v', 'threadtime');
    const find = (re) => log.split('\n').find((l) => re.test(l));
    const start = find(new RegExp(`Start proc \\d+:${PKG}/`));
    const click = find(/\[perf\] category-click/);
    const ready = find(/\[perf\] live-list-ready/);
    const died = log
        .split('\n')
        .filter(
            (l) => l.includes(PKG) && /has died|lowmemorykiller|Kill/i.test(l)
        );
    if (!start || !ready) throw new Error('missing logcat markers');
    const t0 = logTime(start);
    // PortalDebug lines: "<action> request <id>" / "<action> response <id> <ms>ms".
    const requests = log
        .split('\n')
        .map((l) => ({
            l,
            m: l.match(
                /\[PortalDebug:xtream\] (\w+) (request|response|error) \S+(?: ([\d.]+)ms)?/
            ),
        }))
        .filter(({ m }) => m)
        .map(({ l, m }) => ({
            atMs: logTime(l) - t0,
            action: m[1],
            event: m[2],
            ...(m[3] ? { durationMs: Math.round(Number(m[3])) } : {}),
        }));
    return {
        startToCategoryClickMs: click ? logTime(click) - t0 : null,
        startToLiveListReadyMs: logTime(ready) - t0,
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
        async () => adb('logcat', '-d').includes('[perf] live-list-ready'),
        120_000,
        250
    );
    await sleep(SETTLE_MS);
    const times = readTimes();
    const renderer = adb('shell', 'ps', '-A')
        .split('\n')
        .find((l) => /sandboxed_process/.test(l));
    const result = {
        run: index,
        amStartTotalTimeMs: Number(amStart.match(/TotalTime: (\d+)/)?.[1]),
        ...times,
        appAlive: adb('shell', 'pidof', PKG).trim() === page.pid,
        appPssKb: pssKb(PKG),
        rendererPssKb: renderer ? pssKb(renderer.trim().split(/\s+/)[1]) : null,
        jsHeapUsedMb: await page.evaluate(
            'performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null'
        ),
    };
    page.close();
    console.log(
        JSON.stringify({ ...result, requests: result.requests.length })
    );
    return result;
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
