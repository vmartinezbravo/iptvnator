import { of } from 'rxjs';
import type {
    Playlist,
    PlaylistBackupManifestV1,
    XtreamPlaylistBackupEntry,
} from '@iptvnator/shared/interfaces';
import { createPlaylistBackupService } from './playlist-backup.service.test-helpers';
import type { XtreamBackupUserStateReader } from './xtream-backup-user-state';

describe('PlaylistBackupService — Xtream user state outside Electron', () => {
    const originalElectron = (window as { electron?: unknown }).electron;
    const xtream = {
        _id: 'xtream-1',
        title: 'Mi IPTV',
        serverUrl: 'http://provider.example:8080',
        username: 'user',
        password: 'secret',
        autoRefresh: false,
    } as Playlist;
    const userState = {
        favorites: [{ xtreamId: 7, contentType: 'movie' as const }],
        recentlyViewed: [
            {
                xtreamId: 12,
                contentType: 'live' as const,
                viewedAt: '2026-10-12T10:00:00.000Z',
            },
        ],
        playbackPositions: [
            {
                contentXtreamId: 7,
                contentType: 'vod' as const,
                positionSeconds: 1800,
                durationSeconds: 6000,
                updatedAt: '2026-10-12T11:00:00.000Z',
            },
        ],
    };

    beforeEach(() => {
        delete (window as { electron?: unknown }).electron;
    });

    afterEach(() => {
        (window as { electron?: unknown }).electron = originalElectron;
    });

    async function exportedEntry(reader?: XtreamBackupUserStateReader) {
        const service = createPlaylistBackupService({
            playlistsService: { getAllData: jest.fn(() => of([xtream])) },
            ...(reader ? { xtreamUserStateReader: reader } : {}),
        });
        const { json } = await service.exportBackup();
        const manifest = JSON.parse(json) as PlaylistBackupManifestV1;
        return manifest.playlists[0] as XtreamPlaylistBackupEntry;
    }

    it('exports favorites, recent items and playback positions through the PWA reader', async () => {
        const reader = { read: jest.fn(() => userState) };

        const entry = await exportedEntry(reader);

        expect(reader.read).toHaveBeenCalledWith('xtream-1');
        expect(entry.userState).toEqual(
            expect.objectContaining({
                hiddenCategories: [],
                favorites: userState.favorites,
                recentlyViewed: userState.recentlyViewed,
                playbackPositions: userState.playbackPositions,
            })
        );
    });

    it('keeps the empty collections when the runtime has no reader', async () => {
        const entry = await exportedEntry();

        expect(entry.userState.favorites).toEqual([]);
        expect(entry.userState.playbackPositions).toEqual([]);
    });
});
