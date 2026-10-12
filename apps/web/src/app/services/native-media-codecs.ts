import type { RuntimeCapabilitiesService } from '@iptvnator/services';

type MediaCodecProbeModule = Pick<
    typeof import('@iptvnator/playback/util'),
    'probeMediaCodecs'
>;

function isMseTypeSupported(type: string): boolean {
    return (
        typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type)
    );
}

/** Past the Fire TV cold start (~15 s) and most of the catalogue import. */
const PROBE_DELAY_MS = 60_000;

function runAfterStartup(run: () => void): void {
    setTimeout(() => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 10_000 });
        } else {
            run();
        }
    }, PROBE_DELAY_MS);
}

/**
 * Logs `[codecs] {...}` once per start on the native shell, so each device's
 * MSE codec support can be read from the console (Fire TV, Task 4.5). The
 * playback util is imported lazily and only after startup: its barrel pulls
 * hls.js (a ~600 kB chunk) that must not compete with the cold start.
 */
export async function logNativeMediaCodecs(
    runtime: Pick<RuntimeCapabilitiesService, 'isNativeShell'>,
    importer: () => Promise<MediaCodecProbeModule> = () =>
        import('@iptvnator/playback/util'),
    isTypeSupported: (type: string) => boolean = isMseTypeSupported,
    schedule: (run: () => void) => void = runAfterStartup
): Promise<void> {
    if (!runtime.isNativeShell) return;
    await new Promise<void>((resolve) => schedule(resolve));
    const { probeMediaCodecs } = await importer();
    console.info('[codecs]', JSON.stringify(probeMediaCodecs(isTypeSupported)));
}
