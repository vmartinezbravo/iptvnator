package com.victor.iptvnator;

import androidx.media3.common.Player;

/**
 * When the player shows its loading spinner: from each start or zap until
 * the first frame (a channel takes 3-4 s, and Media3's own spinner only
 * appears once the stream is prepared, after its redirects resolve), and
 * again while playback rebuffers. The error screen replaces it.
 */
final class LoadingSpinner {

    private LoadingSpinner() {}

    static boolean visible(boolean firstFrameSeen, int playbackState, boolean errorShown) {
        if (errorShown) {
            return false;
        }
        return !firstFrameSeen || playbackState == Player.STATE_BUFFERING;
    }
}
