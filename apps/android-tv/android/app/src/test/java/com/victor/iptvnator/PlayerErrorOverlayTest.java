package com.victor.iptvnator;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.view.KeyEvent;
import org.junit.Test;

public class PlayerErrorOverlayTest {

    @Test
    public void treatsOkAndEnterAsOpeningTheExternalPlayer() {
        assertTrue(PlayerErrorOverlay.isConfirmKey(KeyEvent.KEYCODE_DPAD_CENTER));
        assertTrue(PlayerErrorOverlay.isConfirmKey(KeyEvent.KEYCODE_ENTER));
        assertTrue(PlayerErrorOverlay.isConfirmKey(KeyEvent.KEYCODE_NUMPAD_ENTER));
    }

    @Test
    public void leavesZappingAndBackKeysAlone() {
        assertFalse(PlayerErrorOverlay.isConfirmKey(KeyEvent.KEYCODE_DPAD_UP));
        assertFalse(PlayerErrorOverlay.isConfirmKey(KeyEvent.KEYCODE_BACK));
    }
}
