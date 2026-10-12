package com.victor.iptvnator;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.SystemClock;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import org.json.JSONObject;

/**
 * Plays a list of streams in a fullscreen Media3 activity, starting at
 * {@code index}. The activity reports back through this plugin's events:
 * firstFrame, audio, error and closed. They carry indexes and names, never
 * stream URLs, because those hold the provider's credentials.
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    static final String EXTRA_URLS = "com.victor.iptvnator.urls";
    static final String EXTRA_TITLES = "com.victor.iptvnator.titles";
    static final String EXTRA_INDEX = "com.victor.iptvnator.index";
    static final String EXTRA_IS_LIVE = "com.victor.iptvnator.isLive";
    static final String EXTRA_START_POSITION_MS = "com.victor.iptvnator.startPositionMs";
    static final String EXTRA_AUDIO_MODE = "com.victor.iptvnator.audioMode";
    /** {@link SystemClock#elapsedRealtime()} when JS asked to play. */
    static final String EXTRA_REQUESTED_AT = "com.victor.iptvnator.requestedAt";

    @Override
    public void load() {
        NativePlayerLaunch.silenceMedia3Logs();
        NativePlayerEvents.attach(this);
    }

    /** Called by {@link NativePlayerEvents}; the activity runs elsewhere. */
    void emit(String event, JSObject data) {
        notifyListeners(event, data);
    }

    @PluginMethod
    public void play(PluginCall call) {
        long requestedAt = SystemClock.elapsedRealtime();
        JSArray items = call.getArray("items");
        if (items == null || items.length() == 0) {
            call.reject("items is required");
            return;
        }
        ArrayList<String> urls = new ArrayList<>();
        ArrayList<String> titles = new ArrayList<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            String url = item != null ? item.optString("url", "") : "";
            if (url.isEmpty()) {
                call.reject("items[" + i + "].url is required");
                return;
            }
            urls.add(url);
            titles.add(item.optString("title", ""));
        }
        JSObject data = call.getData();
        int index = data.optInt("index", 0);
        if (index < 0 || index >= urls.size()) {
            call.reject("index is out of range");
            return;
        }

        Intent intent = new Intent(getContext(), NativePlayerActivity.class);
        intent.putStringArrayListExtra(EXTRA_URLS, urls);
        intent.putStringArrayListExtra(EXTRA_TITLES, titles);
        intent.putExtra(EXTRA_INDEX, index);
        intent.putExtra(EXTRA_IS_LIVE, data.optBoolean("isLive", false));
        intent.putExtra(EXTRA_START_POSITION_MS, data.optLong("startPositionMs", 0));
        intent.putExtra(EXTRA_AUDIO_MODE, "pcm".equals(data.optString("audioMode")) ? "pcm" : "auto");
        intent.putExtra(EXTRA_REQUESTED_AT, requestedAt);
        try {
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException error) {
            call.reject("native player is not available");
            return;
        }
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }
}
