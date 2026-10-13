package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.ArrayList;
import java.util.Arrays;
import org.junit.Test;

public class PlayerTitleTest {

    @Test
    public void readsTheLineOfTheItemOnScreen() {
        ArrayList<String> titles = new ArrayList<>(Arrays.asList("La 1", "La 2"));

        assertEquals("La 2", PlayerTitle.at(titles, 1));
    }

    @Test
    public void hasNoLineForAnEmptyTitleOrAMissingItem() {
        ArrayList<String> titles = new ArrayList<>(Arrays.asList("", "La 2"));

        assertNull(PlayerTitle.at(titles, 0));
        assertNull(PlayerTitle.at(titles, 2));
        assertNull(PlayerTitle.at(null, 0));
    }

    @Test
    public void liveChannelsShowTheirNameForAFewSecondsAfterEachStart() {
        assertEquals(5000, PlayerTitle.LIVE_BANNER_MS);
    }
}
