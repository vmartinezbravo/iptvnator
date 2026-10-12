package com.victor.iptvnator;

import android.content.Intent;
import androidx.media3.common.util.Log;

/** What the native player may do when Android creates it. */
final class NativePlayerLaunch {

    private NativePlayerLaunch() {}

    /**
     * Only a fresh launch from the WebView plays. Android may recreate the
     * player after a low-memory kill (saved state) or from Recents (the old
     * intent): the list is stale then and no plugin listens to its events.
     */
    static boolean shouldPlay(boolean restored, int intentFlags) {
        return !restored && (intentFlags & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0;
    }

    /** Media3's error messages may quote the provider's server. */
    static void silenceMedia3Logs() {
        Log.setLogLevel(Log.LOG_LEVEL_OFF);
    }
}
