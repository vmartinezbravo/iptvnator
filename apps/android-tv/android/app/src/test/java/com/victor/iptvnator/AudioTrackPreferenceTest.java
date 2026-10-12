package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import androidx.media3.common.C;
import org.junit.Test;

public class AudioTrackPreferenceTest {

    private static final int MAIN = C.ROLE_FLAG_MAIN;
    private static final int DESCRIPTION = C.ROLE_FLAG_DESCRIBES_VIDEO;

    @Test
    public void prefersTheDeviceLanguage() {
        assertEquals(1, AudioTrackPreference.choose(new String[] { "en", "es", "fr" }, new int[] { MAIN, 0, 0 }, "es"));
    }

    @Test
    public void matchesARegionalVariantOfTheDeviceLanguage() {
        assertEquals(1, AudioTrackPreference.choose(new String[] { "en", "es-ES" }, new int[] { 0, 0 }, "es"));
    }

    @Test
    public void skipsAnAudioDescriptionInTheDeviceLanguage() {
        assertEquals(
            2,
            AudioTrackPreference.choose(new String[] { "es", "en", "es" }, new int[] { DESCRIPTION, 0, MAIN }, "es")
        );
    }

    @Test
    public void fallsBackToTheFirstTrackWithoutDescription() {
        assertEquals(
            1,
            AudioTrackPreference.choose(new String[] { "es", null, "en" }, new int[] { DESCRIPTION, 0, 0 }, "es")
        );
        assertEquals(0, AudioTrackPreference.choose(new String[] { null, null }, new int[] { 0, 0 }, "es"));
    }

    @Test
    public void fallsBackToTheFirstTrackWhenAllAreDescriptions() {
        assertEquals(
            0,
            AudioTrackPreference.choose(new String[] { "en", "es" }, new int[] { DESCRIPTION, DESCRIPTION | MAIN }, "es")
        );
    }

    @Test
    public void rejectsEmptyOrMismatchedLists() {
        assertThrows(IllegalArgumentException.class, () -> AudioTrackPreference.choose(new String[0], new int[0], "es"));
        assertThrows(
            IllegalArgumentException.class,
            () -> AudioTrackPreference.choose(new String[] { "es" }, new int[] { 0, 0 }, "es")
        );
    }
}
