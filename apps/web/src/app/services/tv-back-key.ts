import type { AppPlugin } from '@capacitor/app';
import { RuntimeCapabilitiesService } from '@iptvnator/services';

/**
 * Sends the remote's Back key to `handleBack` on the native shell. With a
 * `backButton` listener, Capacitor no longer goes back or exits by itself.
 * Desktop and the PWA never load @capacitor/app.
 */
export async function registerTvBackKey(
    runtime: RuntimeCapabilitiesService,
    handleBack: () => unknown,
    loadApp: () => Promise<{ App: Pick<AppPlugin, 'addListener'> }> = () =>
        import('@capacitor/app')
): Promise<void> {
    if (!runtime.isNativeShell) return;
    const { App } = await loadApp();
    await App.addListener('backButton', () => void handleBack());
}
