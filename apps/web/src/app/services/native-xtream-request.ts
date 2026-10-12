import type { HttpOptions } from '@capacitor/core';
import {
    describeXtreamConnectionFailure,
    normalizeXtreamServerUrl,
    XTREAM_CLIENT_USER_AGENT,
    XtreamConnectionFailure,
} from '@iptvnator/shared/interfaces';

/**
 * Pure helpers for the native (Capacitor) transport: the device talks to the
 * provider directly, so the URL building, parameter cleanup and response
 * classification that the web backend does for the PWA live here.
 */

/** get_vod_streams can take several seconds before the first byte. */
export const NATIVE_XTREAM_TIMEOUTS = {
    connectTimeout: 15_000,
    readTimeout: 90_000,
} as const;

export interface NativeHttpResponse {
    readonly status: number;
    readonly data: unknown;
    readonly headers?: Record<string, string>;
}

/** Same bound as common HTTP clients. */
export const NATIVE_MAX_REDIRECTS = 5;

/** What a CapacitorHttp rejection carries: the Java exception name as code. */
export interface NativeHttpFailure {
    readonly code?: unknown;
    readonly message?: unknown;
}

export type NativeXtreamOutcome =
    | { readonly payload: unknown }
    | { readonly status: number; readonly message: string };

export function buildXtreamApiUrl(serverUrl: string): string {
    return `${normalizeXtreamServerUrl(serverUrl)}/player_api.php`;
}

/** Same cleanup as the web backend: trimmed values, empty ones dropped. */
function cleanParams(params: Record<string, string>): Record<string, string> {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed) {
            cleaned[key] = trimmed;
        }
    }
    return cleaned;
}

export function buildNativeXtreamRequest(
    serverUrl: string,
    params: Record<string, string>
): HttpOptions {
    return {
        url: buildXtreamApiUrl(serverUrl),
        params: cleanParams(params),
        headers: { 'User-Agent': XTREAM_CLIENT_USER_AGENT },
        responseType: 'json',
        ...NATIVE_XTREAM_TIMEOUTS,
    };
}

/**
 * CapacitorHttp resolves on any HTTP status and hands back the raw text when
 * the body is not JSON (a WAF challenge, an error page).
 */
export function interpretXtreamHttpResponse(
    response: NativeHttpResponse
): NativeXtreamOutcome {
    if (response.status >= 400) {
        return {
            status: response.status,
            message: `HTTP Error ${response.status}`,
        };
    }
    const data = response.data;
    if (data === null || typeof data !== 'object') {
        return {
            status: 502,
            message: 'The provider answer is not JSON',
        };
    }
    return { payload: data };
}

export function toNativeTransportError(failure: unknown): Error {
    const { code, message } = (failure ?? {}) as NativeHttpFailure;
    const text = typeof message === 'string' && message ? message : 'Error';
    return new Error(
        typeof code === 'string' && code ? `${text} (${code})` : text
    );
}

/**
 * Maps an Android exception onto the Node-style codes the shared classifier
 * reads: a refused connection is the one case where retrying over HTTP is safe.
 */
export function describeNativeConnectionFailure(
    failure: unknown
): XtreamConnectionFailure {
    const { code, message } = (failure ?? {}) as NativeHttpFailure;
    const refused =
        typeof message === 'string' && message.includes('ECONNREFUSED');
    return describeXtreamConnectionFailure(
        { code: refused ? 'ECONNREFUSED' : code, message },
        false
    );
}

export function playlistTitleFromUrl(url: string): string {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? parsed.hostname;
}

const redirectLocation = (response: NativeHttpResponse): string | null => {
    if (response.status < 300 || response.status > 399) {
        return null;
    }
    const headers = response.headers ?? {};
    const key = Object.keys(headers).find(
        (k) => k.toLowerCase() === 'location'
    );
    return key ? headers[key] : null;
};

/**
 * Android's HttpURLConnection follows redirects within one protocol only, so
 * a provider that moved from http to https answers 3xx with an empty body.
 * Follow the Location (absolute or relative) the way desktop clients do;
 * the target URL already carries the query.
 */
export async function getFollowingRedirects(
    get: (options: HttpOptions) => Promise<NativeHttpResponse>,
    options: HttpOptions
): Promise<NativeHttpResponse> {
    let current = options;
    for (let hop = 0; ; hop++) {
        const response = await get(current);
        const location = redirectLocation(response);
        if (!location) {
            return response;
        }
        if (hop >= NATIVE_MAX_REDIRECTS) {
            throw Object.assign(
                new Error(`Too many redirects from ${options.url}`),
                { status: response.status }
            );
        }
        current = {
            ...current,
            url: new URL(location, current.url).href,
            params: {},
        };
    }
}
