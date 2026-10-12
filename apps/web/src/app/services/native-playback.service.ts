import { inject, Injectable } from '@angular/core';
import { PlaybackPositionUpdateFeed } from '@iptvnator/services';
import {
    ExternalPlayerSession,
    ResolvedPortalPlayback,
} from '@iptvnator/shared/interfaces';
import { Subscription } from 'rxjs';
import { NATIVE_PLAYER } from './native-player';
import { toPlaybackPosition } from './native-playback-position';
import { SettingsStore } from './settings-store.service';

/**
 * Plays through the device player (Media3 on Android) what the app would
 * otherwise hand to MPV or VLC. Movies and episodes report their position
 * back through `PlaybackPositionUpdateFeed`, where the stores that save
 * MPV's positions on desktop pick it up.
 */
@Injectable({ providedIn: 'root' })
export class NativePlaybackService {
    private readonly player = inject(NATIVE_PLAYER);
    private readonly settings = inject(SettingsStore);
    private readonly positions = inject(PlaybackPositionUpdateFeed);
    private current: Subscription | null = null;

    async open(
        playback: ResolvedPortalPlayback
    ): Promise<ExternalPlayerSession> {
        this.followPositions(playback);
        try {
            await this.player.play({
                items: [{ url: playback.streamUrl, title: playback.title }],
                index: 0,
                isLive: !!playback.isLive,
                startPositionMs: (playback.startTime ?? 0) * 1000,
                audioMode: this.settings.nativePlayerAudioMode?.() ?? 'auto',
            });
        } catch (error) {
            this.stopFollowing();
            throw error;
        }
        const now = new Date().toISOString();
        return {
            id: `native-${Date.now()}`,
            player: 'native',
            status: 'opened',
            title: playback.title,
            streamUrl: playback.streamUrl,
            contentInfo: playback.contentInfo,
            startedAt: now,
            updatedAt: now,
            canClose: false,
        };
    }

    /** Only the latest playback's events count; its close ends them. */
    private followPositions(playback: ResolvedPortalPlayback): void {
        this.stopFollowing();
        const contentInfo = playback.contentInfo;
        const subscription = this.player.events().subscribe((event) => {
            if (event.type !== 'progress' && event.type !== 'closed') {
                return;
            }
            const position = contentInfo
                ? toPlaybackPosition(
                      contentInfo,
                      event.positionMs,
                      event.durationMs
                  )
                : null;
            if (position) {
                this.positions.publish(position);
            }
            if (event.type === 'closed') {
                subscription.unsubscribe();
            }
        });
        this.current = subscription;
    }

    private stopFollowing(): void {
        this.current?.unsubscribe();
        this.current = null;
    }
}
