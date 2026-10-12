import {
    createNativePlayer,
    NativePlayerEvent,
    NativePlayerPluginApi,
    NativePlayerRequest,
} from './native-player';

type Listener = (data: Record<string, unknown>) => void;

function fakePlugin() {
    const listeners = new Map<string, Listener>();
    const removed: string[] = [];
    const plugin: NativePlayerPluginApi = {
        play: jest.fn().mockResolvedValue({ started: true }),
        addListener: jest.fn(async (name: string, listener: Listener) => {
            listeners.set(name, listener);
            return {
                remove: async () => {
                    removed.push(name);
                },
            };
        }),
    };
    const fire = (name: string, data: Record<string, unknown>) =>
        listeners.get(name)?.(data);
    return { plugin, fire, removed };
}

describe('NativePlayer', () => {
    it('maps plugin events to NativePlayerEvent', async () => {
        const { plugin, fire, removed } = fakePlugin();
        const player = createNativePlayer(plugin);
        const seen: NativePlayerEvent[] = [];

        const subscription = player.events().subscribe((e) => seen.push(e));
        await Promise.resolve();
        fire('firstFrame', { index: 1, ms: 3500 });
        fire('audio', {
            index: 1,
            decoder: 'OMX.dolby.eac3.decoder',
            encoding: 'pcm16',
            passthrough: false,
        });
        fire('audio', { index: 2, encoding: 'eac3', passthrough: true });
        fire('error', { index: 2, code: 'ERROR_CODE_IO', message: '<url>' });
        fire('closed', { index: 2, positionMs: 17719 });
        subscription.unsubscribe();
        await Promise.resolve();

        expect(seen).toEqual([
            { type: 'first-frame', index: 1, ms: 3500 },
            {
                type: 'audio',
                index: 1,
                decoder: 'OMX.dolby.eac3.decoder',
                encoding: 'pcm16',
                passthrough: false,
                language: null,
            },
            {
                type: 'audio',
                index: 2,
                decoder: null,
                encoding: 'eac3',
                passthrough: true,
                language: null,
            },
            {
                type: 'error',
                index: 2,
                code: 'ERROR_CODE_IO',
                message: '<url>',
            },
            { type: 'closed', index: 2, positionMs: 17719, durationMs: -1 },
        ]);
        expect(removed.sort()).toEqual([
            'audio',
            'closed',
            'error',
            'firstFrame',
            'progress',
        ]);
    });

    it('maps progress and closed with duration', async () => {
        const { plugin, fire } = fakePlugin();
        const seen: NativePlayerEvent[] = [];
        const subscription = createNativePlayer(plugin)
            .events()
            .subscribe((e) => seen.push(e));
        await Promise.resolve();

        fire('progress', { index: 0, positionMs: 30000, durationMs: 5400000 });
        fire('closed', { index: 0, positionMs: 42000, durationMs: -1 });
        subscription.unsubscribe();

        expect(seen).toEqual([
            {
                type: 'progress',
                index: 0,
                positionMs: 30000,
                durationMs: 5400000,
            },
            { type: 'closed', index: 0, positionMs: 42000, durationMs: -1 },
        ]);
    });

    it('maps the audio track language', async () => {
        const { plugin, fire } = fakePlugin();
        const seen: NativePlayerEvent[] = [];
        const subscription = createNativePlayer(plugin)
            .events()
            .subscribe((e) => seen.push(e));
        await Promise.resolve();

        fire('audio', {
            index: 0,
            decoder: null,
            encoding: 'eac3',
            passthrough: true,
            language: 'es',
        });
        fire('audio', {
            index: 1,
            encoding: 'eac3',
            passthrough: true,
            language: null,
        });
        subscription.unsubscribe();

        expect(seen.map((e) => e.type === 'audio' && e.language)).toEqual([
            'es',
            null,
        ]);
    });

    it('play passes the request to the plugin unchanged', async () => {
        const { plugin } = fakePlugin();
        const request: NativePlayerRequest = {
            items: [
                { url: 'http://example.test/live/1.m3u8', title: 'La 1 HD' },
                { url: 'http://example.test/live/2.m3u8' },
            ],
            index: 1,
            isLive: true,
            audioMode: 'pcm',
        };

        await expect(createNativePlayer(plugin).play(request)).resolves.toBe(
            undefined
        );
        expect(plugin.play).toHaveBeenCalledWith(request);
    });
});
