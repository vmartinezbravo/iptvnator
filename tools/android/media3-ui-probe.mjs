#!/usr/bin/env node
// Integrated Media3 player, measured through the app's own UI on the Stick
// (plan Task 4c.7). The app must be open on the Xtream source.
//
// One round:
//   - DEPORTES: click "GOL play FULLHD" in the live list, zap twice (D-pad up);
//   - GENERALISTAS: click "La 1 HD", zap four times;
//   - after each list, Back.
// Times, all on the page clock (performance.now()):
//   - pick: click on the row → the app calls the plugin (page clock), plus the
//     player's own time from that call to its first frame. When the event
//     reaches the page is kept apart: the page is paused behind the player;
//   - zap: the player's own time from the key press to its first frame;
//   - back: just before `adb input keyevent 4` → `closed` reaches the page
//     (an upper bound: it includes starting adb).
// Each zapped channel is named from the list rows next to the clicked one.
//
// With --soak=<minutes> it instead clicks La 1 FHD and records, every
// minute, the app's PSS, the WebView renderer's PSS and whether the app is
// alive in the player; errors from the player are counted.
//
// Stream URLs never leave the page: the app builds them, and this script
// reads only names, indexes, codes and times.
//
// Usage: node tools/android/media3-ui-probe.mjs <round> [serial] [--soak=30]
// Output: dist/performance/android-stick/media3-ui-<timestamp>.json
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PKG = 'com.victor.iptvnator';
const PORT = 9226;
const FIRST_FRAME_TIMEOUT_MS = 20_000;
const SETTLE_MS = 4_000;
const args = process.argv.slice(2);
const soakArg = args.find((a) => a.startsWith('--soak'));
const [ROUND = '1', SERIAL = process.env.ANDROID_SERIAL] = args.filter(
    (a) => !a.startsWith('--')
);
const SOAK_MIN = soakArg ? Number(soakArg.split('=')[1] ?? 30) : 0;

const LISTS = [
    { category: 'DEPORTES', channel: 'GOL play FULLHD', zaps: 2 },
    { category: 'GENERALISTAS', channel: 'La 1 HD', zaps: 4 },
];

const adb = (...a) =>
    execFileSync('adb', [...(SERIAL ? ['-s', SERIAL] : []), ...a], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
const appPid = () => adb('shell', 'pidof', PKG).trim();
const resumed = () =>
    /mResumedActivity: \S+ \S+ \S+\/\.(\w+)/.exec(
        adb('shell', 'dumpsys', 'activity', 'activities')
    )?.[1];
const median = (xs) => {
    const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function connect() {
    adb(
        'forward',
        `tcp:${PORT}`,
        `localabstract:webview_devtools_remote_${appPid()}`
    );
    const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
    const ws = new WebSocket(
        list.find((t) => t.type === 'page').webSocketDebuggerUrl
    );
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
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
                        userGesture: true,
                    },
                })
            );
        });
    return {
        evaluate,
        close: () => {
            ws.close();
            adb('forward', '--remove', `tcp:${PORT}`);
        },
    };
}

