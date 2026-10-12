import { TestBed } from '@angular/core/testing';
import { PlaybackHistoryGate } from '@iptvnator/playback/data-access';
import { PlaybackPositionUpdateFeed } from '@iptvnator/services';
import {
    PlaybackPositionData,
    ResolvedPortalPlayback,
} from '@iptvnator/shared/interfaces';
import { Subject } from 'rxjs';
import { NativePlaybackService } from './native-playback.service';
import {
    NATIVE_PLAYER,
    NativePlayer,
    NativePlayerEvent,
} from './native-player';
import { SettingsStore } from './settings-store.service';

const movie: ResolvedPortalPlayback = {
    streamUrl: 'http://example.test/movie/1.mkv',
    title: 'City Hunter',
    startTime: 95,
    contentInfo: {
        playlistId: 'playlist-1',
        contentXtreamId: 46966,
        contentType: 'vod',
    },
};

/** Lets the service's `await play()` answer before the next event. */
const answered = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('NativePlaybackService', () => {
    let events: Subject<NativePlayerEvent>;
    let player: { play: jest.Mock; events: () => Subject<NativePlayerEvent> };
    let published: PlaybackPositionData[];
    let audioMode: 'auto' | 'pcm';
    let confirmed: { streamUrls: readonly string[] }[];

    beforeEach(() => {
        events = new Subject<NativePlayerEvent>();
        player = {
            play: jest.fn().mockResolvedValue(undefined),
            events: () => events,
        };
        published = [];
        audioMode = 'pcm';
        confirmed = [];
        TestBed.configureTestingModule({
            providers: [
                NativePlaybackService,
                { provide: NATIVE_PLAYER, useValue: player as NativePlayer },
                {
                    provide: SettingsStore,
                    useValue: { nativePlayerAudioMode: () => audioMode },
                },
                {
                    provide: PlaybackHistoryGate,
                    useValue: {
                        confirm: (target: { streamUrls: readonly string[] }) =>
                            confirmed.push(target),
                    },
                },
                {
                    provide: PlaybackPositionUpdateFeed,
                    useValue: {
                        publish: (data: PlaybackPositionData) =>
                            published.push(data),
                    },
                },
            ],
        });
    });

    it('open plays one item from the resume position with the chosen audio mode', async () => {
        await TestBed.inject(NativePlaybackService).open(movie);

        expect(player.play).toHaveBeenCalledWith({
            items: [{ url: movie.streamUrl, title: 'City Hunter' }],
            index: 0,
            isLive: false,
            startPositionMs: 95_000,
            audioMode: 'pcm',
        });
    });

    it('open resolves an opened native session', async () => {
        const session = await TestBed.inject(NativePlaybackService).open(movie);

        expect(session).toEqual(
            expect.objectContaining({
                player: 'native',
                status: 'opened',
                canClose: false,
                title: 'City Hunter',
                contentInfo: movie.contentInfo,
            })
        );
    });

    it('publishes the position on progress and on close', async () => {
        await TestBed.inject(NativePlaybackService).open(movie);

        events.next({
            type: 'progress',
            index: 0,
            positionMs: 125_000,
            durationMs: 5_400_000,
        });
        events.next({
            type: 'closed',
            index: 0,
            positionMs: 130_500,
            durationMs: 5_400_000,
        });
        events.next({
            type: 'progress',
            index: 0,
            positionMs: 999_000,
            durationMs: 5_400_000,
        });

        expect(published.map((p) => p.positionSeconds)).toEqual([125, 130]);
        expect(published[1]).toEqual(
            expect.objectContaining({
                playlistId: 'playlist-1',
                contentXtreamId: 46966,
                contentType: 'vod',
                durationSeconds: 5400,
            })
        );
    });

    it('ignores events of an earlier playback', async () => {
        const service = TestBed.inject(NativePlaybackService);
        await service.open(movie);
        await service.open({
            ...movie,
            contentInfo: { ...movie.contentInfo!, contentXtreamId: 2 },
        });

        events.next({
            type: 'closed',
            index: 0,
            positionMs: 60_000,
            durationMs: -1,
        });

        expect(published.map((p) => p.contentXtreamId)).toEqual([2]);
    });

    it('openLiveQueue passes every channel and resolves with the closing index', async () => {
        const closing = TestBed.inject(NativePlaybackService).openLiveQueue({
            index: 1,
            channels: [
                {
                    streamUrl: 'http://example.test/live/1.m3u8',
                    title: 'La 1 HD',
                    isLive: true,
                },
                {
                    streamUrl: 'http://example.test/live/2.m3u8',
                    title: 'La 2 HD',
                    isLive: true,
                },
                {
                    streamUrl: 'http://example.test/live/3.m3u8',
                    title: 'La 1 FHD',
                    isLive: true,
                },
            ],
        });
        await answered();
        events.next({ type: 'first-frame', index: 1, ms: 3400 });
        events.next({
            type: 'closed',
            index: 2,
            positionMs: 0,
            durationMs: -1,
        });

        await expect(closing).resolves.toBe(2);
        expect(player.play).toHaveBeenCalledWith({
            items: [
                { url: 'http://example.test/live/1.m3u8', title: 'La 1 HD' },
                { url: 'http://example.test/live/2.m3u8', title: 'La 2 HD' },
                { url: 'http://example.test/live/3.m3u8', title: 'La 1 FHD' },
            ],
            index: 1,
            isLive: true,
            audioMode: 'pcm',
        });
        expect(published).toEqual([]);
    });

    it('confirms the recent item once the first frame shows', async () => {
        await TestBed.inject(NativePlaybackService).open(movie);
        expect(confirmed).toEqual([]);

        events.next({ type: 'first-frame', index: 0, ms: 5500 });

        expect(confirmed).toEqual([{ streamUrls: [movie.streamUrl] }]);
    });

    it('confirms each live channel the queue shows', async () => {
        void TestBed.inject(NativePlaybackService).openLiveQueue({
            index: 0,
            channels: [
                { streamUrl: 'http://example.test/live/1.m3u8', title: 'One' },
                { streamUrl: 'http://example.test/live/2.m3u8', title: 'Two' },
            ],
        });
        await answered();

        events.next({ type: 'first-frame', index: 0, ms: 4600 });
        events.next({ type: 'first-frame', index: 1, ms: 3400 });

        expect(confirmed).toEqual([
            { streamUrls: ['http://example.test/live/1.m3u8'] },
            { streamUrls: ['http://example.test/live/2.m3u8'] },
        ]);
    });

    it('ignores a close that arrives before the new playback starts', async () => {
        // Final review #3: the page gets the previous player's events late.
        let started: () => void = () => undefined;
        player.play.mockReturnValue(
            new Promise<void>((resolve) => (started = resolve))
        );
        const opening = TestBed.inject(NativePlaybackService).open(movie);

        events.next({
            type: 'closed',
            index: 0,
            positionMs: 3_000_000,
            durationMs: 5_400_000,
        });
        started();
        await opening;
        events.next({
            type: 'progress',
            index: 0,
            positionMs: 125_000,
            durationMs: 5_400_000,
        });

        expect(published.map((p) => p.positionSeconds)).toEqual([125]);
    });

    it('settles a live queue that a newer playback replaces', async () => {
        const service = TestBed.inject(NativePlaybackService);
        const queue = service.openLiveQueue({
            index: 1,
            channels: [
                { streamUrl: 'http://example.test/live/1.m3u8', title: 'One' },
                { streamUrl: 'http://example.test/live/2.m3u8', title: 'Two' },
            ],
        });
        await answered();
        await service.open(movie);

        await expect(queue).resolves.toBe(1);
    });

    it('does not follow a playback replaced before the plugin answered', async () => {
        const service = TestBed.inject(NativePlaybackService);
        const first = service.open(movie);
        const second = service.open({
            ...movie,
            contentInfo: { ...movie.contentInfo!, contentXtreamId: 2 },
        });
        await Promise.all([first, second]);

        events.next({
            type: 'closed',
            index: 0,
            positionMs: 60_000,
            durationMs: -1,
        });

        expect(published.map((p) => p.contentXtreamId)).toEqual([2]);
    });

    it('publishes nothing for a stream without content info', async () => {
        await TestBed.inject(NativePlaybackService).open({
            streamUrl: 'http://example.test/live/1.m3u8',
            title: 'La 1 FHD',
            isLive: true,
        });

        events.next({
            type: 'closed',
            index: 0,
            positionMs: 60_000,
            durationMs: -1,
        });

        expect(published).toEqual([]);
        expect(player.play).toHaveBeenCalledWith(
            expect.objectContaining({ isLive: true, startPositionMs: 0 })
        );
    });
});
