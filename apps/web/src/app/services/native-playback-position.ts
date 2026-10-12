import {
    PlaybackPositionData,
    PlayerContentInfo,
} from '@iptvnator/shared/interfaces';

/**
 * The position the device player reports, as the app stores it. Nothing at
 * the very start (a close before the first frame must not erase a saved
 * position); a negative duration means the player did not know it.
 */
export function toPlaybackPosition(
    contentInfo: PlayerContentInfo,
    positionMs: number,
    durationMs: number
): PlaybackPositionData | null {
    if (!(positionMs > 0)) {
        return null;
    }
    return {
        ...contentInfo,
        positionSeconds: Math.floor(positionMs / 1000),
        ...(durationMs >= 0
            ? { durationSeconds: Math.floor(durationMs / 1000) }
            : {}),
        updatedAt: new Date().toISOString(),
    };
}
