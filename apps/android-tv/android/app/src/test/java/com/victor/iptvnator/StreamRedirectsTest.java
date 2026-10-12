package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public class StreamRedirectsTest {

    private static final String UA = "Mozilla/5.0 (Linux; Android 9) WebView";

    /** Fake network: url -> {status, location}. Records the agents sent. */
    private static final class FakeOpener implements StreamRedirects.Opener {
        final Map<String, StreamRedirects.Response> answers = new HashMap<>();
        final List<String> agents = new ArrayList<>();

        @Override
        public StreamRedirects.Response open(String url, String userAgent) throws IOException {
            agents.add(userAgent);
            StreamRedirects.Response response = answers.get(url);
            if (response == null) throw new IOException("unreachable " + url);
            return response;
        }
    }

    @Test
    public void normalizesTheProvidersSchemeRelativeAbsoluteLocation() {
        assertEquals(
            "https://cdn.example/live/1.m3u8",
            StreamRedirects.normalizeLocation("http://panel.example:8080/live/u/p/1.m3u8", "//https://cdn.example/live/1.m3u8")
        );
        assertEquals(
            "http://10.0.0.1:80/hls/1.m3u8",
            StreamRedirects.normalizeLocation("http://panel.example/live/1.m3u8", "//http://10.0.0.1:80/hls/1.m3u8")
        );
    }

    @Test
    public void resolvesRelativeAndSchemeRelativeLocationsAgainstTheBase() {
        assertEquals(
            "http://panel.example:8080/hls/1.m3u8",
            StreamRedirects.normalizeLocation("http://panel.example:8080/live/u/p/1.m3u8", "/hls/1.m3u8")
        );
        assertEquals(
            "http://cdn.example/hls/1.m3u8",
            StreamRedirects.normalizeLocation("http://panel.example/live/1.m3u8", "//cdn.example/hls/1.m3u8")
        );
        assertNull(StreamRedirects.normalizeLocation("http://panel.example/", ""));
    }

    @Test
    public void followsRedirectsWithTheGivenAgentUntilANonRedirect() {
        FakeOpener opener = new FakeOpener();
        opener.answers.put("http://panel.example/live/1.m3u8", new StreamRedirects.Response(302, "//https://lb.example/x"));
        opener.answers.put("https://lb.example/x", new StreamRedirects.Response(301, "http://10.0.0.1/hls/1.m3u8?t=abc"));
        opener.answers.put("http://10.0.0.1/hls/1.m3u8?t=abc", new StreamRedirects.Response(200, null));

        String resolved = StreamRedirects.resolve("http://panel.example/live/1.m3u8", UA, opener, 5);

        assertEquals("http://10.0.0.1/hls/1.m3u8?t=abc", resolved);
        assertEquals(3, opener.agents.size());
        assertEquals(UA, opener.agents.get(0));
    }

    @Test
    public void keepsTheOriginalUrlWhenTheNetworkFails() {
        FakeOpener opener = new FakeOpener();

        assertEquals("http://panel.example/live/1.m3u8", StreamRedirects.resolve("http://panel.example/live/1.m3u8", UA, opener, 5));
    }

    @Test
    public void stopsAfterTheHopLimitWithTheLastLocation() {
        FakeOpener opener = new FakeOpener();
        opener.answers.put("http://a.example/", new StreamRedirects.Response(302, "http://b.example/"));
        opener.answers.put("http://b.example/", new StreamRedirects.Response(302, "http://a.example/"));

        assertEquals("http://a.example/", StreamRedirects.resolve("http://a.example/", UA, opener, 2));
        assertEquals(2, opener.agents.size());
    }

    @Test
    public void detectsHlsByThePathEvenWithAQuery() {
        assertTrue(StreamRedirects.isHls("http://1.2.3.4:80/hls/abc/index.m3u8?token=x"));
        assertTrue(StreamRedirects.isHls("https://host/live/u/p/1.M3U8"));
        assertFalse(StreamRedirects.isHls("http://host/live/u/p/1.ts?m3u8=1"));
        assertFalse(StreamRedirects.isHls("http://host/movie/u/p/46966.mkv"));
        assertFalse(StreamRedirects.isHls("not a url"));
    }
}
