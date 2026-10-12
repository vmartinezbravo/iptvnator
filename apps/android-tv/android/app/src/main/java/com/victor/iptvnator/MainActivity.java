package com.victor.iptvnator;

import android.content.pm.PackageInfo;
import android.os.Bundle;
import androidx.appcompat.app.AlertDialog;
import androidx.webkit.WebViewCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExternalPlayerPlugin.class);
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
        warnIfWebViewTooOld();
    }

    /**
     * A WebView older than the web build needs renders a blank screen, so
     * tell the user what to update instead. An unreadable version is let
     * through: blocking a device that may work is worse than a blank page.
     */
    private void warnIfWebViewTooOld() {
        PackageInfo webView = WebViewCompat.getCurrentWebViewPackage(this);
        String version = webView != null ? webView.versionName : null;
        if (WebViewVersionGuard.majorOf(version) < 0
            || WebViewVersionGuard.isSupported(version, WebViewVersionGuard.MIN_WEBVIEW_MAJOR)) {
            return;
        }
        new AlertDialog.Builder(this)
            .setMessage(getString(R.string.webview_too_old, version))
            .setCancelable(false)
            .setPositiveButton(R.string.webview_too_old_exit, (dialog, which) -> finishAndRemoveTask())
            .show();
    }
}
