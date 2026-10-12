#!/usr/bin/env node
// Measures UI fluidity on the Fire TV Stick without an inspector or
// screencast (Task 4.5 method, reused by Task 5.1a). DevTools is only used to
// start each scenario and read its stats: rAF frames, long tasks
// (PerformanceObserver) and, for real D-pad keys sent with `adb input
// keyevent`, the time from keydown to the second frame after it.
//
// Usage:
//   node tools/android/ui-fluidity.mjs [rounds=3] [--restart] [--only=a,b]
//   node tools/android/ui-fluidity.mjs --profile   # CPU profile of 6 D-pad keys
//   node tools/android/ui-fluidity.mjs --profile=category  # ... of 6 category switches
//   node tools/android/ui-fluidity.mjs --trace     # main-thread time by phase
//   --grep=<regex>  with --profile, only inclusive frames whose name matches
//   --css="<rules>"  injects a style first (try a fix before coding it)
// Scenarios: dpad-menu, category-switch, section-switch, channel-scroll.
// Prints only numbers and minified function names: never sources, stream
// URLs or other credentials.
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

const PKG = 'com.victor.iptvnator';
const SERIAL = process.env.ANDROID_SERIAL ?? '192.168.100.82:5555';
const PORT = 9226;
const OUT_DIR = 'dist/performance/android-stick';
const SETTLE_MS = 75_000;
const adb = (...args) =>
    execFileSync('adb', ['-s', SERIAL, ...args], { encoding: 'utf8' });
const adbAsync = promisify(execFile).bind(null, 'adb');
const key = (code) => adbAsync(['-s', SERIAL, 'shell', 'input', 'keyevent', String(code)]);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const rounds = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const css = args.find((a) => a.startsWith('--css='))?.slice(6);

const median = (values) => {
    const s = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : +((s[m - 1] + s[m]) / 2).toFixed(1);
};

async function connect() {
    const pid = adb('shell', 'pidof', PKG).trim();
    adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
    const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
    const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.method) listeners.forEach((fn) => fn(msg));
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
        (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }))
            .result?.result?.value;
    return {
        send,
        evaluate,
        on: (fn) => listeners.push(fn),
        close: () => {
            ws.close();
            adb('forward', '--remove', `tcp:${PORT}`);
        },
    };
}

// In-page recorder: __flStart() begins, __flStop() returns the stats.
const PAGE_LIB = `(() => {
    window.__flStart = () => {
        const s = { frames: [], longTasks: [], loafs: [], marks: [], keys: [], running: true, start: performance.now() };
        const tick = (t) => { if (s.running) { s.frames.push(t); requestAnimationFrame(tick); } };
        requestAnimationFrame(tick);
        s.observer = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) s.longTasks.push(e.duration);
        });
        s.observer.observe({ type: 'longtask', buffered: false });
        s.loafObserver = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) s.loafs.push([e.startTime, e.duration]);
        });
        s.loafObserver.observe({ type: 'long-animation-frame', buffered: false });
        s.onKey = (e) => s.keys.push(performance.now());
        document.addEventListener('keydown', s.onKey, true);
        window.__fl = s;
        return 'recording';
    };
    window.__flStop = () => {
        const s = window.__fl;
        s.running = false;
        s.observer.disconnect();
        s.loafObserver.disconnect();
        document.removeEventListener('keydown', s.onKey, true);
        const seconds = (performance.now() - s.start) / 1000;
        const gaps = s.frames.slice(1).map((f, i) => f - s.frames[i]);
        const responses = s.keys.map((at) => {
            const after = s.frames.filter((f) => f > at);
            return after.length > 1 ? after[1] - at : null;
        }).filter((v) => v !== null).sort((a, b) => a - b);
        // Per action (click mark): the longest animation frame that starts
        // before the next action; median over actions.
        const perAction = s.marks.map((at, i) => {
            const end = s.marks[i + 1] ?? Infinity;
            return Math.max(0, ...s.loafs.filter(([t]) => t >= at && t < end).map(([, d]) => d));
        }).sort((a, b) => a - b);
        const pct = (arr, p) => arr.length ? Math.round(arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]) : null;
        return {
            seconds: +seconds.toFixed(1),
            fps: +(s.frames.length / seconds).toFixed(1),
            framesOver100ms: gaps.filter((g) => g > 100).length,
            longestGapMs: gaps.length ? Math.round(Math.max(...gaps)) : null,
            longTasks: s.longTasks.length,
            longTaskMaxMs: s.longTasks.length ? Math.round(Math.max(...s.longTasks)) : 0,
            longTasksOver100ms: s.longTasks.filter((d) => d > 100).length,
            keys: s.keys.length,
            keyResponseMedianMs: pct(responses, 0.5),
            keyResponseP90Ms: pct(responses, 0.9),
            actionFrameMedianMs: pct(perAction, 0.5),
        };
    };
    window.__flMark = () => window.__fl.marks.push(performance.now());
    window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__go = async (path) => {
        history.pushState({}, '', path);
        dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        await window.__sleep(2500);
    };
    window.__base = async () => {
        const id = await new Promise((resolve) => {
            const req = indexedDB.open('iptvnator');
            req.onsuccess = () => {
                const all = req.result.transaction('playlists', 'readonly').objectStore('playlists').getAll();
                all.onsuccess = () => resolve(all.result.find((p) => p.serverUrl)?._id);
            };
        });
        return '/workspace/xtreams/' + id;
    };
    window.__toLive = async () => {
        const base = await window.__base();
        if (!location.pathname.endsWith('/live')) await window.__go(base + '/live');
        return 'ok';
    };
    window.__focusRail = () => {
        const link = document.querySelector('app-workspace-shell-rail a, app-workspace-shell-rail button');
        link?.focus();
        return link ? 'ok' : 'no-rail-link';
    };
    return 'ready';
})()`;

