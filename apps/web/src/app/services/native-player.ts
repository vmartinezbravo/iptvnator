import { InjectionToken } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { Observable } from 'rxjs';

export interface NativePlayerItem {
    url: string;
    title?: string;
}

export interface NativePlayerRequest {
    items: readonly NativePlayerItem[];
    index: number;
    isLive: boolean;
    startPositionMs?: number;
    audioMode?: 'auto' | 'pcm';
}

export type NativePlayerEvent =
    | { type: 'first-frame'; index: number; ms: number }
    | {
          type: 'audio';
          index: number;
          decoder: string | null;
          encoding: string;
          passthrough: boolean;
          /** Language of the track that plays; null when it is not tagged. */
          language: string | null;
      }
    | { type: 'error'; index: number; code: string; message: string }
    /** Movies and episodes, every 30 s; `durationMs` is -1 while unknown. */
    | {
          type: 'progress';
          index: number;
          positionMs: number;
          durationMs: number;
      }
    | { type: 'closed'; index: number; positionMs: number; durationMs: number };

/**
 * A fullscreen player of the device. Platform-neutral on purpose: Android
 * implements it with Media3 (`NativePlayerPlugin.java`); an iOS shell would
 * implement the same plugin name.
 */
export interface NativePlayer {
    play(request: NativePlayerRequest): Promise<void>;
    events(): Observable<NativePlayerEvent>;
}

type PluginEventData = Record<string, unknown>;

/** The Capacitor plugin as seen from JS; events carry no stream URLs. */
export interface NativePlayerPluginApi {
    play(request: NativePlayerRequest): Promise<{ started: boolean }>;
    addListener(
        eventName: string,
        listener: (data: PluginEventData) => void
    ): Promise<{ remove: () => Promise<void> }>;
}

function durationMs(data: PluginEventData): number {
    const value = data['durationMs'];
    return typeof value === 'number' ? value : -1;
}

const PLUGIN_EVENTS: Record<
    string,
    (data: PluginEventData) => NativePlayerEvent
> = {
    firstFrame: (d) => ({
        type: 'first-frame',
        index: Number(d['index']),
        ms: Number(d['ms']),
    }),
    audio: (d) => ({
        type: 'audio',
        index: Number(d['index']),
        decoder: typeof d['decoder'] === 'string' ? d['decoder'] : null,
        encoding: String(d['encoding']),
        passthrough: d['passthrough'] === true,
        language: typeof d['language'] === 'string' ? d['language'] : null,
    }),
    error: (d) => ({
        type: 'error',
        index: Number(d['index']),
        code: String(d['code']),
        message: String(d['message'] ?? ''),
    }),
    progress: (d) => ({
        type: 'progress',
        index: Number(d['index']),
        positionMs: Number(d['positionMs']),
        durationMs: durationMs(d),
    }),
    closed: (d) => ({
        type: 'closed',
        index: Number(d['index']),
        positionMs: Number(d['positionMs']),
        durationMs: durationMs(d),
    }),
};

export function createNativePlayer(
    plugin: NativePlayerPluginApi
): NativePlayer {
    return {
        async play(request) {
            await plugin.play(request);
        },
        events() {
            return new Observable<NativePlayerEvent>((subscriber) => {
                const handles = Object.entries(PLUGIN_EVENTS).map(
                    ([name, toEvent]) =>
                        plugin.addListener(name, (data) =>
                            subscriber.next(toEvent(data))
                        )
                );
                return () => {
                    for (const handle of handles) {
                        void handle.then((h) => h.remove());
                    }
                };
            });
        },
    };
}

export const NATIVE_PLAYER = new InjectionToken<NativePlayer>('NATIVE_PLAYER', {
    providedIn: 'root',
    factory: () =>
        createNativePlayer(
            registerPlugin<NativePlayerPluginApi>('NativePlayer')
        ),
});
