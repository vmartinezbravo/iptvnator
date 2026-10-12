#!/usr/bin/env node
// Evaluates one JS expression in the IPTVnator WebView on the Stick over
// DevTools (adb forward) and prints its value. Prints whatever the expression
// returns: never return sources, stream URLs or other credentials.
//
// Usage: node tools/android/stick-eval.mjs "<expression>" [--restart]
//   --restart  force-stops and starts the app first (does not touch its data)
// Device: ANDROID_SERIAL, or the Fire TV Stick at 192.168.100.82:5555.
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PKG = 'com.victor.iptvnator';
const SERIAL = process.env.ANDROID_SERIAL ?? '192.168.100.82:5555';
const PORT = 9223;
const adb = (...args) =>
    execFileSync('adb', ['-s', SERIAL, ...args], { encoding: 'utf8' });

async function waitFor(label, fn, timeoutMs = 60_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        const v = await fn().catch(() => undefined);
        if (v) return v;
        await sleep(200);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

const [expression, flag] = process.argv.slice(2);
if (flag === '--restart') {
    adb('shell', 'am', 'force-stop', PKG);
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
}
const pid = await waitFor('pid', async () => adb('shell', 'pidof', PKG).trim());
await waitFor('socket', async () =>
    adb('shell', 'cat', '/proc/net/unix').includes(
        `webview_devtools_remote_${pid}`
    )
);
adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
const target = await waitFor('page', async () =>
    (await (await fetch(`http://localhost:${PORT}/json`)).json()).find(
        (t) => t.type === 'page'
    )
);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
});
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id === 1) {
        console.log(JSON.stringify(msg.result?.result?.value ?? msg.result));
        ws.close();
        adb('forward', '--remove', `tcp:${PORT}`);
    }
};
ws.send(
    JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
            expression,
            returnByValue: true,
            awaitPromise: true,
            userGesture: true,
        },
    })
);
