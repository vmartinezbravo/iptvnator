package com.victor.iptvnator;

import com.getcapacitor.JSObject;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Carries the player activity's events to the NativePlayer plugin, which
 * lives in the WebView's activity. Events sent while no plugin is attached
 * are dropped: nobody is listening then.
 */
final class NativePlayerEvents {

    private static final Pattern URL = Pattern.compile("[a-zA-Z][a-zA-Z0-9+.-]*://\\S+");

    private static volatile NativePlayerPlugin plugin;

    private NativePlayerEvents() {}

    static void attach(NativePlayerPlugin target) {
        plugin = target;
    }

    static void firstFrame(int index, long ms) {
        JSObject data = new JSObject();
        data.put("index", index);
        data.put("ms", ms);
        send("firstFrame", data);
    }

    static void audio(int index, String decoder, String encoding, boolean passthrough) {
        JSObject data = new JSObject();
        data.put("index", index);
        // A plain null would drop the key; passthrough has no decoder.
        data.put("decoder", decoder != null ? decoder : JSONObject.NULL);
        data.put("encoding", encoding);
        data.put("passthrough", passthrough);
        send("audio", data);
    }

    static void error(int index, String code, String message) {
        JSObject data = new JSObject();
        data.put("index", index);
        data.put("code", code);
        data.put("message", redactUrls(message));
        send("error", data);
    }

    static void closed(int index, long positionMs) {
        JSObject data = new JSObject();
        data.put("index", index);
        data.put("positionMs", positionMs);
        send("closed", data);
    }

    /** Stream URLs carry the provider's credentials; never let one out. */
    static String redactUrls(String message) {
        return message == null ? null : URL.matcher(message).replaceAll("<url>");
    }

    private static void send(String event, JSObject data) {
        NativePlayerPlugin target = plugin;
        if (target != null) {
            target.emit(event, data);
        }
    }
}
