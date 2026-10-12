package com.victor.iptvnator;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands a stream URL to a player app of the device (VLC on Fire TV) with an
 * ACTION_VIEW "video/*" intent. Resolves { launched: false } when no
 * installed player can open it, so the web side can suggest installing VLC.
 */
@CapacitorPlugin(name = "ExternalPlayer")
public class ExternalPlayerPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        // Plugin calls run off the main thread, so the redirect requests may
        // block here.
        JSObject result = new JSObject();
        result.put("launched", ExternalPlayerLauncher.open(getActivity(), url, call.getString("title")));
        call.resolve(result);
    }
}
