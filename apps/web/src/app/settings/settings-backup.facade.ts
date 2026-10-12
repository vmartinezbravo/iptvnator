import { inject, Injectable, Injector, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import {
    PlaylistBackupImportSummary,
    PlaylistBackupService,
} from '@iptvnator/services/playlist-backup';
import { NATIVE_BACKUP_FILES } from './native-backup-file';
import { SettingsSnackbarService } from './settings-snackbar.service';

/** Native notices carry a path or a warning: time to read them on a TV. */
const NATIVE_NOTICE_MS = 10000;

@Injectable()
export class SettingsBackupFacade {
    private readonly playlistBackupService = inject(PlaylistBackupService);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly settingsSnackbar = inject(SettingsSnackbarService);
    private readonly store = inject(Store);
    private readonly translate = inject(TranslateService);
    private readonly injector = inject(Injector);
    private readonly nativeBackupFiles = inject(NATIVE_BACKUP_FILES);
    private readonly dialog = inject(MatDialog);

    readonly isExportingData = signal(false);

    async exportData(waitForUiFeedbackFrame: () => Promise<void>) {
        if (this.isExportingData()) {
            return;
        }

        this.isExportingData.set(true);
        await waitForUiFeedbackFrame();

        try {
            const backup = await this.playlistBackupService.exportBackup();

            if (this.runtime.isNativeShell) {
                const path = await this.nativeBackupFiles.save(
                    backup.defaultFileName,
                    backup.json
                );
                // The text warns that the file holds the sources'
                // credentials in a folder other apps can read.
                this.settingsSnackbar.open(
                    this.translate.instant('SETTINGS.BACKUP_EXPORTED_TO', {
                        path,
                    }),
                    { duration: NATIVE_NOTICE_MS }
                );
                return;
            }

            if (this.runtime.supportsDesktopFileSave && window.electron) {
                const savePath = await window.electron.saveFileDialog(
                    backup.defaultFileName,
                    [
                        {
                            name: 'JSON',
                            extensions: ['json'],
                        },
                    ]
                );

                if (!savePath) {
                    return;
                }

                await window.electron.writeFile(savePath, backup.json);
            } else {
                this.downloadBackupInBrowser(
                    backup.defaultFileName,
                    backup.json
                );
            }

            this.settingsSnackbar.open(
                this.translate.instant('SETTINGS.BACKUP_EXPORTED')
            );
        } catch (error) {
            console.error('Failed to export playlist backup:', error);
            this.settingsSnackbar.open(
                this.translate.instant('SETTINGS.BACKUP_EXPORT_FAILED')
            );
        } finally {
            this.isExportingData.set(false);
        }
    }

    async importData(onImported: () => void): Promise<void> {
        if (this.runtime.isNativeShell) {
            await this.importFromDeviceFolder(onImported);
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.addEventListener('change', async (event: Event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];

            if (!file) {
                return;
            }

            await this.importBackupText(() => file.text(), onImported);
        });

        input.click();
    }

    /** Loaded on demand: only the native shell ever opens it. */
    loadNativeBackupPicker = () => import('./native-backup-picker.dialog');

    /**
     * Fire OS has no document picker, so `<input type="file">` opens nothing
     * there: restore lists the folder that export writes to instead.
     */
    private async importFromDeviceFolder(onImported: () => void) {
        const files = await this.nativeBackupFiles.list();
        if (files.length === 0) {
            this.settingsSnackbar.open(
                this.translate.instant('SETTINGS.BACKUP_NONE_ON_DEVICE'),
                { duration: NATIVE_NOTICE_MS }
            );
            return;
        }
        const { NativeBackupPickerDialogComponent } =
            await this.loadNativeBackupPicker();
        const picked: string | undefined = await firstValueFrom(
            this.dialog
                .open(NativeBackupPickerDialogComponent, { data: { files } })
                .afterClosed()
        );
        if (!picked) {
            return;
        }
        await this.importBackupText(
            () => this.nativeBackupFiles.read(picked),
            onImported
        );
    }

    private async importBackupText(
        readText: () => Promise<string>,
        onImported: () => void
    ): Promise<void> {
        try {
            const summary = await this.playlistBackupService.importBackup(
                await readText()
            );
            this.injector
                .get(XtreamStore, null)
                ?.reconcilePendingRestoreBlock();

            if (summary.imported > 0 || summary.merged > 0) {
                this.store.dispatch(PlaylistActions.removeAllPlaylists());
                this.store.dispatch(PlaylistActions.loadPlaylists());
            }

            onImported();
            this.settingsSnackbar.open(this.buildBackupImportSummary(summary));

            if (summary.errors.length > 0) {
                console.error(
                    'Playlist backup import completed with issues:',
                    summary.errors
                );
            }
        } catch (error) {
            console.error('Failed to import playlist backup:', error);
            this.settingsSnackbar.open(
                error instanceof Error
                    ? error.message
                    : this.translate.instant('SETTINGS.IMPORT_ERROR')
            );
        }
    }

    private downloadBackupInBrowser(
        defaultFileName: string,
        json: string
    ): void {
        const blob = new Blob([json], {
            type: 'application/json',
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = defaultFileName;
        link.click();
        window.URL.revokeObjectURL(url);
    }

    private buildBackupImportSummary(
        summary: PlaylistBackupImportSummary
    ): string {
        return this.translate.instant('SETTINGS.BACKUP_IMPORT_SUMMARY', {
            imported: summary.imported,
            merged: summary.merged,
            skipped: summary.skipped,
            failed: summary.failed,
        });
    }
}
