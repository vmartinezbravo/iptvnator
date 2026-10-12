import type { PortalPlayer } from '@iptvnator/portal/shared/util';
import type { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';
import type { XtreamLiveChannelItem } from './xtream-live-channel-navigation.service';
import {
    buildLiveQueue,
    playXtreamLiveQueue,
} from './xtream-live-native-queue';

const toPlayback = (n: number): ResolvedPortalPlayback => ({
    streamUrl: `http://example.test/live/${n}.m3u8`,
    title: `Channel ${n}`,
    isLive: true,
});
const numbers = (count: number) => Array.from({ length: count }, (_, i) => i);

describe('buildLiveQueue', () => {
    it('buildLiveQueue keeps at most 200 channels centred on the chosen one', () => {
        const { queue, items } = buildLiveQueue(numbers(600), 300, toPlayback);

        expect(items).toHaveLength(200);
        expect(items[0]).toBe(200);
        expect(queue.index).toBe(100);
        expect(items[queue.index]).toBe(300);
        expect(queue.channels[queue.index].title).toBe('Channel 300');
    });

    it('buildLiveQueue clamps the window at both ends of the list', () => {
        const start = buildLiveQueue(numbers(600), 10, toPlayback);
        expect(start.items[0]).toBe(0);
        expect(start.queue.index).toBe(10);

        const end = buildLiveQueue(numbers(600), 595, toPlayback);
        expect(end.items).toHaveLength(200);
        expect(end.items[199]).toBe(599);
        expect(end.items[end.queue.index]).toBe(595);
    });

    it('buildLiveQueue keeps the whole list when it is short', () => {
        const { queue, items } = buildLiveQueue(numbers(8), 5, toPlayback);

        expect(items).toEqual(numbers(8));
        expect(queue.index).toBe(5);
        expect(queue.channels).toHaveLength(8);
    });
});

describe('playXtreamLiveQueue', () => {
    const channel = (id: number): XtreamLiveChannelItem => ({
        xtream_id: id,
        name: `Channel ${id}`,
        stream_icon: `icon-${id}`,
    });
    const playback: ResolvedPortalPlayback = {
        streamUrl: 'http://example.test/live/2.m3u8',
        liveAutoTsUrl: 'http://example.test/live/2.ts',
        title: 'Channel 2',
        isLive: true,
        userAgent: 'agent',
    };

    it('leaves the player alone when it has no queue', () => {
        const player = {} as PortalPlayer;

        expect(
            playXtreamLiveQueue(player, {
                playback,
                chosen: channel(2),
                channels: [channel(1), channel(2)],
                streamUrl: (c) =>
                    `http://example.test/live/${c.xtream_id}.m3u8`,
                leftOn: jest.fn(),
            })
        ).toBe(false);
    });

    it('queues the visible channels and reports the one the player closed on', async () => {
        let resolveClose: (index: number) => void = () => undefined;
        const playLiveQueue = jest.fn(
            () => new Promise<number>((resolve) => (resolveClose = resolve))
        );
        const leftOn = jest.fn();
        const channels = [channel(1), channel(2), channel(3)];

        const started = playXtreamLiveQueue(
            { playLiveQueue } as unknown as PortalPlayer,
            {
                playback,
                chosen: { ...channel(2) },
                channels,
                streamUrl: (c) =>
                    `http://example.test/live/${c.xtream_id}.m3u8`,
                leftOn,
            }
        );
        resolveClose(2);
        await Promise.resolve();
        await Promise.resolve();

        expect(started).toBe(true);
        expect(playLiveQueue).toHaveBeenCalledWith({
            index: 1,
            channels: [
                {
                    streamUrl: 'http://example.test/live/1.m3u8',
                    title: 'Channel 1',
                    thumbnail: 'icon-1',
                    isLive: true,
                    userAgent: 'agent',
                },
                playback,
                {
                    streamUrl: 'http://example.test/live/3.m3u8',
                    title: 'Channel 3',
                    thumbnail: 'icon-3',
                    isLive: true,
                    userAgent: 'agent',
                },
            ],
        });
        expect(leftOn).toHaveBeenCalledWith(channels[2]);
    });

    it('plays only the chosen channel when the visible list misses it', () => {
        const playLiveQueue = jest.fn(
            () => new Promise<number>(() => undefined)
        );

        playXtreamLiveQueue({ playLiveQueue } as unknown as PortalPlayer, {
            playback,
            chosen: channel(2),
            channels: [],
            streamUrl: (c) => `http://example.test/live/${c.xtream_id}.m3u8`,
            leftOn: jest.fn(),
        });

        expect(playLiveQueue).toHaveBeenCalledWith({
            index: 0,
            channels: [playback],
        });
    });
});
