import { InjectionToken } from '@angular/core';

/** A backup file in the device's `Documents/IPTVnator` folder. */
export interface NativeBackupFileInfo {
    readonly name: string;
    /** Last modification, ms since epoch. */
    readonly modifiedAt: number;
}

/**
 * Settings backups on the native shell. The Android WebView ignores
 * `<a download>` and Fire OS has no document picker for `<input
 * type="file">`, so backups live in the public `Documents/IPTVnator` folder
 * and restore lists that folder instead.
 */
export interface NativeBackupFiles {
    /** Writes a backup and returns its path, to show the user. */
    save(fileName: string, json: string): Promise<string>;
    /** JSON backups in the folder, newest first; none if it does not exist. */
    list(): Promise<NativeBackupFileInfo[]>;
    read(fileName: string): Promise<string>;
}

const BACKUP_FOLDER = 'IPTVnator';

type FilesystemModule = Pick<
    typeof import('@capacitor/filesystem'),
    'Directory' | 'Encoding' | 'Filesystem'
>;

/**
 * The plugin is imported on use, so desktop and PWA bundles never load it;
 * specs pass a fake module instead.
 */
export function createNativeBackupFiles(
    load: () => Promise<FilesystemModule> = () =>
        import('@capacitor/filesystem')
): NativeBackupFiles {
    return {
        async save(fileName, json) {
            const { Directory, Encoding, Filesystem } = await load();
            const { uri } = await Filesystem.writeFile({
                path: `${BACKUP_FOLDER}/${fileName}`,
                data: json,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
                recursive: true,
            });
            return uri.replace(/^file:\/\//, '');
        },
        async list() {
            const { Directory, Filesystem } = await load();
            try {
                const { files } = await Filesystem.readdir({
                    path: BACKUP_FOLDER,
                    directory: Directory.Documents,
                });
                return files
                    .filter(
                        (file) =>
                            file.type === 'file' &&
                            file.name.toLowerCase().endsWith('.json')
                    )
                    .sort((a, b) => b.mtime - a.mtime)
                    .map((file) => ({
                        name: file.name,
                        modifiedAt: file.mtime,
                    }));
            } catch {
                // No backup was ever exported on this device.
                return [];
            }
        },
        async read(fileName) {
            const { Directory, Encoding, Filesystem } = await load();
            const { data } = await Filesystem.readFile({
                path: `${BACKUP_FOLDER}/${fileName}`,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
            });
            return typeof data === 'string' ? data : await data.text();
        },
    };
}

export const NATIVE_BACKUP_FILES = new InjectionToken<NativeBackupFiles>(
    'NATIVE_BACKUP_FILES',
    { providedIn: 'root', factory: () => createNativeBackupFiles() }
);
