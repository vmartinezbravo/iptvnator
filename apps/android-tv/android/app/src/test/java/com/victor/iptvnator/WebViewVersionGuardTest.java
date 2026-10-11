package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WebViewVersionGuardTest {

    @Test
    public void majorOfReadsTheLeadingNumberOfAmazonVersions() {
        assertEquals(138, WebViewVersionGuard.majorOf("138.amazon-webview-v138-7204-tv.7204.244.304"));
    }

    @Test
    public void majorOfReadsPlainChromiumVersions() {
        assertEquals(99, WebViewVersionGuard.majorOf("99.0.4844.88"));
    }

    @Test
    public void majorOfReturnsMinusOneForGarbage() {
        assertEquals(-1, WebViewVersionGuard.majorOf("garbage"));
        assertEquals(-1, WebViewVersionGuard.majorOf(""));
        assertEquals(-1, WebViewVersionGuard.majorOf(null));
    }

    @Test
    public void isSupportedAcceptsVersionsAtOrAboveTheMinimum() {
        assertTrue(WebViewVersionGuard.isSupported("138.0", 120));
        assertTrue(WebViewVersionGuard.isSupported("120.0.1", 120));
    }

    @Test
    public void isSupportedRejectsOlderVersions() {
        assertFalse(WebViewVersionGuard.isSupported("99.0.4844", 120));
    }

    @Test
    public void isSupportedRejectsUnreadableVersions() {
        assertFalse(WebViewVersionGuard.isSupported("garbage", 120));
    }

    @Test
    public void minimumMatchesAngularBrowserSupport() {
        assertEquals(119, WebViewVersionGuard.MIN_WEBVIEW_MAJOR);
    }
}
