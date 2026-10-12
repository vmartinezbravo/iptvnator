import { TestBed } from '@angular/core/testing';
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

describe('NativePlaybackService', () => {
    let events: Subject<NativePlayerEvent>;
    let player: { play: jest.Mock; events: () => Subject<NativePlayerEvent> };
    let published: PlaybackPositionData[];
    let audioMode: 'auto' | 'pcm';

    beforeEach(() => {
        events = new Subject<NativePlayerEvent>();
        player = {
            play: jest.fn().mockResolvedValue(undefined),
            events: () => events,
        };
        published = [];
        audioMode = 'pcm';
        TestBed.configureTestingModule({
            providers: [
                NativePlaybackService,
                { provide: NATIVE_PLAYER, useValue: player as NativePlayer },
                {
                    provide: SettingsStore,
                    useValue: { nativePlayerAudioMode: () => audioMode },
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
