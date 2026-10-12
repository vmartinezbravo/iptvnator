import { InjectionToken } from '@angular/core';
import {
    ExternalPlayerSession,
    ResolvedPortalPlayback,
} from '@iptvnator/shared/interfaces';
import type { ExternalPlayerName } from '@iptvnator/shared/interfaces';

/** Live channels for a fullscreen player that zaps between them. */
export interface PortalLiveQueue {
    channels: readonly ResolvedPortalPlayback[];
    index: number;
}

export interface PortalPlayer {
    isEmbeddedPlayer(): boolean;
    openPlayer(
        streamUrl: string,
        title: string,
        thumbnail?: string | null,
        hideExternalInfoDialog?: boolean,
        isLiveContent?: boolean,
        userAgent?: string,
        referer?: string,
        origin?: string,
        contentInfo?: unknown,
        startTime?: number,
        headers?: Record<string, string>
    ): Promise<ExternalPlayerSession | void>;
    openResolvedPlayback(
        playback: ResolvedPortalPlayback,
        hideExternalInfoDialog?: boolean
    ): Promise<ExternalPlayerSession | void>;
    openExternalPlayback(
        playback: ResolvedPortalPlayback,
        player: ExternalPlayerName
    ): Promise<ExternalPlayerSession | void>;
    /**
     * Plays `channels[index]` with the list for zapping; resolves with the
     * index on screen when the player closes. Players without a queue open
     * the chosen channel alone and resolve with `index` at once.
     */
    playLiveQueue?(queue: PortalLiveQueue): Promise<number>;
}

export const PORTAL_PLAYER = new InjectionToken<PortalPlayer>('PORTAL_PLAYER');
