package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.view.KeyEvent;
import org.junit.Test;

public class MenuKeyTest {

    @Test
    public void forwardsTheFirstPressOfTheMenuKeyToThePage() {
        assertEquals(MenuKey.FORWARD, MenuKey.handle(KeyEvent.KEYCODE_MENU, KeyEvent.ACTION_DOWN, 0));
    }

    @Test
    public void swallowsItsRepeatsAndRelease() {
        assertEquals(MenuKey.CONSUME, MenuKey.handle(KeyEvent.KEYCODE_MENU, KeyEvent.ACTION_DOWN, 1));
        assertEquals(MenuKey.CONSUME, MenuKey.handle(KeyEvent.KEYCODE_MENU, KeyEvent.ACTION_UP, 0));
    }

    @Test
    public void leavesOtherKeysToTheWebView() {
        assertEquals(MenuKey.PASS, MenuKey.handle(KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.ACTION_DOWN, 0));
        assertEquals(MenuKey.PASS, MenuKey.handle(KeyEvent.KEYCODE_BACK, KeyEvent.ACTION_DOWN, 0));
    }

    @Test
    public void thePageReceivesAContextMenuKeyOnTheFocusedElement() {
        assertTrue(MenuKey.SCRIPT.contains("document.activeElement"));
        assertTrue(MenuKey.SCRIPT.contains("key: 'ContextMenu'"));
    }
}
