import {
    NATIVE_PREFETCH_ACTIONS,
    NATIVE_PREFETCH_TTL_MS,
    NativeXtreamPrefetch,
} from './native-xtream-prefetch';

describe('NativeXtreamPrefetch', () => {
    const credentials = { username: 'u', password: 'p' };
    const url = 'http://host:8080/player_api.php';
    let now: number;
    let prefetch: NativeXtreamPrefetch;
    let load: jest.Mock;

    beforeEach(() => {
        now = 1_000;
        prefetch = new NativeXtreamPrefetch(() => now);
        load = jest.fn((params: Record<string, string>) =>
            Promise.resolve({ status: 200, data: [params['action']] })
        );
    });

    it('prefetches the categories and the live channels only', () => {
        prefetch.start(url, credentials, load);

        expect(NATIVE_PREFETCH_ACTIONS).toEqual([
            'get_live_categories',
            'get_vod_categories',
            'get_series_categories',
            'get_live_streams',
        ]);
        expect(load.mock.calls.map(([params]) => params)).toEqual(
            NATIVE_PREFETCH_ACTIONS.map((action) => ({
                ...credentials,
                action,
            }))
        );
    });

    it('hands each prefetched answer out once, to the same request only', async () => {
        prefetch.start(url, credentials, load);

        const params = { ...credentials, action: 'get_live_streams' };
        await expect(prefetch.take(url, params)).resolves.toEqual({
            status: 200,
            data: ['get_live_streams'],
        });
        expect(prefetch.take(url, params)).toBeNull();
        expect(prefetch.take(url, { ...params, username: 'other' })).toBeNull();
        expect(
            prefetch.take(url, { ...credentials, action: 'get_vod_streams' })
        ).toBeNull();
    });

    it('ignores the order of the request params', () => {
        prefetch.start(url, credentials, load);

        expect(
            prefetch.take(url, {
                action: 'get_live_categories',
                password: 'p',
                username: 'u',
            })
        ).not.toBeNull();
    });

    it('drops prefetched answers after the TTL', () => {
        prefetch.start(url, credentials, load);
        now += NATIVE_PREFETCH_TTL_MS + 1;

        expect(
            prefetch.take(url, { ...credentials, action: 'get_live_streams' })
        ).toBeNull();
    });

    it('does not start a second prefetch while one is fresh', () => {
        prefetch.start(url, credentials, load);
        prefetch.start(url, credentials, load);

        expect(load).toHaveBeenCalledTimes(NATIVE_PREFETCH_ACTIONS.length);
    });
});
