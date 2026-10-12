package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class NativePlayerEventsTest {

    @Test
    public void redactsEveryUrlInAnErrorMessage() {
        String message = "Response code: 404 for http://host:8080/live/user/pass/1.m3u8 via https://cdn/x?token=1";

        assertEquals("Response code: 404 for <url> via <url>", NativePlayerEvents.redactUrls(message));
    }

    @Test
    public void keepsMessagesWithoutUrlsAndNull() {
        assertEquals("Source error", NativePlayerEvents.redactUrls("Source error"));
        assertNull(NativePlayerEvents.redactUrls(null));
    }
}
