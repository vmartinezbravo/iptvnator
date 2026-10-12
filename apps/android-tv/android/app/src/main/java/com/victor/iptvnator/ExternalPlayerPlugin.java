package com.victor.iptvnator;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

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
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(Uri.parse(url), "video/*");
        String title = call.getString("title");
        if (title != null && !title.isEmpty()) {
            intent.putExtra("title", title);
        }

        List<ResolveInfo> handlers = getContext().getPackageManager().queryIntentActivities(
            intent,
            PackageManager.MATCH_DEFAULT_ONLY
        );
        ArrayList<ComponentName> placeholders = new ArrayList<>();
        int players = 0;
        for (ResolveInfo handler : handlers) {
            String packageName = handler.activityInfo.packageName;
            if (ExternalPlayerHandlers.isPlaceholder(packageName)) {
                placeholders.add(new ComponentName(packageName, handler.activityInfo.name));
            } else {
                players++;
            }
        }

        JSObject result = new JSObject();
        if (players == 0) {
            result.put("launched", false);
            call.resolve(result);
            return;
        }
        Intent chooser = Intent.createChooser(intent, title);
        chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, placeholders.toArray(new ComponentName[0]));
        try {
            getActivity().startActivity(chooser);
            result.put("launched", true);
        } catch (ActivityNotFoundException error) {
            result.put("launched", false);
        }
        call.resolve(result);
    }
}
