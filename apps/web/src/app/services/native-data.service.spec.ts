import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate } from '@angular/service-worker';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { EMPTY, firstValueFrom } from 'rxjs';
import { PlaylistsService } from '@iptvnator/services';
import {
    CONNECTIVITY_GUARD_RESET,
    ERROR,
    STALKER_REQUEST,
    XTREAM_REQUEST,
    XTREAM_RESPONSE,
} from '@iptvnator/shared/interfaces';
import { DataFactory } from './data-factory';
import { ElectronService } from './electron.service';
import { NATIVE_HTTP, NativeDataService } from './native-data.service';
import { PwaService } from './pwa.service';

describe('NativeDataService', () => {
    let service: NativeDataService;
    let nativeHttp: { get: jest.Mock };
    let snackBar: { open: jest.Mock };
    let playlists: { handlePlaylistParsing: jest.Mock };

    const xtreamRequest = (
        params: Record<string, string>,
        extra: Record<string, unknown> = {}
    ) =>
        service.sendIpcEvent<Promise<unknown>>(XTREAM_REQUEST, {
            url: 'http://host:8080/',
            params: { username: ' u ', password: 'p&w', ...params },
            ...extra,
        });

    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        nativeHttp = { get: jest.fn() };
        snackBar = { open: jest.fn() };
        playlists = { handlePlaylistParsing: jest.fn() };

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                NativeDataService,
                { provide: NATIVE_HTTP, useValue: nativeHttp },
                { provide: MatSnackBar, useValue: snackBar },
                { provide: Store, useValue: { dispatch: jest.fn() } },
                { provide: SwUpdate, useValue: { versionUpdates: EMPTY } },
                { provide: PlaylistsService, useValue: playlists },
                {
                    provide: TranslateService,
                    useValue: { instant: jest.fn((key: string) => key) },
                },
            ],
        });
        service = TestBed.inject(NativeDataService);
    });

    afterEach(() => {
        delete (window as { Capacitor?: unknown }).Capacitor;
        jest.restoreAllMocks();
    });

    it('calls player_api.php directly with trimmed credentials and VLC user agent', async () => {
        nativeHttp.get.mockResolvedValue({ status: 200, data: [] });

        await xtreamRequest({ action: 'get_live_streams' });

        expect(nativeHttp.get).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'http://host:8080/player_api.php',
                params: {
                    username: 'u',
                    password: 'p&w',
                    action: 'get_live_streams',
                },
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
            })
        );
    });

    it('posts XTREAM_RESPONSE with the payload on success', async () => {
        const postMessage = jest
            .spyOn(window, 'postMessage')
            .mockImplementation(() => undefined);
        nativeHttp.get.mockResolvedValue({ status: 200, data: [{ id: 1 }] });

        const result = await xtreamRequest({ action: 'get_live_streams' });

        const expected = {
            type: XTREAM_RESPONSE,
            payload: [{ id: 1 }],
            action: 'get_live_streams',
        };
        expect(result).toEqual(expected);
        expect(postMessage).toHaveBeenCalledWith(expected);
    });

    it('returns ERROR when the provider answers non-JSON', async () => {
        jest.spyOn(window, 'postMessage').mockImplementation(() => undefined);
        nativeHttp.get.mockResolvedValue({
            status: 200,
            data: '<html>challenge</html>',
        });

        const result = await xtreamRequest({ action: 'get_vod_streams' });

        expect(result).toEqual(
            expect.objectContaining({ type: ERROR, status: 502 })
        );
    });

    it('returns ERROR with the provider status on HTTP 4xx/5xx', async () => {
        jest.spyOn(window, 'postMessage').mockImplementation(() => undefined);
        nativeHttp.get.mockResolvedValue({ status: 503, data: 'busy' });

        const result = await xtreamRequest({ action: 'get_series' });

        expect(result).toEqual(
            expect.objectContaining({ type: ERROR, status: 503 })
        );
    });

    it('maps a CapacitorHttp timeout to ERROR', async () => {
        nativeHttp.get.mockRejectedValue({
            code: 'SocketTimeoutException',
            message: 'timeout',
        });

        const result = await xtreamRequest({ action: 'get_vod_streams' });

        expect(result).toEqual({
            type: ERROR,
            status: 500,
            message: 'timeout (SocketTimeoutException)',
        });
        expect(snackBar.open).toHaveBeenCalled();
    });

    it('connectionTest returns { payload } or { connectionFailure }', async () => {
        nativeHttp.get.mockResolvedValueOnce({
            status: 200,
            data: { user_info: { auth: 1 } },
        });
        await expect(
            xtreamRequest(
                { action: 'get_account_info' },
                { connectionTest: true }
            )
        ).resolves.toEqual({ payload: { user_info: { auth: 1 } } });

        nativeHttp.get.mockResolvedValueOnce({ status: 401, data: '' });
        await expect(
            xtreamRequest(
                { action: 'get_account_info' },
                { connectionTest: true }
            )
        ).resolves.toEqual({
            connectionFailure: { kind: 'http', status: 401, canTryHttp: false },
        });

        nativeHttp.get.mockRejectedValueOnce({
            code: 'ConnectException',
            message: 'ECONNREFUSED',
        });
        await expect(
            xtreamRequest(
                { action: 'get_account_info' },
                { connectionTest: true }
            )
        ).resolves.toEqual({
            connectionFailure: { kind: 'connection', canTryHttp: true },
        });
        expect(snackBar.open).not.toHaveBeenCalled();
    });

    it('rejects Stalker requests as unsupported', async () => {
        await expect(
            service.sendIpcEvent<Promise<unknown>>(STALKER_REQUEST, {
                url: 'http://portal/c/',
                macAddress: '00:1A:79:00:00:00',
                params: { action: 'handshake' },
            })
        ).rejects.toMatchObject({
            message: 'PORTALS.REQUEST_ERRORS.STALKER',
            status: 501,
        });
        expect(nativeHttp.get).not.toHaveBeenCalled();
    });

    it('has no connectivity guard to reset and reports the native environment', async () => {
        await expect(
            service.sendIpcEvent<Promise<unknown>>(CONNECTIVITY_GUARD_RESET, {
                url: 'http://host:8080',
            })
        ).resolves.toEqual({ reset: false });
        expect(service.getAppEnvironment()).toBe('native');
    });

    it('downloads URL playlists natively and parses them in the client', async () => {
        nativeHttp.get.mockResolvedValue({ status: 200, data: '#EXTM3U' });
        playlists.handlePlaylistParsing.mockResolvedValue({ _id: 'p1' });

        const playlist = await firstValueFrom(
            service.getPlaylistFromUrl('http://h/my.m3u', 'Custom UA')
        );

        expect(nativeHttp.get).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'http://h/my.m3u',
                responseType: 'text',
                headers: { 'User-Agent': 'Custom UA' },
            })
        );
        expect(playlists.handlePlaylistParsing).toHaveBeenCalledWith(
            'URL',
            '#EXTM3U',
            'my.m3u',
            'http://h/my.m3u'
        );
        expect(playlist).toEqual({ _id: 'p1' });
    });

    it('fails URL playlist downloads with the HTTP status', async () => {
        nativeHttp.get.mockResolvedValue({ status: 404, data: 'missing' });

        await expect(
            firstValueFrom(service.getPlaylistFromUrl('http://h/my.m3u'))
        ).rejects.toMatchObject({ status: 404 });
        expect(playlists.handlePlaylistParsing).not.toHaveBeenCalled();
    });
});

describe('DataFactory', () => {
    const resolveWith = () => {
        const injector = Injector.create({
            providers: [
                { provide: ElectronService, useValue: { kind: 'electron' } },
                { provide: NativeDataService, useValue: { kind: 'native' } },
                { provide: PwaService, useValue: { kind: 'pwa' } },
            ],
            parent: TestBed.inject(Injector),
        });
        return runInInjectionContext(injector, () => DataFactory());
    };

    afterEach(() => {
        delete (window as { Capacitor?: unknown }).Capacitor;
    });

    it('DataFactory picks NativeDataService inside a native shell', () => {
        (window as { Capacitor?: unknown }).Capacitor = {
            isNativePlatform: () => true,
        };
        expect(resolveWith()).toEqual({ kind: 'native' });
    });

    it('DataFactory keeps PwaService in a browser', () => {
        expect(resolveWith()).toEqual({ kind: 'pwa' });
    });
});
