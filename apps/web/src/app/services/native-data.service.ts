import { inject, Injectable, InjectionToken, Injector } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CapacitorHttp, HttpOptions } from '@capacitor/core';
import { from, Observable } from 'rxjs';
import { PlaylistsService } from '@iptvnator/services';
import {
    ExternalPlayerSession,
    OPEN_MPV_PLAYER,
    OPEN_VLC_PLAYER,
    PlayerContentInfo,
    Playlist,
    PortalDebugTransport,
    XTREAM_PREFETCH_LIVE_CATALOGUE,
} from '@iptvnator/shared/interfaces';
import {
    buildNativeXtreamRequest,
    describeNativeConnectionFailure,
    getFollowingRedirects,
    interpretXtreamHttpResponse,
    NATIVE_XTREAM_TIMEOUTS,
    NativeHttpResponse,
    playlistTitleFromUrl,
    toNativeTransportError,
} from './native-xtream-request';
import { NativeXtreamPrefetch } from './native-xtream-prefetch';
import { NATIVE_EXTERNAL_PLAYER } from './native-external-player';
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

/** The part of the desktop player launch payload Android can use. */
interface ExternalLaunchPayload {
    readonly url: string;
    readonly title?: string;
    readonly contentInfo?: PlayerContentInfo;
}

interface LiveCataloguePrefetch {
    readonly url: string;
    readonly username: string;
    readonly password: string;
}

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
    private readonly externalPlayer = inject(NATIVE_EXTERNAL_PLAYER);
    private readonly nativeSnackBar = inject(MatSnackBar);
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
            response = await (payload.connectionTest
                ? this.get(request)
                : this.takePrefetchedOrGet(request));
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

    override sendIpcEvent<T = unknown>(type: string, payload?: unknown): T {
        if (type === XTREAM_PREFETCH_LIVE_CATALOGUE) {
            this.prefetchLiveCatalogue(payload as LiveCataloguePrefetch);
            return undefined as T;
        }
        if (type === OPEN_VLC_PLAYER || type === OPEN_MPV_PLAYER) {
            return this.openExternalPlayer(
                type === OPEN_VLC_PLAYER ? 'vlc' : 'mpv',
                payload as ExternalLaunchPayload
            ) as T;
        }
        return super.sendIpcEvent<T>(type, payload);
    }

    /**
     * The desktop MPV/VLC launch, on Android: the stream goes to a player
     * app through the OS. A hand-off resolves as an opened session (which
     * Android cannot close or follow afterwards); no player app resolves
     * void, which callers read as a failed launch.
     */
    private async openExternalPlayer(
        player: ExternalPlayerSession['player'],
        payload: ExternalLaunchPayload
    ): Promise<ExternalPlayerSession | void> {
        const launched = await this.externalPlayer(
            payload.url,
            payload.title || undefined
        );
        if (launched) {
            const now = new Date().toISOString();
            return {
                id: `native-${player}-${Date.now()}`,
                player,
                status: 'opened',
                title: payload.title ?? '',
                streamUrl: payload.url,
                contentInfo: payload.contentInfo,
                startedAt: now,
                updatedAt: now,
                canClose: false,
            };
        }
        this.nativeSnackBar.open(
            this.translateService.instant('PORTALS.EXTERNAL_PLAYER_NOT_INSTALLED'),
            this.translateService.instant('CLOSE'),
            { duration: 5000 }
        );
    }

    /**
     * The import asks for account info, then categories, then live channels,
     * each waiting for the previous one. The Xtream route session sends
     * XTREAM_PREFETCH_LIVE_CATALOGUE for the source it opens, so the last two
     * run while the account info is checked and Live opens several seconds
     * earlier on a Fire TV Stick. The import flow itself (and its handling of
     * expired accounts) is unchanged; an unused answer simply expires.
     */
    private prefetchLiveCatalogue(source: LiveCataloguePrefetch): void {
        if (!source?.url || !source.username || !source.password) {
            return;
        }
        const request = buildNativeXtreamRequest(source.url, {
            username: source.username,
            password: source.password,
        });
        const params = request.params as Record<string, string>;
        this.prefetch.start(
            request.url,
            { username: params['username'], password: params['password'] },
            (prefetchParams) => this.get({ ...request, params: prefetchParams })
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
            ? prefetched.catch(() => this.get(request))
            : this.get(request);
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

    /** Every native request also follows redirects across protocols. */
    private get(options: HttpOptions): Promise<NativeHttpResponse> {
        return getFollowingRedirects(
            (next) => this.nativeHttp.get(next),
            options
        );
    }

    override getAppEnvironment(): string {
        return 'native';
    }

    private async downloadPlaylist(
        url: string,
        userAgent?: string
    ): Promise<Playlist> {
        const response = await this.get({
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
