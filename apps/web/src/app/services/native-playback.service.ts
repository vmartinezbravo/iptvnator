import { inject, Injectable } from '@angular/core';
import { PlaybackHistoryGate } from '@iptvnator/playback/data-access';
import type { PortalLiveQueue } from '@iptvnator/portal/shared/util';
import { PlaybackPositionUpdateFeed } from '@iptvnator/services';
import {
    ExternalPlayerSession,
    ResolvedPortalPlayback,
} from '@iptvnator/shared/interfaces';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import {
    NATIVE_PLAYER,
    NativePlayerEvent,
    NativePlayerItem,
    NativePlayerRequest,
} from './native-player';
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
    private readonly translate = inject(TranslateService);
    private current: Subscription | null = null;
    /** Settles the pending live queue when a newer playback replaces it. */
    private settleQueue: (() => void) | null = null;
    /** Bumped by every start, so a superseded start does not follow. */
    private generation = 0;

    async open(
        playback: ResolvedPortalPlayback
    ): Promise<ExternalPlayerSession> {
        const current = await this.start({
            items: [this.itemOf(playback)],
            index: 0,
            isLive: !!playback.isLive,
            startPositionMs: (playback.startTime ?? 0) * 1000,
        });
        const contentInfo = playback.contentInfo;
        this.follow(current, [playback.streamUrl], (event) => {
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
     * the player closes, or with the chosen one when a newer playback
     * replaces it. Live channels have no position to keep.
     */
    async openLiveQueue(queue: PortalLiveQueue): Promise<number> {
        const current = await this.start({
            items: queue.channels.map((channel) => ({
                url: channel.streamUrl,
                title: channel.title,
            })),
            index: queue.index,
            isLive: true,
        });
        if (!current) {
            return queue.index;
        }
        return new Promise<number>((resolve) => {
            this.settleQueue = () => resolve(queue.index);
            this.follow(
                current,
                queue.channels.map((channel) => channel.streamUrl),
                (event) => {
                    if (event.type === 'closed') {
                        this.settleQueue = null;
                        resolve(event.index);
                    }
                }
            );
        });
    }

    /** An episode also shows its series, season and number. */
    private itemOf(playback: ResolvedPortalPlayback): NativePlayerItem {
        const item: NativePlayerItem = {
            url: playback.streamUrl,
            title: playback.title,
        };
        const info = playback.contentInfo;
        if (info?.contentType !== 'episode') {
            return item;
        }
        const number =
            info.seasonNumber && info.episodeNumber
                ? this.translate.instant(
                      'WORKSPACE.DASHBOARD.SEASON_EPISODE_BADGE',
                      {
                          season: info.seasonNumber,
                          episode: info.episodeNumber,
                      }
                  )
                : '';
        const subtitle = [playback.seriesTitle, number]
            .filter(Boolean)
            .join(' · ');
        return subtitle ? { ...item, subtitle } : item;
    }

    /**
     * Ends the previous playback's follower, then opens the player. Events
     * are followed only once the plugin answered: the page receives the
     * previous player's events late, and they come before that answer.
     */
    private async start(
        request: Omit<NativePlayerRequest, 'audioMode'>
    ): Promise<boolean> {
        this.stopFollowing();
        const generation = ++this.generation;
        await this.player.play({
            ...request,
            audioMode: this.settings.nativePlayerAudioMode?.() ?? 'auto',
        });
        return generation === this.generation;
    }

    /** Only the latest playback's events count; its close ends them. */
    private follow(
        current: boolean,
        streamUrls: readonly string[],
        onEvent: (event: NativePlayerEvent) => void
    ): void {
        if (!current) {
            return;
        }
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
        const settle = this.settleQueue;
        this.settleQueue = null;
        settle?.();
    }
}
