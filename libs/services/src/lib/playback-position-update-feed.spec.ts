import { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import { PlaybackPositionUpdateFeed } from './playback-position-update-feed';

const position: PlaybackPositionData = {
    contentXtreamId: 7,
    contentType: 'vod',
    positionSeconds: 120,
    playlistId: 'playlist-1',
};

describe('PlaybackPositionUpdateFeed', () => {
    it('publishes to every subscriber until it unsubscribes', () => {
        const feed = new PlaybackPositionUpdateFeed();
        const first = jest.fn();
        const second = jest.fn();
        const stopFirst = feed.subscribe(first);
        feed.subscribe(second);

        feed.publish(position);
        stopFirst();
        feed.publish({ ...position, positionSeconds: 150 });

        expect(first).toHaveBeenCalledTimes(1);
        expect(first).toHaveBeenCalledWith(position);
        expect(second).toHaveBeenCalledTimes(2);
        expect(second).toHaveBeenLastCalledWith({
            ...position,
            positionSeconds: 150,
        });
    });
});