const PAGE_CATEGORY_SWITCH = `(async () => {
    await window.__toLive();
    const items = () => document.querySelectorAll('.context-panel .category-item');
    window.__flStart();
    for (let i = 0; i < 12; i++) { window.__flMark(); items()[i]?.click(); await window.__sleep(700); }
    return window.__flStop();
})()`;

// Phase-4 scenario: the 9th Live category, 40 rows down and up (68 px, 150 ms).
const PAGE_CHANNEL_SCROLL = `(async () => {
    await window.__toLive();
    document.querySelectorAll('.context-panel .category-item')[8]?.click();
    await window.__sleep(1500);
    const viewport = document.querySelector('cdk-virtual-scroll-viewport');
    if (!viewport) return 'no-viewport';
    viewport.scrollTop = 0;
    await window.__sleep(500);
    window.__flStart();
    for (let i = 0; i < 80; i++) { viewport.scrollTop += i < 40 ? 68 : -68; await window.__sleep(150); }
    return window.__flStop();
})()`;

const PAGE_SECTION_SWITCH = `(async () => {
    const base = await window.__base();
    window.__flStart();
    for (const section of ['vod', 'series', 'live', 'vod', 'series', 'live']) {
        window.__flMark();
        history.pushState({}, '', base + '/' + section);
        dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        await window.__sleep(1500);
    }
    return window.__flStop();
})()`;

// 20 real D-pad keys in the side menu: 10 down, then 10 up, 300 ms apart
// (each `adb input keyevent` itself takes most of a second).
async function dpadKeys(count) {
    for (let i = 0; i < count; i++) {
        await key(i < count / 2 ? 20 : 19);
        await sleep(300);
    }
}

const SCENARIOS = {
    'dpad-menu': async (page) => {
        await page.evaluate('window.__toLive()');
        if ((await page.evaluate('window.__focusRail()')) !== 'ok') return 'no-rail-link';
        await sleep(500);
        await page.evaluate('window.__flStart()');
        await dpadKeys(20);
        await sleep(500);
        return page.evaluate('window.__flStop()');
    },
    'category-switch': (page) => page.evaluate(PAGE_CATEGORY_SWITCH),
    'section-switch': (page) => page.evaluate(PAGE_SECTION_SWITCH),
    'channel-scroll': (page) => page.evaluate(PAGE_CHANNEL_SCROLL),
};

async function switchCategories(page) {
    for (let i = 0; i < 6; i++) {
        await page.evaluate(`document.querySelectorAll('.context-panel .category-item')[${i + 2}]?.click(), 'ok'`);
        await sleep(800);
    }
}

