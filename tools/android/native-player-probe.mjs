#!/usr/bin/env node
// Media3 prototype measurement on the Stick (plan Task 4b.4).
//
// One round, for each audio mode ('auto' = passthrough when the HDMI
// receiver takes it, 'pcm' = decoded on the Stick):
//   - DEPORTES: pick the first channel, then zap twice with D-pad up;
//   - GENERALISTAS: pick the first channel, then zap four times (the last two
//     are the E-AC-3 FHD channels);
//   - the AC-3 mkv movie.
// Times are the player's own: from the plugin call (pick) or the key press
// (zap) to Media3's first rendered frame. Sound: the player's `audio` event
// plus the app's AudioTrack in state `started` (dumpsys audio). After each
// list, Back must return to the app without reloading the page.
//
// With --soak=<minutes> it instead plays La 1 FHD that long and records the
// PSS of the app and of the WebView renderer, and whether the app survived.
//
// The stream URLs are built inside the page from the stored source and go
// straight to the plugin: nothing here reads, prints or stores them.
//
// Usage: node tools/android/native-player-probe.mjs <round> [serial] [--soak=10]
// Output: dist/performance/android-stick/media3-<timestamp>.json
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PKG = 'com.victor.iptvnator';
const PORT = 9225;
const FIRST_FRAME_TIMEOUT_MS = 20_000;
const SETTLE_MS = 5_000;
const args = process.argv.slice(2);
const soakArg = args.find((a) => a.startsWith('--soak'));
const [ROUND = '1', SERIAL = process.env.ANDROID_SERIAL] = args.filter(
    (a) => !a.startsWith('--')
);
const SOAK_MIN = soakArg ? Number(soakArg.split('=')[1] ?? 10) : 0;

