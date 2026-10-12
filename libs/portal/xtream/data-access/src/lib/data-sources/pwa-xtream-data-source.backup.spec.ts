import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ParentalLockService, PlaylistsService } from '@iptvnator/services';
import { XtreamApiService } from '../services/xtream-api.service';
import { PwaXtreamDataSource } from './pwa-xtream-data-source';

describe('PwaXtreamDataSource backup user state', () => {
    let dataSource: PwaXtreamDataSource;
    const savedPosition = {
        contentXtreamId: 7,
        contentType: 'vod' as const,
        positionSeconds: 3060,
        durationSeconds: 6000,
        updatedAt: '2026-10-12T11:00:00.000Z',
    };

    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem(
            'xtream-favorites',
            JSON.stringify({ p1: ['movie:7'] })
        );
        localStorage.setItem(
            'xtream-recent-items',
            JSON.stringify({
                p1: [{ id: 'series:3', viewedAt: '2026-10-12T10:00:00.000Z' }],
            })
        );
        localStorage.setItem(
            'xtream-playback-positions',
            JSON.stringify({ p1: [savedPosition] })
        );
        TestBed.configureTestingModule({
            providers: [
                PwaXtreamDataSource,
                {
                    provide: ParentalLockService,
                    useValue: {
                        active: () => false,
                        lockedXtreamIds: () => [],
                        withholdsEverything: () => false,
                    },
                },
                {
                    provide: XtreamApiService,
                    useValue: { getStreams: jest.fn() },
                },
                {
                    provide: PlaylistsService,
                    useValue: {
                        getPlaylistById: jest.fn(() => of(undefined)),
                        transformPlaylistMeta: jest.fn(() => of(null)),
                    },
                },
            ],
        });
        dataSource = TestBed.inject(PwaXtreamDataSource);
    });

    afterEach(() => localStorage.clear());

    it('restoring a backup with empty collections keeps the stored favorites, recent items and positions', async () => {
        await dataSource.restoreUserData('p1', {
            hiddenCategories: [],
            favorites: [],
            recentlyViewed: [],
            playbackPositions: [],
        });

        expect(
            JSON.parse(localStorage.getItem('xtream-favorites') ?? '{}')
        ).toEqual({ p1: ['movie:7'] });
        expect(
            JSON.parse(localStorage.getItem('xtream-recent-items') ?? '{}')[
                'p1'
            ]
        ).toHaveLength(1);
        expect(
            JSON.parse(
                localStorage.getItem('xtream-playback-positions') ?? '{}'
            )['p1']
        ).toEqual([savedPosition]);
    });

    it('exports what the PWA stored for the playlist', () => {
        expect(dataSource.exportUserState('p1')).toEqual({
            favorites: [{ xtreamId: 7, contentType: 'movie' }],
            recentlyViewed: [
                {
                    xtreamId: 3,
                    contentType: 'series',
                    viewedAt: '2026-10-12T10:00:00.000Z',
                },
            ],
            playbackPositions: [savedPosition],
        });
    });
});
