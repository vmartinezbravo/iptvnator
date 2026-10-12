import { InjectionToken } from '@angular/core';

/**
 * Writes a settings backup to the device's public Documents folder
 * (`Documents/IPTVnator/<file>`), since the Android WebView ignores
 * `<a download>`. Returns the path to show the user. The plugin is imported
 * on use, so desktop and PWA bundles never load it.
 */
export async function saveNativeBackupFile(
    fileName: string,
    json: string
): Promise<string> {
    const { Directory, Encoding, Filesystem } =
        await import('@capacitor/filesystem');
    const { uri } = await Filesystem.writeFile({
        path: 'IPTVnator/' + fileName,
        data: json,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
    });
    return uri.replace(/^file:\/\//, '');
}

export const NATIVE_BACKUP_FILE_WRITER = new InjectionToken<
    typeof saveNativeBackupFile
>('NATIVE_BACKUP_FILE_WRITER', {
    providedIn: 'root',
    factory: () => saveNativeBackupFile,
});
