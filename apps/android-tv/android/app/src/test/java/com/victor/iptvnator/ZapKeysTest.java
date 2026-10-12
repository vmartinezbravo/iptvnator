package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;

import android.view.KeyEvent;
import org.junit.Test;

public class ZapKeysTest {

    @Test
    public void upAndChannelUpGoToTheNextChannel() {
        assertEquals(1, ZapKeys.step(KeyEvent.KEYCODE_DPAD_UP, true));
        assertEquals(1, ZapKeys.step(KeyEvent.KEYCODE_CHANNEL_UP, true));
        assertEquals(-1, ZapKeys.step(KeyEvent.KEYCODE_DPAD_DOWN, true));
        assertEquals(-1, ZapKeys.step(KeyEvent.KEYCODE_CHANNEL_DOWN, true));
        assertEquals(0, ZapKeys.step(KeyEvent.KEYCODE_DPAD_CENTER, true));
    }

    /** Final review #1: a key between Back and onDestroy must not reach a released player. */
    @Test
    public void ignoresZapKeysOnceThePlayerClosed() {
        assertEquals(0, ZapKeys.step(KeyEvent.KEYCODE_DPAD_UP, false));
        assertEquals(0, ZapKeys.step(KeyEvent.KEYCODE_CHANNEL_DOWN, false));
    }
}
