package com.victor.iptvnator;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ExternalPlayerHandlersTest {

    @Test
    public void treatsFireOsDummyGalleryAsAPlaceholder() {
        assertTrue(ExternalPlayerHandlers.isPlaceholder("com.amazon.dummy.gallery"));
    }

    @Test
    public void acceptsRealPlayerApps() {
        assertFalse(ExternalPlayerHandlers.isPlaceholder("org.videolan.vlc"));
        assertFalse(ExternalPlayerHandlers.isPlaceholder("com.mxtech.videoplayer.ad"));
    }

    @Test
    public void treatsAMissingPackageAsAPlaceholder() {
        assertTrue(ExternalPlayerHandlers.isPlaceholder(null));
        assertTrue(ExternalPlayerHandlers.isPlaceholder(""));
    }
}
