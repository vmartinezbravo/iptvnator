import { createNativeBackupFiles } from './native-backup-file';

describe('native backup files', () => {
    const Directory = { Documents: 'DOCUMENTS' };
    const Encoding = { UTF8: 'utf8' };

    function files(filesystem: Record<string, jest.Mock>) {
        return createNativeBackupFiles(async () => ({
            Directory,
            Encoding,
            Filesystem: filesystem,
        }));
    }

    it('lists only json backups, newest first', async () => {
        const readdir = jest.fn().mockResolvedValue({
            files: [
                { name: 'old.json', type: 'file', mtime: 1 },
                { name: 'notes.txt', type: 'file', mtime: 5 },
                { name: 'new.JSON', type: 'file', mtime: 9 },
                { name: 'nested.json', type: 'directory', mtime: 7 },
            ],
        });

        const backups = await files({ readdir }).list();

        expect(readdir).toHaveBeenCalledWith({
            path: 'IPTVnator',
            directory: 'DOCUMENTS',
        });
        expect(backups).toEqual([
            { name: 'new.JSON', modifiedAt: 9 },
            { name: 'old.json', modifiedAt: 1 },
        ]);
    });

    it('returns no backups when the folder does not exist yet', async () => {
        const readdir = jest
            .fn()
            .mockRejectedValue(new Error('Folder does not exist.'));

        await expect(files({ readdir }).list()).resolves.toEqual([]);
    });

    it('reads a backup as UTF-8 text', async () => {
        const readFile = jest.fn().mockResolvedValue({ data: '{"a":1}' });

        await expect(files({ readFile }).read('b.json')).resolves.toBe(
            '{"a":1}'
        );
        expect(readFile).toHaveBeenCalledWith({
            path: 'IPTVnator/b.json',
            directory: 'DOCUMENTS',
            encoding: 'utf8',
        });
    });

    it('saves into Documents/IPTVnator and returns a plain path', async () => {
        const writeFile = jest.fn().mockResolvedValue({
            uri: 'file:///storage/emulated/0/Documents/IPTVnator/b.json',
        });

        await expect(files({ writeFile }).save('b.json', '{}')).resolves.toBe(
            '/storage/emulated/0/Documents/IPTVnator/b.json'
        );
        expect(writeFile).toHaveBeenCalledWith({
            path: 'IPTVnator/b.json',
            data: '{}',
            directory: 'DOCUMENTS',
            encoding: 'utf8',
            recursive: true,
        });
    });
});
