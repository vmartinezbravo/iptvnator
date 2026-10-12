import { inject, Injectable } from '@angular/core';
import { PlaybackHistoryGate } from '@iptvnator/playback/data-access';
import type { PortalLiveQueue } from '@iptvnator/portal/shared/util';
import { PlaybackPositionUpdateFeed } from '@iptvnator/services';
import {
    ExternalPlayerSession,
    ResolvedPortalPlayback,
} from '@iptvnator/shared/interfaces';
import { Subscription } from 'rxjs';
import { NATIVE_PLAYER, NativePlayerEvent } from './native-player';
import { toPlaybackPosition } from './native-playback-position';
import { SettingsStore } from './settings-store.service';

/**
 * Plays through the device player (Media3 on Android) what the app would
 * otherwise hand to MPV or VLC. Movies and episodes report their position
 * back through `PlaybackPositionUpdateFeed`, where the stores that save
 * MPV's positions on desktop pick it up. A first frame confirms the item
 * for the recently viewed list, as an opened MPV/VLC session does.
 */
@Injectable({ providedIn: 'root' })
export class NativePlaybackService {
    private readonly player = inject(NATIVE_PLAYER);
    private readonly settings = inject(SettingsStore);
    private readonly positions = inject(PlaybackPositionUpdateFeed);
    private readonly history = inject(PlaybackHistoryGate);
    private current: Subscription | null = null;

    async open(
        playback: ResolvedPortalPlayback
    ): Promise<ExternalPlayerSession> {
        const contentInfo = playback.contentInfo;
        this.follow([playback.streamUrl], (event) => {
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
        });
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

    /**
     * Live channels with zapping; resolves with the channel on screen when
     * the player closes. Live channels have no position to keep.
     */
    async openLiveQueue(queue: PortalLiveQueue): Promise<number> {
        const closed = new Promise<number>((resolve) => {
            this.follow(
                queue.channels.map((channel) => channel.streamUrl),
                (event) => {
                    if (event.type === 'closed') {
                        resolve(event.index);
                    }
                }
            );
        });
        try {
            await this.player.play({
                items: queue.channels.map((channel) => ({
                    url: channel.streamUrl,
                    title: channel.title,
                })),
                index: queue.index,
                isLive: true,
                audioMode: this.settings.nativePlayerAudioMode?.() ?? 'auto',
            });
        } catch (error) {
            this.stopFollowing();
            throw error;
        }
        return closed;
    }

    /** Only the latest playback's events count; its close ends them. */
    private follow(
        streamUrls: readonly string[],
        onEvent: (event: NativePlayerEvent) => void
    ): void {
        this.stopFollowing();
        const subscription = this.player.events().subscribe((event) => {
            if (event.type === 'first-frame' && streamUrls[event.index]) {
                this.history.confirm({ streamUrls: [streamUrls[event.index]] });
            }
            onEvent(event);
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
