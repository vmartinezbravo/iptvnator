import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import {
    exportPwaUserState,
    mergePwaRestoreState,
    type PwaUserStateStorage,
} from './pwa-backup-user-state';

const position = (
    contentXtreamId: number,
    positionSeconds: number,
    updatedAt: string
): PlaybackPositionData => ({
    contentXtreamId,
    contentType: 'vod',
    positionSeconds,
    durationSeconds: 6000,
    updatedAt,
});

describe('exportPwaUserState', () => {
    it('exports the typed favorites, recent items and positions of one playlist', () => {
        const storage: PwaUserStateStorage = {
            favorites: { p1: ['movie:7', 'live:12'], other: ['movie:99'] },
            recent: {
                p1: [{ id: 'series:3', viewedAt: '2026-10-12T09:00:00.000Z' }],
            },
            positions: { p1: [position(7, 1800, '2026-10-12T11:00:00.000Z')] },
        };

        expect(exportPwaUserState('p1', storage)).toEqual({
            favorites: [
                { xtreamId: 7, contentType: 'movie' },
                { xtreamId: 12, contentType: 'live' },
            ],
            recentlyViewed: [
                {
                    xtreamId: 3,
                    contentType: 'series',
                    viewedAt: '2026-10-12T09:00:00.000Z',
                },
            ],
            playbackPositions: [position(7, 1800, '2026-10-12T11:00:00.000Z')],
        });
    });

    it('leaves out legacy untyped keys it cannot attribute to a content type', () => {
        const storage: PwaUserStateStorage = {
            favorites: { p1: [42, 'movie:7'] },
            recent: { p1: [{ id: 42, viewedAt: '2026-10-12T09:00:00.000Z' }] },
            positions: {},
        };

        const state = exportPwaUserState('p1', storage);

        expect(state.favorites).toEqual([
            { xtreamId: 7, contentType: 'movie' },
        ]);
        expect(state.recentlyViewed).toEqual([]);
        expect(state.playbackPositions).toEqual([]);
    });
});

describe('mergePwaRestoreState', () => {
    const current: PwaUserStateStorage = {
        favorites: { p1: ['movie:7'] },
        recent: {
            p1: [{ id: 'live:12', viewedAt: '2026-10-12T10:00:00.000Z' }],
        },
        positions: { p1: [position(7, 1800, '2026-10-12T11:00:00.000Z')] },
    };

    it('keeps every existing collection when the backup lists are empty', () => {
        const merged = mergePwaRestoreState('p1', current, {
            favorites: [],
            recentlyViewed: [],
            playbackPositions: [],
        });

        expect(merged).toEqual(current);
    });

    it('adds backup items without dropping existing ones', () => {
        const merged = mergePwaRestoreState('p1', current, {
            favorites: [{ xtreamId: 8, contentType: 'series' }],
            recentlyViewed: [
                {
                    xtreamId: 13,
                    contentType: 'live',
                    viewedAt: '2026-10-12T12:00:00.000Z',
                },
            ],
            playbackPositions: [position(9, 60, '2026-10-12T08:00:00.000Z')],
        });

        expect(merged.favorites['p1']).toEqual(['movie:7', 'series:8']);
        expect(merged.recent['p1'].map((item) => item.id)).toEqual([
            'live:12',
            'live:13',
        ]);
        expect(
            merged.positions['p1'].map((item) => item.contentXtreamId)
        ).toEqual([7, 9]);
    });

    it('keeps the newer playback position for the same content', () => {
        const older = mergePwaRestoreState('p1', current, {
            favorites: [],
            recentlyViewed: [],
            playbackPositions: [position(7, 60, '2026-10-01T00:00:00.000Z')],
        });
        const newer = mergePwaRestoreState('p1', current, {
            favorites: [],
            recentlyViewed: [],
            playbackPositions: [position(7, 3000, '2026-10-12T12:00:00.000Z')],
        });

        expect(older.positions['p1'][0].positionSeconds).toBe(1800);
        expect(newer.positions['p1'][0].positionSeconds).toBe(3000);
    });

    it('does not touch other playlists', () => {
        const merged = mergePwaRestoreState(
            'p1',
            {
                ...current,
                favorites: { ...current.favorites, other: ['movie:1'] },
            },
            { favorites: [], recentlyViewed: [], playbackPositions: [] }
        );

        expect(merged.favorites['other']).toEqual(['movie:1']);
    });
});
