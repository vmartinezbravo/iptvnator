import { logNativeMediaCodecs } from './native-media-codecs';

describe('logNativeMediaCodecs', () => {
    const probeResult = { avc: true, hevc: false };
    let info: jest.SpyInstance;

    beforeEach(() => {
        info = jest.spyOn(console, 'info').mockImplementation(() => {
            /* silenced */
        });
    });

    afterEach(() => jest.restoreAllMocks());

    const runNow = (run: () => void) => run();

    it('logs the MSE codec probe on a native shell', async () => {
        const isTypeSupported = jest.fn(() => true);
        const probeMediaCodecs = jest.fn(() => probeResult);
        const importer = jest.fn(async () => ({ probeMediaCodecs }));

        await logNativeMediaCodecs(
            { isNativeShell: true },
            importer,
            isTypeSupported,
            runNow
        );

        expect(importer).toHaveBeenCalledTimes(1);
        expect(probeMediaCodecs).toHaveBeenCalledWith(isTypeSupported);
        expect(info).toHaveBeenCalledWith(
            '[codecs]',
            JSON.stringify(probeResult)
        );
    });

    it('defers the probe until startup is over', async () => {
        let scheduled: (() => void) | undefined;
        const importer = jest.fn(async () => ({
            probeMediaCodecs: jest.fn(() => probeResult),
        }));

        const done = logNativeMediaCodecs(
            { isNativeShell: true },
            importer,
            () => true,
            (run) => (scheduled = run)
        );
        await Promise.resolve();

        expect(importer).not.toHaveBeenCalled();
        scheduled?.();
        await done;
        expect(importer).toHaveBeenCalledTimes(1);
    });

    it('does not probe codecs outside a native shell', async () => {
        const importer = jest.fn(async () => ({
            probeMediaCodecs: jest.fn(() => probeResult),
        }));
        const schedule = jest.fn(runNow);

        await logNativeMediaCodecs(
            { isNativeShell: false },
            importer,
            () => true,
            schedule
        );

        expect(schedule).not.toHaveBeenCalled();

        expect(importer).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });
});
