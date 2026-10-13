package com.victor.iptvnator;

import java.util.List;

/**
 * The lines the player shows at the top of the screen: what is on screen.
 * Movies and episodes show them with the playback controls; live channels
 * have no controls, so their name shows for a few seconds after each start
 * and each zap.
 */
final class PlayerTitle {

    static final long LIVE_BANNER_MS = 5000;

    private PlayerTitle() {}

    /** The line of the item at {@code index}, or null when it has none. */
    static String at(List<String> lines, int index) {
        if (lines == null || index < 0 || index >= lines.size()) {
            return null;
        }
        String line = lines.get(index);
        return line == null || line.isEmpty() ? null : line;
    }
}
