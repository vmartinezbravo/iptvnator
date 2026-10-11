package com.victor.iptvnator;

/** Reads the Chromium major version of the system WebView and checks it. */
public final class WebViewVersionGuard {

    /**
     * Oldest Chromium the web build supports. Angular 22 targets Baseline
     * "widely available"; @angular/build 22.1.8 resolves it with
     * BASELINE_DATE 2026-05-07 to Chrome 119 and later
     * (node_modules/@angular/build/src/utils/supported-browsers.js,
     * https://angular.dev/reference/versions#browser-support).
     * Recheck when Angular is upgraded.
     */
    public static final int MIN_WEBVIEW_MAJOR = 119;

    private WebViewVersionGuard() {}

    /** Number before the first dot ("138.amazon-webview-…" → 138), or -1. */
    public static int majorOf(String versionName) {
        if (versionName == null) {
            return -1;
        }
        int dot = versionName.indexOf('.');
        String head = dot >= 0 ? versionName.substring(0, dot) : versionName;
        try {
            return Integer.parseInt(head.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    public static boolean isSupported(String versionName, int minMajor) {
        return majorOf(versionName) >= minMajor;
    }
}
