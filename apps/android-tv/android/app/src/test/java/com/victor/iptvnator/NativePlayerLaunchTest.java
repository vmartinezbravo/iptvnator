package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import androidx.media3.common.util.Log;
import org.junit.Test;

public class NativePlayerLaunchTest {

    @Test
    public void playsAFreshLaunch() {
        assertTrue(NativePlayerLaunch.shouldPlay(false, 0));
        assertTrue(NativePlayerLaunch.shouldPlay(false, Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    /** Review Focus 4: after a low-memory kill nobody listens to the old list. */
    @Test
    public void doesNotReplayARestoredLaunch() {
        assertFalse(NativePlayerLaunch.shouldPlay(true, 0));
    }

    @Test
    public void doesNotReplayALaunchFromRecents() {
        assertFalse(NativePlayerLaunch.shouldPlay(false, Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY));
        assertFalse(
            NativePlayerLaunch.shouldPlay(false, Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY | Intent.FLAG_ACTIVITY_NEW_TASK)
        );
    }

    @Test
    public void silencesMedia3Logs() {
        Log.setLogLevel(Log.LOG_LEVEL_ALL);

        NativePlayerLaunch.silenceMedia3Logs();

        assertEquals(Log.LOG_LEVEL_OFF, Log.getLogLevel());
    }
}
