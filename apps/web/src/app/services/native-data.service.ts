import { inject, Injectable, InjectionToken, Injector } from '@angular/core';
import { CapacitorHttp, HttpOptions } from '@capacitor/core';
import { from, Observable } from 'rxjs';
import { PlaylistsService } from '@iptvnator/services';
import { Playlist, PortalDebugTransport } from '@iptvnator/shared/interfaces';
import {
    buildNativeXtreamRequest,
    describeNativeConnectionFailure,
    interpretXtreamHttpResponse,
    NATIVE_XTREAM_TIMEOUTS,
    NativeHttpResponse,
    playlistTitleFromUrl,
    toNativeTransportError,
} from './native-xtream-request';
import { NativeXtreamPrefetch } from './native-xtream-prefetch';
import {
    PwaService,
    PwaXtreamResponse,
    XtreamRequestPayload,
} from './pwa.service';

export interface NativeHttpClient {
    get(options: HttpOptions): Promise<NativeHttpResponse>;
}

/** CapacitorHttp, called explicitly; its global fetch/XHR patch stays off. */
export const NATIVE_HTTP = new InjectionToken<NativeHttpClient>('NATIVE_HTTP', {
    providedIn: 'root',
    factory: () => CapacitorHttp,
});

const STALKER_UNSUPPORTED_STATUS = 501;

/**
 * Data service of the native (Capacitor) shell. Everything except the
 * transport is the PWA runtime: storage, messages and error handling come
 * from PwaService, but Xtream and URL playlists go straight to the provider
 * through the native HTTP stack, which has no CORS and needs no proxy.
 */
@Injectable({
    providedIn: 'root',
})
export class NativeDataService extends PwaService {
    private readonly nativeHttp = inject(NATIVE_HTTP);
    // PlaylistsService depends on DataService, which is this service in the
    // native shell: resolve it on use, not at construction.
    private readonly injector = inject(Injector);
    private readonly prefetch = new NativeXtreamPrefetch();
    protected override readonly xtreamDebugTransport: PortalDebugTransport =
        'native-http';

    protected override async sendXtreamRequest(
        payload: XtreamRequestPayload,
        logRequest: (request: unknown) => void
    ): Promise<PwaXtreamResponse & { connectionFailure?: unknown }> {
        const request = buildNativeXtreamRequest(payload.url, payload.params);
        logRequest({ method: 'GET', url: request.url, params: request.params });

        let response: NativeHttpResponse;
        try {
            const pending = payload.connectionTest
                ? this.nativeHttp.get(request)
                : this.takePrefetchedOrGet(request);
            if (
                !payload.connectionTest &&
                request.params?.['action'] === 'get_account_info'
            ) {
                this.prefetchLiveCatalogue(request);
            }
            response = await pending;
        } catch (failure) {
            if (payload.connectionTest) {
                return {
                    connectionFailure: describeNativeConnectionFailure(failure),
                };
            }
            throw toNativeTransportError(failure);
        }

        if (payload.connectionTest && response.status >= 400) {
            return {
                connectionFailure: {
                    kind: 'http',
                    status: response.status,
                    canTryHttp: false,
                },
            };
        }
        if (payload.connectionTest) {
            return { payload: response.data };
        }
        return interpretXtreamHttpResponse(response);
    }

    /**
     * The import asks for account info, then categories, then live channels,
     * each waiting for the previous one. Starting the last two with the
     * account info lets Live open several seconds earlier on a Fire TV Stick;
     * the import flow itself (and its handling of expired accounts) is
     * unchanged, and an unused answer simply expires.
     */
    private prefetchLiveCatalogue(request: HttpOptions): void {
        const params = request.params as Record<string, string> | undefined;
        if (!params?.['username'] || !params['password']) {
            return;
        }
        this.prefetch.start(
            request.url,
            { username: params['username'], password: params['password'] },
            (prefetchParams) =>
                this.nativeHttp.get({ ...request, params: prefetchParams })
        );
    }

    private takePrefetchedOrGet(
        request: HttpOptions
    ): Promise<NativeHttpResponse> {
        const prefetched = this.prefetch.take(
            request.url,
            (request.params ?? {}) as Record<string, string>
        );
        return prefetched
            ? prefetched.catch(() => this.nativeHttp.get(request))
            : this.nativeHttp.get(request);
    }

    override async forwardStalkerRequest(): Promise<never> {
        const error = new Error(
            this.translateService.instant('PORTALS.REQUEST_ERRORS.STALKER', {
                message: 'Stalker portals are not supported on this device',
                status: STALKER_UNSUPPORTED_STATUS,
            })
        ) as Error & { status: number };
        error.status = STALKER_UNSUPPORTED_STATUS;
        throw error;
    }

    protected override async resetConnectivityGuard(): Promise<{
        reset: boolean;
    }> {
        return { reset: false };
    }

    override getPlaylistFromUrl(
        url: string,
        userAgent?: string
    ): Observable<Playlist> {
        return from(this.downloadPlaylist(url, userAgent?.trim()));
    }

    override getAppEnvironment(): string {
        return 'native';
    }

    private async downloadPlaylist(
        url: string,
        userAgent?: string
    ): Promise<Playlist> {
        const response = await this.nativeHttp.get({
            url,
            responseType: 'text',
            ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
            ...NATIVE_XTREAM_TIMEOUTS,
        });
        if (response.status >= 400) {
            throw Object.assign(
                new Error(`Request failed with status code ${response.status}`),
                { status: response.status }
            );
        }
        return (await this.injector
            .get(PlaylistsService)
            .handlePlaylistParsing(
                'URL',
                String(response.data ?? ''),
                playlistTitleFromUrl(url),
                url
            )) as Playlist;
    }
}
