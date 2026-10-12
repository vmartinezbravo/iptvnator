import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import type { XtreamBackupUserStateSnapshot } from '@iptvnator/services';
import {
    collectionKey,
    deduplicateRecentItems,
    typedCollectionRef,
    type CollectionKey,
    type StoredRecentItem,
} from './pwa-collection-identity';

/** The three localStorage collections the PWA keeps per playlist. */
export interface PwaUserStateStorage {
    favorites: Record<string, CollectionKey[]>;
    recent: Record<string, StoredRecentItem[]>;
    positions: Record<string, PlaybackPositionData[]>;
}

/**
 * The backup view of one playlist's PWA user state. Legacy untyped keys
 * (a bare id without `movie:`/`series:`/`live:`) cannot say which content
 * type they mean, so they stay out of the archive rather than guess.
 */
export function exportPwaUserState(
    playlistId: string,
    storage: PwaUserStateStorage
): XtreamBackupUserStateSnapshot {
    // No flatMap: the app build targets a library older than ES2019.
    const favorites: XtreamBackupUserStateSnapshot['favorites'] = [];
    for (const key of storage.favorites[playlistId] ?? []) {
        const ref = typedCollectionRef(key);
        if (ref) favorites.push({ xtreamId: ref.id, contentType: ref.type });
    }
    const recentlyViewed: XtreamBackupUserStateSnapshot['recentlyViewed'] = [];
    for (const item of storage.recent[playlistId] ?? []) {
        const ref = typedCollectionRef(item.id);
        if (ref) {
            recentlyViewed.push({
                xtreamId: ref.id,
                contentType: ref.type,
                viewedAt: item.viewedAt,
            });
        }
    }
    return {
        favorites,
        recentlyViewed,
        playbackPositions: [...(storage.positions[playlistId] ?? [])],
    };
}

const positionKey = (position: PlaybackPositionData) =>
    `${position.contentType}:${position.contentXtreamId}`;

const updatedAtMs = (position: PlaybackPositionData) =>
    Date.parse(position.updatedAt ?? '') || 0;

/**
 * Restore on the PWA adds what the backup holds and never removes: an empty
 * or partial backup (older PWA builds exported no user state at all) must
 * not wipe what the device has. Existing items keep their order; for the
 * same content the newer playback position wins.
 */
export function mergePwaRestoreState(
    playlistId: string,
    current: PwaUserStateStorage,
    backup: XtreamBackupUserStateSnapshot
): PwaUserStateStorage {
    const favorites = [...(current.favorites[playlistId] ?? [])];
    for (const item of backup.favorites) {
        const key = collectionKey({
            id: item.xtreamId,
            type: item.contentType,
        });
        if (key !== null && !favorites.includes(key)) favorites.push(key);
    }

    const backupRecent: StoredRecentItem[] = [];
    for (const item of backup.recentlyViewed) {
        const id = collectionKey({ id: item.xtreamId, type: item.contentType });
        if (id !== null) backupRecent.push({ id, viewedAt: item.viewedAt });
    }
    // Readers sort by viewedAt; storage keeps existing items first.
    const recent = deduplicateRecentItems([
        ...(current.recent[playlistId] ?? []),
        ...backupRecent,
    ]);

    const positions = new Map(
        (current.positions[playlistId] ?? []).map((p) => [positionKey(p), p])
    );
    for (const position of backup.playbackPositions) {
        const existing = positions.get(positionKey(position));
        if (!existing || updatedAtMs(position) > updatedAtMs(existing)) {
            positions.set(positionKey(position), {
                ...position,
                updatedAt: position.updatedAt ?? new Date().toISOString(),
            });
        }
    }

    return {
        favorites: { ...current.favorites, [playlistId]: favorites },
        recent: { ...current.recent, [playlistId]: recent },
        positions: {
            ...current.positions,
            [playlistId]: [...positions.values()],
        },
    };
}