// In the page: listen to the player once, and open a live category by
// name. Returns only 'ok' or a reason.
const PAGE_OPEN_CATEGORY = `async (category) => {
    const cap = window.Capacitor;
    if (!window.__ui) {
        window.__ui = { events: [], playCallAt: null };
        const nativePromise = cap.nativePromise.bind(cap);
        cap.nativePromise = (plugin, method, options) => {
            if (plugin === 'NativePlayer' && method === 'play') window.__ui.playCallAt = performance.now();
            return nativePromise(plugin, method, options);
        };
        const plugin = cap.registerPlugin('NativePlayer');
        for (const name of ['firstFrame', 'audio', 'error', 'closed', 'progress']) {
            await plugin.addListener(name, (e) => window.__ui.events.push({
                event: name, at: performance.now(), index: e.index, ms: e.ms,
                decoder: e.decoder ?? null, encoding: e.encoding, passthrough: e.passthrough,
                language: e.language ?? null, code: e.code, positionMs: e.positionMs,
            }));
        }
    }
    const source = await new Promise((resolve) => {
        const open = indexedDB.open('iptvnator');
        open.onsuccess = () => {
            const all = open.result.transaction('playlists', 'readonly').objectStore('playlists').getAll();
            all.onsuccess = () => resolve(all.result.find((p) => p.serverUrl));
        };
    });
    if (!source) return 'no-xtream-source';
    const res = await cap.nativePromise('CapacitorHttp', 'request', {
        url: source.serverUrl.replace(/\\/$/, '') + '/player_api.php', method: 'GET', responseType: 'json',
        params: { username: source.username, password: source.password, action: 'get_live_categories' },
        headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
    });
    const cats = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const cat = cats.find((c) => new RegExp(category).test(c.category_name));
    if (!cat) return 'no-category';
    history.pushState({}, '', '/workspace/xtreams/' + (source._id ?? source.id) + '/live/' + cat.category_id);
    dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    return 'ok';
}`;

// In the page: the rendered rows' channel names, and a click on one.
const PAGE_ROWS = `(() => [...document.querySelectorAll('button.channel-content')]
    .map((b) => b.querySelector('.channel-name')?.textContent.trim().replace(/\\s+/g, ' ') ?? ''))()`;
const pageClick = (name) => `(() => {
    const rows = [...document.querySelectorAll('button.channel-content')];
    const row = rows.find((b) => b.querySelector('.channel-name')?.textContent.trim().replace(/\\s+/g, ' ') === ${JSON.stringify(name)});
    if (!row) return null;
    window.__ui.events.length = 0;
    window.__ui.playCallAt = null;
    const at = performance.now();
    row.click();
    return at;
})()`;
// The virtual list keeps its scroll; the measured channels are at the top.
const PAGE_SCROLL_TOP = `(() => {
    for (const v of document.querySelectorAll('cdk-virtual-scroll-viewport')) v.scrollTop = 0;
    return 'ok';
})()`;

const events = (page) =>
    page.evaluate('JSON.stringify(window.__ui?.events ?? [])').then(JSON.parse);

async function waitFor(page, predicate, timeoutMs = FIRST_FRAME_TIMEOUT_MS) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        const found = (await events(page)).find(predicate);
        if (found) return found;
        await sleep(150);
    }
    return null;
}

async function openCategory(page, category) {
    const opened = await page.evaluate(
        `(${PAGE_OPEN_CATEGORY})(${JSON.stringify(category)})`
    );
    await sleep(4000);
    await page.evaluate(PAGE_SCROLL_TOP);
    await sleep(1500);
    return opened;
}

