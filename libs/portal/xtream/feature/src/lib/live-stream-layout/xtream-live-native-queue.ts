import type {
    PortalLiveQueue,
    PortalPlayer,
} from '@iptvnator/portal/shared/util';
import type { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';
import type { XtreamLiveChannelItem } from './xtream-live-channel-navigation.service';

/**
 * Channels handed to a fullscreen player for zapping. The list travels in
 * an Android intent, so a category of ~600 channels is cut to a window
 * around the chosen one.
 */
export const MAX_LIVE_QUEUE = 200;

export function buildLiveQueue<T>(
    channels: readonly T[],
    chosen: number,
    toPlayback: (item: T) => ResolvedPortalPlayback,
    max = MAX_LIVE_QUEUE
): { queue: PortalLiveQueue; items: readonly T[] } {
    const start = Math.min(
        Math.max(chosen - Math.floor(max / 2), 0),
        Math.max(channels.length - max, 0)
    );
    const items = channels.slice(start, start + max);
    return {
        queue: { channels: items.map(toPlayback), index: chosen - start },
        items,
    };
}

export interface XtreamLiveQueueOptions {
    /** The chosen channel's playback, as the layout resolved it. */
    playback: ResolvedPortalPlayback;
    chosen: XtreamLiveChannelItem;
    /** The visible list the channel was chosen from. */
    channels: readonly XtreamLiveChannelItem[];
    streamUrl: (channel: XtreamLiveChannelItem) => string;
    /** Called when the player closes on a channel other than the chosen one. */
    leftOn: (channel: XtreamLiveChannelItem) => void;
}

/**
 * Plays the chosen channel with the visible list for zapping, when the
 * player takes a queue (the native shell's device player). Returns false
 * when it does not, so the caller opens the single channel as before.
 */
export function playXtreamLiveQueue(
    player: PortalPlayer,
    options: XtreamLiveQueueOptions
): boolean {
    if (!player.playLiveQueue) {
        return false;
    }
    const { playback, chosen, streamUrl, leftOn } = options;
    const isChosen = (channel: XtreamLiveChannelItem) =>
        channel.xtream_id === chosen.xtream_id;
    const listed = options.channels.findIndex(isChosen);
    const channels = listed >= 0 ? options.channels : [chosen];
    // The TS alternative belongs to the chosen channel only.
    const { liveAutoTsUrl: _chosenOnly, ...shared } = playback;
    const { queue, items } = buildLiveQueue(
        channels,
        Math.max(listed, 0),
        (channel): ResolvedPortalPlayback =>
            isChosen(channel)
                ? playback
                : {
                      ...shared,
                      streamUrl: streamUrl(channel),
                      title: channel.title ?? channel.name ?? '',
                      thumbnail:
                          channel.poster_url ?? channel.stream_icon ?? null,
                  }
    );
    void player.playLiveQueue(queue).then((closedAt) => {
        if (closedAt !== queue.index && items[closedAt]) {
            leftOn(items[closedAt]);
        }
    });
    return true;
}
