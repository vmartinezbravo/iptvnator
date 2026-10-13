package com.victor.iptvnator;

import android.view.KeyEvent;

/**
 * The remote's Menu key (≡) never reaches the WebView: Android keeps it for
 * the options menu. The app forwards its first press to the page as a
 * ContextMenu key on the focused element, which opens the TV options menu.
 */
final class MenuKey {

    static final int PASS = 0;
    static final int FORWARD = 1;
    static final int CONSUME = 2;

    static final String SCRIPT =
        "(function () {"
            + " var target = document.activeElement || document.body;"
            + " target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', code: 'ContextMenu', bubbles: true, cancelable: true }));"
            + "})();";

    private MenuKey() {}

    static int handle(int keyCode, int action, int repeatCount) {
        if (keyCode != KeyEvent.KEYCODE_MENU) {
            return PASS;
        }
        return action == KeyEvent.ACTION_DOWN && repeatCount == 0 ? FORWARD : CONSUME;
    }
}
