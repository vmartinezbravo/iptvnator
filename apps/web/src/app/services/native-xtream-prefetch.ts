import type { NativeHttpResponse } from './native-xtream-request';

/**
 * What the native shell asks for ahead of the import: the import itself runs
 * account info → categories → live channels one after another, about 2 s each
 * on a Fire TV Stick. Movies and series are left alone (large, memory).
 */
export const NATIVE_PREFETCH_ACTIONS = [
    'get_live_categories',
    'get_vod_categories',
    'get_series_categories',
    'get_live_streams',
] as const;

/** An unused prefetched answer is dropped after this long. */
export const NATIVE_PREFETCH_TTL_MS = 120_000;

type Load = (params: Record<string, string>) => Promise<NativeHttpResponse>;

interface Entry {
    readonly at: number;
    readonly response: Promise<NativeHttpResponse>;
}

const keyOf = (url: string, params: Record<string, string>): string =>
    `${url}?${Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join('&')}`;

/**
 * Prefetched Xtream answers, each handed out once to the identical request.
 */
export class NativeXtreamPrefetch {
    private readonly entries = new Map<string, Entry>();

    constructor(private readonly now: () => number = Date.now) {}

    start(
        url: string,
        credentials: { username: string; password: string },
        load: Load
    ): void {
        this.dropExpired();
        for (const action of NATIVE_PREFETCH_ACTIONS) {
            const params = { ...credentials, action };
            const key = keyOf(url, params);
            if (this.entries.has(key)) {
                continue;
            }
            const response = load(params);
            // The consumer decides what a failure means; never unhandled.
            response.catch(() => undefined);
            this.entries.set(key, { at: this.now(), response });
        }
    }

    take(
        url: string,
        params: Record<string, string>
    ): Promise<NativeHttpResponse> | null {
        this.dropExpired();
        const key = keyOf(url, params);
        const entry = this.entries.get(key);
        if (!entry) {
            return null;
        }
        this.entries.delete(key);
        return entry.response;
    }

    private dropExpired(): void {
        const now = this.now();
        for (const [key, entry] of this.entries) {
            if (now - entry.at > NATIVE_PREFETCH_TTL_MS) {
                this.entries.delete(key);
            }
        }
    }
}
