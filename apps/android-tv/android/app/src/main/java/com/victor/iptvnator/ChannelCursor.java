package com.victor.iptvnator;

/**
 * Position in the native player's channel list. Zapping past either end
 * wraps around, like a TV's channel up/down keys.
 */
final class ChannelCursor {

    private final int size;
    private int index;

    ChannelCursor(int size, int index) {
        if (size < 1) {
            throw new IllegalArgumentException("size must be at least 1");
        }
        if (index < 0 || index >= size) {
            throw new IllegalArgumentException("index " + index + " is outside 0.." + (size - 1));
        }
        this.size = size;
        this.index = index;
    }

    int index() {
        return index;
    }

    int next() {
        index = (index + 1) % size;
        return index;
    }

    int previous() {
        index = (index - 1 + size) % size;
        return index;
    }
}
