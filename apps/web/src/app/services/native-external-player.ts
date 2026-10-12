import { InjectionToken } from '@angular/core';
import { registerPlugin } from '@capacitor/core';

interface ExternalPlayerPlugin {
    open(options: { url: string; title?: string }): Promise<{
        launched: boolean;
    }>;
}

/** Android: `ExternalPlayerPlugin.java` (an ACTION_VIEW `video/*` intent). */
const ExternalPlayer = registerPlugin<ExternalPlayerPlugin>('ExternalPlayer');

/**
 * Hands a stream to a player app of the device (VLC on Fire TV). Resolves
 * false when no installed app can open it. Platform-neutral on purpose: an
 * iOS shell would implement the same plugin name.
 */
export async function openInNativeExternalPlayer(
    url: string,
    title?: string
): Promise<boolean> {
    const { launched } = await ExternalPlayer.open(
        title ? { url, title } : { url }
    );
    return launched;
}

export const NATIVE_EXTERNAL_PLAYER = new InjectionToken<
    typeof openInNativeExternalPlayer
>('NATIVE_EXTERNAL_PLAYER', {
    providedIn: 'root',
    factory: () => openInNativeExternalPlayer,
});
