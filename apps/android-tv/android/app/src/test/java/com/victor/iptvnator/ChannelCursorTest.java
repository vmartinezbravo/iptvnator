package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public class ChannelCursorTest {

    @Test
    public void nextWrapsToTheFirstChannel() {
        ChannelCursor cursor = new ChannelCursor(3, 1);

        assertEquals(2, cursor.next());
        assertEquals(0, cursor.next());
        assertEquals(0, cursor.index());
    }

    @Test
    public void previousWrapsToTheLastChannel() {
        ChannelCursor cursor = new ChannelCursor(3, 1);

        assertEquals(0, cursor.previous());
        assertEquals(2, cursor.previous());
        assertEquals(2, cursor.index());
    }

    @Test
    public void rejectsAnEmptyListOrAnIndexOutOfRange() {
        assertThrows(IllegalArgumentException.class, () -> new ChannelCursor(0, 0));
        assertThrows(IllegalArgumentException.class, () -> new ChannelCursor(3, -1));
        assertThrows(IllegalArgumentException.class, () -> new ChannelCursor(3, 3));
    }
}
