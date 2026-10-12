import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
    selectAllPlaylistsMeta,
    selectIsEpgAvailable,
} from '@iptvnator/m3u-state';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import { PlaylistBackupService } from '@iptvnator/services/playlist-backup';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MockProvider } from 'ng-mocks';
import { of } from 'rxjs';
import { NATIVE_BACKUP_FILES } from './native-backup-file';
import { SettingsBackupFacade } from './settings-backup.facade';
import { SettingsSnackbarService } from './settings-snackbar.service';
import {
    BACKUP_EXPORT_RESULT,
    createElectronStub,
    MatSnackBarStub,
} from './test-stubs/settings-test-harness.stub';

describe('SettingsBackupFacade', () => {
    let facade: SettingsBackupFacade;
    let playlistBackupService: PlaylistBackupService;
    let nativeBackupFiles: {
        save: jest.Mock;
        list: jest.Mock;
        read: jest.Mock;
    };
    let dialog: { open: jest.Mock };
    const originalElectron = window.electron;
    const capacitorWindow = window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
    };

    /** The component normally supplies a paint frame; tests skip the wait */
    const noWait = () => Promise.resolve();

    function configure(): void {
        TestBed.configureTestingModule({
            providers: [
                SettingsBackupFacade,
                SettingsSnackbarService,
                { provide: MatSnackBar, useClass: MatSnackBarStub },
                { provide: NATIVE_BACKUP_FILES, useValue: nativeBackupFiles },
                { provide: MatDialog, useValue: dialog },
                MockProvider(PlaylistBackupService, {
                    exportBackup: jest
                        .fn()
                        .mockResolvedValue(BACKUP_EXPORT_RESULT),
                    importBackup: jest.fn(),
                }),
                MockProvider(XtreamStore, {
                    reconcilePendingRestoreBlock: jest.fn(),
                }),
                provideMockStore({
                    selectors: [
                        { selector: selectAllPlaylistsMeta, value: [] },
                        { selector: selectIsEpgAvailable, value: false },
                    ],
                }),
            ],
            imports: [TranslateModule.forRoot()],
        });

        facade = TestBed.inject(SettingsBackupFacade);
        playlistBackupService = TestBed.inject(PlaylistBackupService);
    }

    beforeEach(() => {
        window.electron = createElectronStub();
        nativeBackupFiles = {
            save: jest
                .fn()
                .mockResolvedValue(
                    '/storage/emulated/0/Documents/IPTVnator/backup.json'
                ),
            list: jest.fn().mockResolvedValue([]),
            read: jest.fn(),
        };
        dialog = { open: jest.fn() };
    });

    const originalCreateObjectUrl = window.URL.createObjectURL;
    const originalRevokeObjectUrl = window.URL.revokeObjectURL;

    afterEach(() => {
        window.electron = originalElectron;
        delete capacitorWindow.Capacitor;
        Object.defineProperty(window.URL, 'createObjectURL', {
            configurable: true,
            value: originalCreateObjectUrl,
        });
        Object.defineProperty(window.URL, 'revokeObjectURL', {
            configurable: true,
            value: originalRevokeObjectUrl,
        });
        jest.restoreAllMocks();
    });

    it('exports through the native file writer on native shell', async () => {
        window.electron = undefined as unknown as typeof window.electron;
        capacitorWindow.Capacitor = { isNativePlatform: () => true };
        configure();
        const snackbar = jest.spyOn(
            TestBed.inject(SettingsSnackbarService),
            'open'
        );
        const createObjectURL = jest.fn();
        Object.defineProperty(window.URL, 'createObjectURL', {
            configurable: true,
            value: createObjectURL,
        });

        await facade.exportData(noWait);

        expect(nativeBackupFiles.save).toHaveBeenCalledWith(
            BACKUP_EXPORT_RESULT.defaultFileName,
            BACKUP_EXPORT_RESULT.json
        );
        expect(createObjectURL).not.toHaveBeenCalled();
        // Long enough to read the credentials warning on a TV.
        expect(snackbar).toHaveBeenCalledWith(
            'SETTINGS.BACKUP_EXPORTED_TO',
            expect.objectContaining({ duration: 10000 })
        );
        expect(facade.isExportingData()).toBe(false);
    });

    it('warns that a device backup holds credentials in a shared folder', () => {
        const en = JSON.parse(
            readFileSync(
                resolve(process.cwd(), 'apps/web/src/assets/i18n/en.json'),
                'utf8'
            )
        );
        const message: string = en.SETTINGS.BACKUP_EXPORTED_TO;

        expect(message).toContain('{{path}}');
        expect(message).toMatch(/credentials/i);
        expect(message).toMatch(/other apps/i);
    });

    it('restores a backup picked from the device folder on native shell', async () => {
        capacitorWindow.Capacitor = { isNativePlatform: () => true };
        configure();
        const files = [
            {
                name: 'iptvnator-playlist-backup-2026-10-12.json',
                modifiedAt: 2,
            },
        ];
        nativeBackupFiles.list.mockResolvedValue(files);
        nativeBackupFiles.read.mockResolvedValue('{"backup":true}');
        dialog.open.mockReturnValue({ afterClosed: () => of(files[0].name) });
        (playlistBackupService.importBackup as jest.Mock).mockResolvedValue({
            imported: 1,
            merged: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        });
        const createElement = jest.spyOn(document, 'createElement');
        const onImported = jest.fn();

        await facade.importData(onImported);

        expect(dialog.open).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ data: { files } })
        );
        expect(nativeBackupFiles.read).toHaveBeenCalledWith(files[0].name);
        expect(playlistBackupService.importBackup).toHaveBeenCalledWith(
            '{"backup":true}'
        );
        expect(onImported).toHaveBeenCalledTimes(1);
        expect(createElement).not.toHaveBeenCalledWith('input');
    });

    it('explains where to put backups when the device folder has none', async () => {
        capacitorWindow.Capacitor = { isNativePlatform: () => true };
        configure();
        const snackbar = jest.spyOn(
            TestBed.inject(SettingsSnackbarService),
            'open'
        );

        await facade.importData(jest.fn());

        expect(dialog.open).not.toHaveBeenCalled();
        expect(snackbar).toHaveBeenCalledWith(
            'SETTINGS.BACKUP_NONE_ON_DEVICE',
            expect.objectContaining({ duration: 10000 })
        );
    });

    it('does nothing when the device backup list is dismissed', async () => {
        capacitorWindow.Capacitor = { isNativePlatform: () => true };
        configure();
        nativeBackupFiles.list.mockResolvedValue([
            { name: 'a.json', modifiedAt: 1 },
        ]);
        dialog.open.mockReturnValue({ afterClosed: () => of(undefined) });

        await facade.importData(jest.fn());

        expect(nativeBackupFiles.read).not.toHaveBeenCalled();
        expect(playlistBackupService.importBackup).not.toHaveBeenCalled();
    });

    it('keeps the file picker outside a native shell', async () => {
        configure();
        const input = document.createElement('input');
        jest.spyOn(document, 'createElement').mockReturnValue(input);
        const click = jest.spyOn(input, 'click').mockImplementation();

        await facade.importData(jest.fn());

        expect(click).toHaveBeenCalledTimes(1);
        expect(nativeBackupFiles.list).not.toHaveBeenCalled();
    });

    it('keeps the browser download outside a native shell', async () => {
        window.electron = undefined as unknown as typeof window.electron;
        configure();
        const createObjectURL = jest.fn().mockReturnValue('blob:backup');
        Object.defineProperty(window.URL, 'createObjectURL', {
            configurable: true,
            value: createObjectURL,
        });
        Object.defineProperty(window.URL, 'revokeObjectURL', {
            configurable: true,
            value: jest.fn(),
        });
        jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
            () => undefined
        );

        await facade.exportData(noWait);

        expect(nativeBackupFiles.save).not.toHaveBeenCalled();
        expect(createObjectURL).toHaveBeenCalledTimes(1);
    });

    it('shows an export busy state until the backup file has been written', async () => {
        configure();
        let resolveExport: (value: typeof BACKUP_EXPORT_RESULT) => void = () =>
            undefined;
        (playlistBackupService.exportBackup as jest.Mock).mockReturnValueOnce(
            new Promise((resolve) => {
                resolveExport = resolve;
            })
        );

        const exportPromise = facade.exportData(noWait);

        expect(facade.isExportingData()).toBe(true);

        resolveExport(BACKUP_EXPORT_RESULT);
        await exportPromise;

        expect(window.electron.saveFileDialog).toHaveBeenCalledWith(
            BACKUP_EXPORT_RESULT.defaultFileName,
            [
                {
                    extensions: ['json'],
                    name: 'JSON',
                },
            ]
        );
        expect(window.electron.writeFile).toHaveBeenCalledWith(
            '/tmp/backup.json',
            '{}'
        );
        expect(facade.isExportingData()).toBe(false);
    });

    it('falls back to browser backup download when desktop file-save preload is incomplete', async () => {
        const saveFileDialog = jest.fn().mockResolvedValue('/tmp/backup.json');
        window.electron = {
            platform: 'linux',
            saveFileDialog,
        } as unknown as typeof window.electron;
        configure();

        const createObjectURL = jest.fn().mockReturnValue('blob:backup');
        const revokeObjectURL = jest.fn();
        const originalCreateObjectURL = window.URL.createObjectURL;
        const originalRevokeObjectURL = window.URL.revokeObjectURL;
        Object.defineProperty(window.URL, 'createObjectURL', {
            configurable: true,
            value: createObjectURL,
        });
        Object.defineProperty(window.URL, 'revokeObjectURL', {
            configurable: true,
            value: revokeObjectURL,
        });
        const clickSpy = jest
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation();

        try {
            await facade.exportData(noWait);

            expect(saveFileDialog).not.toHaveBeenCalled();
            expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
            expect(clickSpy).toHaveBeenCalled();
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
        } finally {
            clickSpy.mockRestore();
            Object.defineProperty(window.URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectURL,
            });
            Object.defineProperty(window.URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectURL,
            });
        }
    });

    it('reports a failed export and clears the busy state', async () => {
        configure();
        (playlistBackupService.exportBackup as jest.Mock).mockRejectedValueOnce(
            new Error('disk full')
        );
        jest.spyOn(console, 'error').mockImplementation();
        const snackBar = TestBed.inject(
            MatSnackBar
        ) as unknown as MatSnackBarStub;

        await facade.exportData(noWait);

        expect(facade.isExportingData()).toBe(false);
        expect(snackBar.open).toHaveBeenCalledWith(
            'SETTINGS.BACKUP_EXPORT_FAILED',
            undefined,
            expect.objectContaining({ panelClass: ['settings-snackbar'] })
        );
    });

    it('reconciles a pending Xtream restore before completing an import', async () => {
        configure();
        const input = document.createElement('input');
        const file = {
            text: jest.fn().mockResolvedValue('{}'),
        } as unknown as File;
        Object.defineProperty(input, 'files', { value: [file] });
        const addEventListener = jest.spyOn(input, 'addEventListener');
        const createElement = jest
            .spyOn(document, 'createElement')
            .mockReturnValue(input);
        jest.spyOn(input, 'click').mockImplementation();
        const summary = {
            imported: 0,
            merged: 0,
            skipped: 0,
            failed: 1,
            errors: ['pending restore state could not be consumed'],
        };
        (playlistBackupService.importBackup as jest.Mock).mockResolvedValue(
            summary
        );
        const onImported = jest.fn();
        const xtreamStore = TestBed.inject(XtreamStore);

        facade.importData(onImported);
        const changeListener = addEventListener.mock.calls.find(
            ([type]) => type === 'change'
        )?.[1] as (event: Event) => Promise<void>;
        await changeListener({ target: input } as unknown as Event);

        expect(
            (TestBed.inject(MatSnackBar) as unknown as MatSnackBarStub).open
        ).toHaveBeenCalledWith(
            'SETTINGS.BACKUP_IMPORT_SUMMARY',
            undefined,
            expect.objectContaining({ panelClass: ['settings-snackbar'] })
        );
        expect(xtreamStore.reconcilePendingRestoreBlock).toHaveBeenCalledTimes(
            1
        );
        expect(onImported).toHaveBeenCalledTimes(1);
        expect(
            (xtreamStore.reconcilePendingRestoreBlock as jest.Mock).mock
                .invocationCallOrder[0]
        ).toBeLessThan(onImported.mock.invocationCallOrder[0]);
        createElement.mockRestore();
    });
});
