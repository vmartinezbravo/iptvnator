import type { CapacitorConfig } from '@capacitor/cli';

// androidScheme and cleartext are fixed from the first APK: changing the
// scheme changes the WebView origin and wipes IndexedDB and localStorage.
// CapacitorHttp stays disabled globally; Xtream calls use it explicitly.
const config: CapacitorConfig = {
    appId: 'com.victor.iptvnator',
    appName: 'IPTVnator',
    webDir: '../../dist/apps/web-android',
    server: { androidScheme: 'http', cleartext: true },
    plugins: { CapacitorHttp: { enabled: false } },
};

export default config;
