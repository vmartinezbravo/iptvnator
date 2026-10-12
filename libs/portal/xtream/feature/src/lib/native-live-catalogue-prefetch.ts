import { DataService, RuntimeCapabilitiesService } from '@iptvnator/services';
import { XtreamPlaylistData } from '@iptvnator/portal/xtream/data-access';
import { XTREAM_PREFETCH_LIVE_CATALOGUE } from '@iptvnator/shared/interfaces';

/**
 * Native shell (Fire TV): lets the transport start the import's first
 * requests (categories, live channels) while the portal status is checked.
 * Sent only for the source being opened, never for status checks of others.
 */
export function prefetchNativeLiveCatalogue(
    runtime: RuntimeCapabilitiesService,
    dataService: DataService,
    playlist: XtreamPlaylistData | null
): void {
    if (!runtime.isNativeShell || !playlist) {
        return;
    }
    void dataService.sendIpcEvent(XTREAM_PREFETCH_LIVE_CATALOGUE, {
        url: playlist.serverUrl,
        username: playlist.username,
        password: playlist.password,
    });
}
