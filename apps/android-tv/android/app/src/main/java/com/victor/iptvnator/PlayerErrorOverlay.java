package com.victor.iptvnator;

import android.view.KeyEvent;
import android.view.View;
import android.widget.TextView;

/**
 * The native player's error line: shown when a stream fails, it offers VLC
 * on OK. Zapping hides it again.
 */
final class PlayerErrorOverlay {

    private final TextView view;

    PlayerErrorOverlay(TextView view) {
        this.view = view;
    }

    static boolean isConfirmKey(int keyCode) {
        return (
            keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
            keyCode == KeyEvent.KEYCODE_ENTER ||
            keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER
        );
    }

    boolean isShown() {
        return view.getVisibility() == View.VISIBLE;
    }

    void showPlaybackError() {
        show(R.string.native_player_error);
    }

    void showNoExternalPlayer() {
        show(R.string.native_player_no_external);
    }

    void hide() {
        view.setVisibility(View.GONE);
    }

    private void show(int text) {
        view.setText(text);
        view.setVisibility(View.VISIBLE);
    }
}