async function playList(page, { category, channel, zaps }) {
    const opened = await openCategory(page, category);
    if (opened !== 'ok') return [{ category, error: opened }];
    const marker = `probe-${Date.now()}`;
    await page.evaluate(`window.__probeMarker = '${marker}'`);
    const rows = await page.evaluate(PAGE_ROWS);
    const clickedRow = rows.indexOf(channel);
    const clickAt = await page.evaluate(pageClick(channel));
    if (clickAt === null) return [{ category, error: 'no-row' }];
    const pid = appPid();
    const results = [];
    let pickIndex = null;
    let clickToCall = null;
    for (let step = 0; step <= zaps; step++) {
        if (step > 0) adb('shell', 'input', 'keyevent', '19');
        const frame = await waitFor(
            page,
            (e) =>
                (e.event === 'firstFrame' || e.event === 'error') &&
                (step === 0 || e.index === pickIndex + step)
        );
        if (step === 0) {
            pickIndex = frame?.index ?? 0;
            const callAt = await page.evaluate('window.__ui.playCallAt');
            clickToCall =
                typeof callAt === 'number'
                    ? Math.round(callAt - clickAt)
                    : null;
        }
        const index = pickIndex + step;
        await sleep(SETTLE_MS);
        const audio = (await events(page))
            .filter((e) => e.event === 'audio' && e.index === index)
            .pop();
        results.push({
            name: rows[clickedRow + step] ?? `+${step}`,
            kind: step === 0 ? 'pick' : 'zap',
            ms:
                frame?.event !== 'firstFrame'
                    ? null
                    : step === 0
                      ? clickToCall === null
                          ? null
                          : clickToCall + frame.ms
                      : frame.ms,
            ...(step === 0
                ? {
                      clickToCallMs: clickToCall,
                      playerMs: frame?.ms ?? null,
                      eventArrivalMs: frame
                          ? Math.round(frame.at - clickAt)
                          : null,
                  }
                : {}),
            error:
                frame?.event === 'error'
                    ? frame.code
                    : frame
                      ? null
                      : 'timeout',
            decoder: audio?.decoder ?? null,
            encoding: audio?.encoding ?? null,
            passthrough: audio?.passthrough ?? null,
            language: audio?.language ?? null,
        });
    }
    const backAt = await page.evaluate('performance.now()');
    adb('shell', 'input', 'keyevent', '4');
    const closed = await waitFor(page, (e) => e.event === 'closed', 5000);
    await sleep(1500);
    const back = {
        ms: closed ? Math.round(closed.at - backAt) : null,
        resumed: resumed(),
        samePid: appPid() === pid,
        pageKept: (await page.evaluate('window.__probeMarker')) === marker,
    };
    return results.map((r) => ({ category, ...r, back }));
}

function pss() {
    const total = (target) => {
        const m = /TOTAL PSS:\s+(\d+)|TOTAL\s+(\d+)/.exec(
            adb('shell', 'dumpsys', 'meminfo', target)
        );
        return Number(m?.[1] ?? m?.[2] ?? 0);
    };
    const renderers = adb('shell', 'ps', '-A', '-o', 'PID,NAME')
        .split('\n')
        .filter((l) => l.includes('sandboxed_process'))
        .map((l) => l.trim().split(/\s+/)[0]);
    return {
        appKb: total(PKG),
        rendererKb: renderers.reduce((sum, p) => sum + total(p), 0),
    };
}

async function soak(page) {
    await openCategory(page, 'GENERALISTAS');
    const pid = appPid();
    await page.evaluate(pageClick('La 1 FHD'));
    const first = await waitFor(page, (e) => e.event === 'firstFrame');
    const samples = [];
    for (let minute = 1; minute <= SOAK_MIN; minute++) {
        await sleep(60_000);
        samples.push({
            minute,
            alive: appPid() === pid,
            resumed: resumed(),
            ...pss(),
        });
        console.log(JSON.stringify(samples.at(-1)));
    }
    const all = await events(page);
    adb('shell', 'input', 'keyevent', '4');
    const audio = all.find((e) => e.event === 'audio');
    return {
        playerMs: first?.ms ?? null,
        audio: audio && {
            decoder: audio.decoder,
            encoding: audio.encoding,
            passthrough: audio.passthrough,
            language: audio.language,
        },
        errors: all.filter((e) => e.event === 'error').map((e) => e.code),
        samples,
    };
}

const page = await connect();
const out = { round: ROUND, at: new Date().toISOString() };
if (SOAK_MIN) {
    out.soak = await soak(page);
} else {
    out.results = [];
    for (const list of LISTS) {
        const rows = await playList(page, list);
        for (const r of rows) console.log(JSON.stringify(r));
        out.results.push(...rows);
        await sleep(3000);
    }
    const of = (kind) =>
        out.results.filter((r) => r.kind === kind).map((r) => r.ms);
    console.log(
        `pick median ${median(of('pick'))} ms, zap median ${median(of('zap'))} ms, ` +
            `back median ${median(out.results.filter((r) => r.kind === 'pick').map((r) => r.back.ms))} ms`
    );
}
page.close();
mkdirSync('dist/performance/android-stick', { recursive: true });
const file = `dist/performance/android-stick/media3-ui-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
console.log('written', file);
