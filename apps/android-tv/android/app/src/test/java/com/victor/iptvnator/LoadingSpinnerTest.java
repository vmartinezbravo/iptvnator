package com.victor.iptvnator;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.media3.common.Player;
import org.junit.Test;

public class LoadingSpinnerTest {

    @Test
    public void spinsFromTheStartOrZapUntilTheFirstFrame() {
        // Before prepare (redirects still resolving) the player is idle.
        assertTrue(LoadingSpinner.visible(false, Player.STATE_IDLE, false));
        assertTrue(LoadingSpinner.visible(false, Player.STATE_BUFFERING, false));
        assertTrue(LoadingSpinner.visible(false, Player.STATE_READY, false));
    }

    @Test
    public void spinsAgainWhilePlaybackRebuffers() {
        assertTrue(LoadingSpinner.visible(true, Player.STATE_BUFFERING, false));
        assertFalse(LoadingSpinner.visible(true, Player.STATE_READY, false));
    }

    @Test
    public void givesWayToTheErrorScreen() {
        assertFalse(LoadingSpinner.visible(false, Player.STATE_IDLE, true));
        assertFalse(LoadingSpinner.visible(true, Player.STATE_BUFFERING, true));
    }
}