const LISTS = [
    {
        category: 'DEPORTES',
        channels: ['GOL play FULLHD', 'GOL PLAY SD', 'GOL PLAY HD'],
    },
    {
        category: 'GENERALISTAS',
        channels: ['La 1 HD', 'La 1 SD', 'La 2 HD', 'La 1 FHD', 'La 2 FHD'],
    },
    {
        vodId: 46966,
        channels: ['City Hunter y el perfume de Cupido (mkv, AC-3)'],
    },
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
const audioTrackStarted = (pid) =>
    adb('shell', 'dumpsys', 'audio')
        .split('\n')
        .some(
            (l) =>
                l.includes(`/${pid} -- state:started`) &&
                l.includes('AudioTrack')
        );
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

// In the page: build the items from the stored Xtream source and call the
// plugin. Returns only 'called' or a reason; events go to window.__npEvents.
const PAGE_PLAY = `async (req) => {
    const cap = window.Capacitor;
    if (!window.__npPlugin) {
        window.__npEvents = [];
        window.__npPlugin = cap.registerPlugin('NativePlayer');
        for (const name of ['firstFrame', 'audio', 'error', 'closed']) {
            await window.__npPlugin.addListener(name, (e) => window.__npEvents.push({ event: name, ...e }));
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
    const server = source.serverUrl.replace(/\\/$/, '');
    const api = async (params) => {
        const res = await cap.nativePromise('CapacitorHttp', 'request', {
            url: server + '/player_api.php', method: 'GET', responseType: 'json',
            params: { username: source.username, password: source.password, ...params },
            headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
        });
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    };
    const norm = (s) => s.trim().replace(/\\s+/g, ' ');
    let items;
    if (req.vodId) {
        const info = await api({ action: 'get_vod_info', vod_id: req.vodId });
        const ext = info?.movie_data?.container_extension;
        if (!ext) return 'no-vod';
        items = [{ url: server + '/movie/' + source.username + '/' + source.password + '/' + req.vodId + '.' + ext }];
    } else {
        window.__npStreams = window.__npStreams || {};
        if (!window.__npStreams[req.category]) {
            const cats = await api({ action: 'get_live_categories' });
            const cat = cats.find((c) => new RegExp(req.category).test(c.category_name));
            window.__npStreams[req.category] = await api({ action: 'get_live_streams', category_id: cat.category_id });
        }
        const streams = req.channels.map((n) => window.__npStreams[req.category].find((s) => norm(s.name) === n));
        const missing = req.channels.filter((n, i) => !streams[i]);
        if (missing.length) return 'no-channel: ' + missing.join(', ');
        items = streams.map((s) => ({ url: server + '/live/' + source.username + '/' + source.password + '/' + s.stream_id + '.m3u8' }));
    }
    window.__npEvents.length = 0;
    try {
        await window.__npPlugin.play({ items, index: 0, isLive: !req.vodId, audioMode: req.audioMode });
        return 'called';
    } catch (e) {
        return 'rejected: ' + e.message;
    }
}`;

const events = (page) =>
    page.evaluate('JSON.stringify(window.__npEvents ?? [])').then(JSON.parse);

async function waitFirstFrame(page, index) {
    const end = Date.now() + FIRST_FRAME_TIMEOUT_MS;
    while (Date.now() < end) {
        const all = await events(page);
        const frame = all.find(
            (e) => e.event === 'firstFrame' && e.index === index
        );
        const error = all.find((e) => e.event === 'error' && e.index === index);
        if (frame || error)
            return { ms: frame?.ms ?? null, error: error?.code ?? null };
        await sleep(200);
    }
    return { ms: null, error: 'timeout' };
}

async function playList(page, list, audioMode) {
    const marker = `probe-${Date.now()}`;
    await page.evaluate(`window.__probeMarker = '${marker}'`);
    const started = await page.evaluate(
        `(${PAGE_PLAY})(${JSON.stringify({ ...list, audioMode })})`
    );
    if (started !== 'called')
        return [{ list: list.category ?? 'VOD', error: started }];
    const pid = appPid();
    const results = [];
    for (const [index, name] of list.channels.entries()) {
        if (index > 0) adb('shell', 'input', 'keyevent', '19');
        const { ms, error } = await waitFirstFrame(page, index);
        await sleep(SETTLE_MS);
        const audio = (await events(page))
            .filter((e) => e.event === 'audio' && e.index === index)
            .pop();
        results.push({
            name,
            kind: index === 0 ? 'pick' : 'zap',
            audioMode,
            firstFrameMs: ms,
            error,
            decoder: audio?.decoder ?? null,
            encoding: audio?.encoding ?? null,
            passthrough: audio?.passthrough ?? null,
            audioTrackStarted: audioTrackStarted(pid),
        });
    }
    adb('shell', 'input', 'keyevent', '4');
    await sleep(3000);
    const back = {
        resumed: resumed(),
        samePid: appPid() === pid,
        pageKept: (await page.evaluate('window.__probeMarker')) === marker,
        closed: (await events(page)).some((e) => e.event === 'closed'),
    };
    return results.map((r) => ({ ...r, back }));
}

function pss() {
    const app = /TOTAL PSS:\s+(\d+)|TOTAL\s+(\d+)/.exec(
        adb('shell', 'dumpsys', 'meminfo', PKG)
    );
    const renderers = adb('shell', 'ps', '-A', '-o', 'PID,NAME')
        .split('\n')
        .filter((l) => l.includes('sandboxed_process'))
        .map((l) => l.trim().split(/\s+/)[0]);
    const rendererKb = renderers.reduce((sum, p) => {
        const m = /TOTAL PSS:\s+(\d+)|TOTAL\s+(\d+)/.exec(
            adb('shell', 'dumpsys', 'meminfo', p)
        );
        return sum + Number(m?.[1] ?? m?.[2] ?? 0);
    }, 0);
    return { appKb: Number(app?.[1] ?? app?.[2] ?? 0), rendererKb };
}

async function soak(page) {
    const pid = appPid();
    const started = await page.evaluate(
        `(${PAGE_PLAY})(${JSON.stringify({ category: 'GENERALISTAS', channels: ['La 1 FHD'], audioMode: 'auto' })})`
    );
    const first = await waitFirstFrame(page, 0);
    const samples = [];
    for (let minute = 1; minute <= SOAK_MIN; minute++) {
        await sleep(60_000);
        samples.push({
            minute,
            alive: appPid() === pid,
            resumed: resumed(),
            ...pss(),
        });
    }
    const errors = (await events(page))
        .filter((e) => e.event === 'error')
        .map((e) => e.code);
    adb('shell', 'input', 'keyevent', '4');
    return { started, firstFrameMs: first.ms, errors, samples };
}

const page = await connect();
const out = { round: ROUND, at: new Date().toISOString() };
if (SOAK_MIN) {
    out.soak = await soak(page);
    console.log(JSON.stringify(out.soak.samples.at(-1)));
} else {
    out.results = [];
    for (const audioMode of ['auto', 'pcm']) {
        for (const list of LISTS) {
            const rows = await playList(page, list, audioMode);
            for (const r of rows) console.log(JSON.stringify(r));
            out.results.push(...rows);
            await sleep(3000);
        }
    }
    for (const mode of ['auto', 'pcm']) {
        const rows = out.results.filter((r) => r.audioMode === mode);
        console.log(
            `${mode}: pick median ${median(rows.filter((r) => r.kind === 'pick').map((r) => r.firstFrameMs))} ms, ` +
                `zap median ${median(rows.filter((r) => r.kind === 'zap').map((r) => r.firstFrameMs))} ms`
        );
    }
}
page.close();
mkdirSync('dist/performance/android-stick', { recursive: true });
const file = `dist/performance/android-stick/media3-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
console.log('written', file);
