package com.victor.iptvnator;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.webkit.WebSettings;
import java.util.ArrayList;
import java.util.List;

/**
 * Hands a stream URL to a player app of the device (VLC on Fire TV) with an
 * ACTION_VIEW "video/*" intent, skipping Fire OS's placeholder handler.
 * Shared by the ExternalPlayer plugin and the native player's error screen.
 */
final class ExternalPlayerLauncher {

    private static final int MAX_REDIRECTS = 5;

    private ExternalPlayerLauncher() {}

    /**
     * Blocks on the redirect requests: call it off the main thread.
     *
     * @return false when no installed player can open the stream
     */
    static boolean open(Activity activity, String url, String title) {
        // The browser agent gets this provider's proper redirect.
        String playableUrl = StreamRedirects.resolve(
            url,
            WebSettings.getDefaultUserAgent(activity),
            StreamRedirects.HTTP,
            MAX_REDIRECTS
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(Uri.parse(playableUrl), "video/*");
        if (title != null && !title.isEmpty()) {
            intent.putExtra("title", title);
        }

        List<ResolveInfo> handlers = activity.getPackageManager().queryIntentActivities(
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
        if (players == 0) {
            return false;
        }
        Intent chooser = Intent.createChooser(intent, title);
        chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, placeholders.toArray(new ComponentName[0]));
        try {
            activity.startActivity(chooser);
            return true;
        } catch (ActivityNotFoundException error) {
            return false;
        }
    }
}
