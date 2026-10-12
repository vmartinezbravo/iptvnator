// Runs inside the app page (through stick-eval.mjs) and opens the Media3
// prototype player. Expects window.__NP set first:
//   { category: /regex/ source, channels: [exact names], index, audioMode }
//   or { vodId, audioMode }, with audioMode 'auto' (passthrough) or 'pcm'.
// The stream URLs are built here from the stored Xtream source and go straight
// to the plugin; the result is only 'called …' or a reason. Player events
// (index, times, audio route; no URLs) collect in window.__npEvents.
//
// Example (Git Bash, from the repo root):
//   node tools/android/stick-eval.mjs "window.__NP={category:'GENERALISTAS',channels:['La 1 FHD'],index:0,audioMode:'auto'}; $(cat tools/android/np-open.js)"
(async () => {
    const req = window.__NP;
    const cap = window.Capacitor;
    if (!window.__npPlugin) {
        window.__npEvents = [];
        window.__npPlugin = cap.registerPlugin('NativePlayer');
        for (const name of ['firstFrame', 'audio', 'error', 'closed']) {
            await window.__npPlugin.addListener(name, (e) =>
                window.__npEvents.push({ event: name, at: Date.now(), ...e })
            );
        }
    }
    const source = await new Promise((resolve) => {
        const open = indexedDB.open('iptvnator');
        open.onsuccess = () => {
            const all = open.result
                .transaction('playlists', 'readonly')
                .objectStore('playlists')
                .getAll();
            all.onsuccess = () => resolve(all.result.find((p) => p.serverUrl));
        };
    });
    const server = source.serverUrl.replace(/\/$/, '');
    const api = async (params) => {
        const res = await cap.nativePromise('CapacitorHttp', 'request', {
            url: server + '/player_api.php',
            method: 'GET',
            params: {
                username: source.username,
                password: source.password,
                ...params,
            },
            headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
            responseType: 'json',
        });
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    };
    let items;
    let isLive = true;
    if (req.vodId) {
        const info = await api({ action: 'get_vod_info', vod_id: req.vodId });
        const ext = info?.movie_data?.container_extension;
        if (!ext) return 'no-vod';
        items = [
            {
                url: `${server}/movie/${source.username}/${source.password}/${req.vodId}.${ext}`,
                title: info.movie_data.name,
            },
        ];
        isLive = false;
    } else {
        window.__npStreams = window.__npStreams || {};
        if (!window.__npStreams[req.category]) {
            const categories = await api({ action: 'get_live_categories' });
            const cat = categories.find((c) =>
                new RegExp(req.category).test(c.category_name)
            );
            window.__npStreams[req.category] = await api({
                action: 'get_live_streams',
                category_id: cat.category_id,
            });
        }
        const streams = req.channels.map((n) =>
            window.__npStreams[req.category].find((s) => s.name.trim() === n)
        );
        if (streams.some((s) => !s))
            return (
                'no-channel: ' +
                req.channels.filter((n, i) => !streams[i]).join(', ')
            );
        items = streams.map((s) => ({
            url: `${server}/live/${source.username}/${source.password}/${s.stream_id}.m3u8`,
            title: s.name,
        }));
    }
    window.__npEvents.length = 0;
    try {
        const r = await window.__npPlugin.play({
            items,
            index: req.index ?? 0,
            isLive,
            audioMode: req.audioMode ?? 'auto',
        });
        return 'called ' + JSON.stringify(r);
    } catch (e) {
        return 'rejected: ' + e.message;
    }
})();