async function profile(page, what) {
    await page.evaluate(PAGE_LIB);
    await page.evaluate('window.__toLive()');
    await page.evaluate('window.__focusRail()');
    await page.send('Profiler.enable');
    await page.send('Profiler.setSamplingInterval', { interval: 200 });
    await page.send('Profiler.start');
    if (what === 'category') await switchCategories(page);
    else await dpadKeys(6);
    await sleep(500);
    const { profile } = (await page.send('Profiler.stop')).result;
    const byNode = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = new Map();
    profile.samples.forEach((nodeId, i) => dt.set(nodeId, (dt.get(nodeId) ?? 0) + (profile.timeDeltas[i] ?? 0)));
    const self = new Map();
    for (const [nodeId, us] of dt) {
        const f = byNode.get(nodeId).callFrame;
        if (['(idle)', '(program)', '(root)'].includes(f.functionName)) continue;
        const file = (f.url.split('/').pop() ?? '').split('?')[0] || '-';
        const label = `${f.functionName || '(anonymous)'} @ ${file}:${f.lineNumber}:${f.columnNumber}`;
        self.set(label, (self.get(label) ?? 0) + us / 1000);
    }
    const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 40);
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    console.log(`self JS time over 6 ${what === 'category' ? 'category switches' : 'keys'}: ${Math.round(total)} ms`);
    for (const [label, ms] of top) console.log(`${ms.toFixed(1).padStart(7)} ms  ${label}`);
    // Who calls the three most expensive frames (five callers up).
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const name = (id) => {
        const f = byNode.get(id).callFrame;
        return `${f.functionName || '(anon)'}@${(f.url.split('/').pop() ?? '').split('?')[0].slice(0, 14)}:${f.columnNumber}`;
    };
    // Inclusive time: each sample counts once for every distinct frame on its stack.
    const inclusive = new Map();
    profile.samples.forEach((nodeId, i) => {
        const seen = new Set();
        for (let id = nodeId; id; id = parent.get(id)) {
            const f = byNode.get(id).callFrame;
            if (f.functionName && !f.functionName.startsWith('(')) seen.add(name(id));
        }
        for (const label of seen) inclusive.set(label, (inclusive.get(label) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
    });
    console.log('inclusive (named frames):');
    const grep = args.find((a) => a.startsWith('--grep='))?.slice(7);
    const rows = [...inclusive].filter(([l]) => l.length > 3 && (!grep || new RegExp(grep).test(l)));
    for (const [label, ms] of rows.sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`${ms.toFixed(1).padStart(7)} ms  ${label}`);
    for (const [label] of top.slice(0, 3)) {
        const chains = new Map();
        for (const [nodeId, us] of dt) {
            if (!label.startsWith(`${byNode.get(nodeId).callFrame.functionName || '(anonymous)'} @`)) continue;
            const chain = [];
            for (let id = parent.get(nodeId); id && chain.length < 5; id = parent.get(id)) chain.push(name(id));
            const key = chain.join(' < ');
            chains.set(key, (chains.get(key) ?? 0) + us / 1000);
        }
        console.log(`callers of ${label}:`);
        for (const [chain, ms] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log(`  ${ms.toFixed(1).padStart(7)} ms  < ${chain}`);
    }
}

async function traceKeys(page) {
    await page.evaluate(PAGE_LIB);
    await page.evaluate('window.__toLive()');
    const run = async (label, action) => {
        const events = [];
        let done;
        page.on((msg) => {
            if (msg.method === 'Tracing.dataCollected') events.push(...msg.params.value);
            if (msg.method === 'Tracing.tracingComplete') done?.();
        });
        await page.send('Tracing.start', {
            categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute,blink,cc',
            transferMode: 'ReportEvents',
        });
        await sleep(300);
        await action();
        await sleep(800);
        const complete = new Promise((resolve) => (done = resolve));
        await page.send('Tracing.end');
        await complete;
        const tid = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')?.tid;
        const totals = {};
        for (const e of events) {
            if (e.tid !== tid || e.ph !== 'X' || !e.dur) continue;
            totals[e.name] = (totals[e.name] ?? 0) + e.dur / 1000;
        }
        const pick = ['RunTask', 'EventDispatch', 'FunctionCall', 'TimerFire', 'FireAnimationFrame', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'HitTest'];
        console.log(label, JSON.stringify(Object.fromEntries(pick.filter((k) => totals[k]).map((k) => [k, Math.round(totals[k] / 6)]))), '(ms per action)');
    };
    await page.evaluate('window.__focusRail()');
    await run('dpad-key', () => dpadKeys(6));
    await run('category-switch', () => switchCategories(page));
}

if (flag('--restart')) {
    adb('shell', 'am', 'force-stop', PKG);
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
    console.log(`restarted; waiting ${SETTLE_MS / 1000} s for the catalogue import`);
    await sleep(SETTLE_MS);
}
const page = await connect();
try {
    if (css) {
        await page.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return 'ok'; })()`);
    }
    const profileArg = args.find((a) => a.startsWith('--profile'));
    if (profileArg) await profile(page, profileArg.split('=')[1]);
    else if (flag('--trace')) await traceKeys(page);
    else {
        const names = Object.keys(SCENARIOS).filter((n) => !only || only.includes(n));
        const results = Object.fromEntries(names.map((n) => [n, []]));
        for (let r = 1; r <= rounds; r++) {
            await page.evaluate(PAGE_LIB);
            for (const name of names) {
                const result = await SCENARIOS[name](page);
                results[name].push(result);
                console.log(`round ${r} ${name}: ${JSON.stringify(result)}`);
                await sleep(1500);
            }
        }
        const medians = Object.fromEntries(
            names.map((n) => {
                const ok = results[n].filter((x) => typeof x === 'object');
                const keys = Object.keys(ok[0] ?? {});
                return [n, Object.fromEntries(keys.map((k) => [k, median(ok.map((x) => x[k]))]))];
            })
        );
        console.log('medians', JSON.stringify(medians, null, 1));
        mkdirSync(OUT_DIR, { recursive: true });
        const file = `${OUT_DIR}/ui-fluidity-${Date.now()}.json`;
        writeFileSync(file, JSON.stringify({ serial: SERIAL, rounds, css, results, medians }, null, 2));
        console.log(`saved ${file}`);
    }
} finally {
    page.close();
}
