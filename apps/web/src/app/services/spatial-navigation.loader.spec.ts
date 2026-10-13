import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { loadSpatialNavigation } from './spatial-navigation.loader';

const runtime = (isNativeShell: boolean) =>
    ({ isNativeShell }) as RuntimeCapabilitiesService;

/** Behaves like the WICG polyfill: exposes navigate, binds keys on load. */
function fakePolyfill(onLoad: () => void) {
    return jest.fn(async () => {
        (window as unknown as { navigate: () => void }).navigate = () =>
            undefined;
        window.addEventListener('load', onLoad);
    });
}

function setReadyState(state: DocumentReadyState): void {
    Object.defineProperty(document, 'readyState', {
        configurable: true,
        get: () => state,
    });
}

describe('loadSpatialNavigation', () => {
    const originalAddEventListener = window.addEventListener;

    afterEach(() => {
        delete (window as unknown as { navigate?: unknown }).navigate;
        delete (document as unknown as { readyState?: unknown }).readyState;
    });

    it('does not import the polyfill outside a native shell', async () => {
        const importer = fakePolyfill(jest.fn());

        await expect(
            loadSpatialNavigation(runtime(false), importer)
        ).resolves.toBe(false);
        expect(importer).not.toHaveBeenCalled();
    });

    it('imports it once inside a native shell', async () => {
        const importer = fakePolyfill(jest.fn());

        await expect(
            loadSpatialNavigation(runtime(true), importer)
        ).resolves.toBe(true);
        await expect(
            loadSpatialNavigation(runtime(true), importer)
        ).resolves.toBe(true);
        expect(importer).toHaveBeenCalledTimes(1);
    });

    it('binds the D-pad keys when the page has already loaded', async () => {
        setReadyState('complete');
        const bindKeys = jest.fn();

        await loadSpatialNavigation(runtime(true), fakePolyfill(bindKeys));

        expect(bindKeys).toHaveBeenCalledTimes(1);
        expect(window.addEventListener).toBe(originalAddEventListener);
    });

    it('binds the D-pad keys when the page finishes loading during the import', async () => {
        setReadyState('interactive');
        const bindKeys = jest.fn();
        const polyfill = fakePolyfill(bindKeys);
        const importer = jest.fn(async () => {
            setReadyState('complete');
            await polyfill();
        });

        await loadSpatialNavigation(runtime(true), importer);

        expect(bindKeys).toHaveBeenCalledTimes(1);
        expect(window.addEventListener).toBe(originalAddEventListener);
    });

    it('leaves the binding to the load event while the page is loading', async () => {
        setReadyState('loading');
        const bindKeys = jest.fn();

        await loadSpatialNavigation(runtime(true), fakePolyfill(bindKeys));
        expect(bindKeys).not.toHaveBeenCalled();

        window.dispatchEvent(new Event('load'));
        expect(bindKeys).toHaveBeenCalledTimes(1);
        window.removeEventListener('load', bindKeys);
    });
});
