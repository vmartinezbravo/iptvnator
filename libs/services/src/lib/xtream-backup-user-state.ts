import { InjectionToken } from '@angular/core';
import type { XtreamBackupUserState } from '@iptvnator/shared/interfaces';

/** The per-playlist user state a backup carries for an Xtream source. */
export type XtreamBackupUserStateSnapshot = Pick<
    XtreamBackupUserState,
    'favorites' | 'recentlyViewed' | 'playbackPositions'
>;

/**
 * Reads an Xtream source's user state where there is no Electron database
 * (PWA, native shell). Without it a backup would claim the source had no
 * favorites, recent items or positions.
 */
export interface XtreamBackupUserStateReader {
    read(playlistId: string): XtreamBackupUserStateSnapshot;
}

export const XTREAM_BACKUP_USER_STATE =
    new InjectionToken<XtreamBackupUserStateReader>('XTREAM_BACKUP_USER_STATE');
