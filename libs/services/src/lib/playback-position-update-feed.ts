import { Injectable } from '@angular/core';
import { PlaybackPositionData } from '@iptvnator/shared/interfaces';

type PlaybackPositionListener = (data: PlaybackPositionData) => void;

/**
 * Position updates of a player that is not Electron's (the device player of
 * the native shell). `PlaybackPositionRuntimeBridgeService` hands them to
 * the same subscribers that MPV's updates reach on desktop.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackPositionUpdateFeed {
    private readonly listeners = new Set<PlaybackPositionListener>();

    publish(data: PlaybackPositionData): void {
        for (const listener of [...this.listeners]) {
            listener(data);
        }
    }

    subscribe(callback: PlaybackPositionListener): () => void {
        this.listeners.add(callback);
        return () => {
            this.listeners.delete(callback);
        };
    }
}
