package com.victor.iptvnator;

/**
 * Which apps that claim ACTION_VIEW "video/*" are real players. Fire OS ships
 * com.amazon.dummy.gallery, which accepts any video and closes at once, so
 * without this filter "Abrir en VLC" would report success with nothing open.
 */
final class ExternalPlayerHandlers {

    private static final String[] PLACEHOLDER_PACKAGE_PREFIXES = {
        "com.amazon.dummy.",
    };

    private ExternalPlayerHandlers() {}

    static boolean isPlaceholder(String packageName) {
        if (packageName == null || packageName.isEmpty()) {
            return true;
        }
        for (String prefix : PLACEHOLDER_PACKAGE_PREFIXES) {
            if (packageName.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}
