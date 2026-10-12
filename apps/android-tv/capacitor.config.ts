import type { CapacitorConfig } from '@capacitor/cli';

// androidScheme and cleartext are fixed from the first APK: changing the
// scheme changes the WebView origin and wipes IndexedDB and localStorage.
// CapacitorHttp stays disabled globally; Xtream calls use it explicitly.
// loggingBehavior 'none': debug builds otherwise copy every plugin call
// result (backup files, provider answers, credentials) and the console to
// logcat. Console marks are read over DevTools (tools/android/stick-startup.mjs).
const config: CapacitorConfig = {
    appId: 'com.victor.iptvnator',
    appName: 'IPTVnator',
    loggingBehavior: 'none',
    webDir: '../../dist/apps/web-android',
    server: { androidScheme: 'http', cleartext: true },
    plugins: { CapacitorHttp: { enabled: false } },
};

export default config;
