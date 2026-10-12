package com.victor.iptvnator;

/**
 * Where a movie or an episode stands, as the web side stores it: the
 * activity reports it every {@link #INTERVAL_MS} and once more on close.
 */
final class PlaybackProgress {

    /** A process killed by low memory loses at most this much position. */
    static final long INTERVAL_MS = 30_000;

    private PlaybackProgress() {}

    /** Media3 says C.TIME_UNSET (a negative number) while it does not know. */
    static long durationMs(long media3Duration) {
        return media3Duration < 0 ? -1 : media3Duration;
    }

    /** Where a finished movie ends: its duration, or the position when that is unknown. */
    static long endPositionMs(long positionMs, long media3Duration) {
        return media3Duration < 0 ? positionMs : media3Duration;
    }
}
