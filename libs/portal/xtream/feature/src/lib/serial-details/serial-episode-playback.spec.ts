import type { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import type { XtreamSerieDetailsView } from './serial-details-playback.service';
import { buildSerialEpisodePlayback } from './serial-episode-playback';

describe('buildSerialEpisodePlayback', () => {
    it('names the series, for players that show it above the episode title', () => {
        const episode = {
            id: '7',
            title: 'The Signal',
            season: 1,
            episode_num: 4,
        } as unknown as XtreamSerieEpisode;
        const selectedItem = {
            series_id: 3,
            info: { name: 'Sin Señal', cover: '' },
            episodes: { '1': [episode] },
        } as unknown as XtreamSerieDetailsView;

        const { playback } = buildSerialEpisodePlayback({
            playlistId: 'playlist-1',
            selectedItem,
            episode,
            streamUrl: 'http://example.test/series/7.mkv',
            startTime: undefined,
        });

        expect(playback.title).toBe('The Signal');
        expect(playback.seriesTitle).toBe('Sin Señal');
    });
});
