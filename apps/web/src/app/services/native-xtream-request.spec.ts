import {
    buildNativeXtreamRequest,
    buildXtreamApiUrl,
    describeNativeConnectionFailure,
    interpretXtreamHttpResponse,
    NATIVE_XTREAM_TIMEOUTS,
    playlistTitleFromUrl,
    toNativeTransportError,
} from './native-xtream-request';

describe('native Xtream request helpers', () => {
    it.each([
        ['http://host:8080', 'http://host:8080/player_api.php'],
        ['http://host:8080/', 'http://host:8080/player_api.php'],
        [' http://host:8080/base/ ', 'http://host:8080/base/player_api.php'],
        [
            'http://host:8080/player_api.php?username=u&password=p',
            'http://host:8080/player_api.php',
        ],
        ['http://host:8080/get.php', 'http://host:8080/player_api.php'],
    ])(
        'buildXtreamApiUrl does not append player_api.php twice (%s)',
        (serverUrl, expected) => {
            expect(buildXtreamApiUrl(serverUrl)).toBe(expected);
        }
    );

    it('builds a GET with trimmed params, the VLC user agent and timeouts', () => {
        expect(
            buildNativeXtreamRequest('http://host:8080/', {
                username: ' u ',
                password: 'p&w',
                action: 'get_live_streams',
                empty: '  ',
            })
        ).toEqual({
            url: 'http://host:8080/player_api.php',
            params: {
                username: 'u',
                password: 'p&w',
                action: 'get_live_streams',
            },
            headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
            responseType: 'json',
            connectTimeout: 15_000,
            readTimeout: 90_000,
        });
        expect(NATIVE_XTREAM_TIMEOUTS).toEqual({
            connectTimeout: 15_000,
            readTimeout: 90_000,
        });
    });

    it('accepts JSON objects and arrays as the payload', () => {
        expect(
            interpretXtreamHttpResponse({ status: 200, data: [{ id: 1 }] })
        ).toEqual({ payload: [{ id: 1 }] });
        expect(
            interpretXtreamHttpResponse({ status: 200, data: { a: 1 } })
        ).toEqual({ payload: { a: 1 } });
    });

    it('treats a non-JSON answer as a 502 provider error', () => {
        const outcome = interpretXtreamHttpResponse({
            status: 200,
            data: '<html>challenge</html>',
        });
        expect(outcome).toEqual({
            status: 502,
            message: expect.stringContaining('not JSON'),
        });
    });

    it('keeps the provider status on HTTP errors', () => {
        expect(
            interpretXtreamHttpResponse({ status: 403, data: 'Forbidden' })
        ).toEqual({ status: 403, message: 'HTTP Error 403' });
    });

    it('turns a CapacitorHttp rejection into an error with its code', () => {
        const error = toNativeTransportError({
            code: 'SocketTimeoutException',
            message: 'timeout',
        });
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('timeout (SocketTimeoutException)');
    });

    it('describes connection failures with the shared classifier', () => {
        expect(
            describeNativeConnectionFailure({
                code: 'ConnectException',
                message: 'failed to connect: ECONNREFUSED (Connection refused)',
            })
        ).toEqual({ kind: 'connection', canTryHttp: true });
        expect(
            describeNativeConnectionFailure({
                code: 'SSLHandshakeException',
                message: 'handshake failed',
            })
        ).toEqual({ kind: 'tls', canTryHttp: false });
        expect(
            describeNativeConnectionFailure({
                code: 'SocketTimeoutException',
                message: 'timeout',
            })
        ).toEqual({ kind: 'connection', canTryHttp: false });
    });

    it('names a URL playlist after its last path segment', () => {
        expect(playlistTitleFromUrl('http://h/lists/my.m3u?x=1')).toBe(
            'my.m3u'
        );
        expect(playlistTitleFromUrl('http://h/')).toBe('h');
    });
});
