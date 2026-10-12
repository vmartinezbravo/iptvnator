package com.victor.iptvnator;

import android.view.KeyEvent;

/** The remote's channel keys in the native player's live lists. */
final class ZapKeys {

    private ZapKeys() {}

    /**
     * +1 for the next channel, -1 for the previous one, 0 for any other key
     * or once the player is closed: Fire OS keeps the activity (and its keys)
     * for 1-3 s after Back, while the player is already released.
     */
    static int step(int keyCode, boolean playerOpen) {
        if (!playerOpen) {
            return 0;
        }
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_CHANNEL_UP:
                return 1;
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                return -1;
            default:
                return 0;
        }
    }
}
