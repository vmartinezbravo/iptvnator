import { PlayerContentInfo } from '@iptvnator/shared/interfaces';
import { toPlaybackPosition } from './native-playback-position';

const movie: PlayerContentInfo = {
    playlistId: 'playlist-1',
    contentXtreamId: 46966,
    contentType: 'vod',
};

describe('toPlaybackPosition', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-10-12T20:00:00Z'));
    });

    afterEach(() => jest.useRealTimers());

    it('toPlaybackPosition returns null for a zero position', () => {
        expect(toPlaybackPosition(movie, 0, 5_400_000)).toBeNull();
        expect(toPlaybackPosition(movie, -5, 5_400_000)).toBeNull();
    });

    it('toPlaybackPosition omits an unknown duration', () => {
        expect(toPlaybackPosition(movie, 61_900, -1)).toEqual({
            playlistId: 'playlist-1',
            contentXtreamId: 46966,
            contentType: 'vod',
            positionSeconds: 61,
            updatedAt: '2026-10-12T20:00:00.000Z',
        });
    });

    it('toPlaybackPosition keeps the episode identity', () => {
        const episode: PlayerContentInfo = {
            playlistId: 'playlist-1',
            contentXtreamId: 901,
            contentType: 'episode',
            seriesXtreamId: 77,
            seasonNumber: 2,
            episodeNumber: 5,
        };

        expect(toPlaybackPosition(episode, 125_400, 2_640_999)).toEqual({
            ...episode,
            positionSeconds: 125,
            durationSeconds: 2640,
            updatedAt: '2026-10-12T20:00:00.000Z',
        });
    });
});
