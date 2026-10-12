package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;

import androidx.media3.common.C;
import org.junit.Test;

public class PlaybackProgressTest {

    @Test
    public void mapsAnUnsetDurationToMinusOne() {
        assertEquals(-1, PlaybackProgress.durationMs(C.TIME_UNSET));
        assertEquals(-1, PlaybackProgress.durationMs(-5));
    }

    @Test
    public void keepsAKnownDuration() {
        assertEquals(5_400_000, PlaybackProgress.durationMs(5_400_000));
        assertEquals(0, PlaybackProgress.durationMs(0));
    }

    /** Final review #4: a movie that ends without a known duration still counts as watched. */
    @Test
    public void endsAtTheDurationOrAtThePositionWhenItIsUnknown() {
        assertEquals(5_400_000, PlaybackProgress.endPositionMs(5_399_000, 5_400_000));
        assertEquals(5_399_000, PlaybackProgress.endPositionMs(5_399_000, C.TIME_UNSET));
    }
}
