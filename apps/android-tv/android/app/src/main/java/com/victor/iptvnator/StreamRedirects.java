package com.victor.iptvnator;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Resolves a stream URL's redirects before handing it to an external player.
 *
 * Some Xtream panels answer non-browser clients (VLC, Java, ExoPlayer) with a
 * malformed scheme-relative redirect, {@code Location: //https://host/...},
 * which those clients read as a host called "https". Asked with the
 * WebView's browser User-Agent they redirect properly. Only status and
 * headers are read, never the body, so a movie is not downloaded here.
 */
final class StreamRedirects {

    private static final Pattern DOUBLE_SCHEME = Pattern.compile("^//(https?://.+)$", Pattern.CASE_INSENSITIVE);
    private static final int TIMEOUT_MS = 5000;

    static final class Response {
        final int status;
        final String location;

        Response(int status, String location) {
            this.status = status;
            this.location = location;
        }
    }

    interface Opener {
        Response open(String url, String userAgent) throws IOException;
    }

    private StreamRedirects() {}

    /** Absolute target of a Location header, repairing {@code //https://...}. */
    static String normalizeLocation(String base, String location) {
        if (location == null || location.trim().isEmpty()) {
            return null;
        }
        String trimmed = location.trim();
        Matcher doubled = DOUBLE_SCHEME.matcher(trimmed);
        if (doubled.matches()) {
            return doubled.group(1);
        }
        try {
            return new URL(new URL(base), trimmed).toString();
        } catch (MalformedURLException error) {
            return null;
        }
    }

    /**
     * The URL after at most {@code maxHops} redirects. Any network failure
     * keeps the last URL reached, so the player still gets something to try.
     */
    static String resolve(String url, String userAgent, Opener opener, int maxHops) {
        String current = url;
        for (int hop = 0; hop < maxHops; hop++) {
            Response response;
            try {
                response = opener.open(current, userAgent);
            } catch (IOException error) {
                return current;
            }
            if (response.status < 300 || response.status >= 400) {
                return current;
            }
            String next = normalizeLocation(current, response.location);
            if (next == null) {
                return current;
            }
            current = next;
        }
        return current;
    }

    /** HLS playlists are told by the path; resolved URLs carry a query. */
    static boolean isHls(String url) {
        try {
            String path = new URI(url).getPath();
            return path != null && path.toLowerCase(Locale.ROOT).endsWith(".m3u8");
        } catch (URISyntaxException error) {
            return false;
        }
    }

    /** The real network: one request per hop, redirects not followed. */
    static final Opener HTTP = (url, userAgent) -> {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            if (userAgent != null) {
                connection.setRequestProperty("User-Agent", userAgent);
            }
            return new Response(connection.getResponseCode(), connection.getHeaderField("Location"));
        } finally {
            connection.disconnect();
        }
    };
}
