import { RuntimeCapabilitiesService } from '@iptvnator/services';

/**
 * Loads the WICG spatial navigation polyfill (the repo copy in
 * `../vendor/spatial-navigation-polyfill`) on the native shell (Fire TV,
 * Android TV), so the D-pad arrows move the focus to the nearest focusable
 * element. Desktop and the PWA never download it. Lists with their own arrow
 * handling keep it: the polyfill skips events that are `defaultPrevented`.
 *
 * Returns whether spatial navigation is active.
 */
export async function loadSpatialNavigation(
    runtime: RuntimeCapabilitiesService,
    importer: () => Promise<unknown> = () =>
        import('../vendor/spatial-navigation-polyfill/spatial-navigation-polyfill.js')
): Promise<boolean> {
    if (!runtime.isNativeShell) return false;
    if ('navigate' in window) return true;

    // The polyfill binds its key handler on window `load`, which has usually
    // fired by the time this lazy chunk arrives: then run that binding right
    // away. Checked when the polyfill registers, not before the import.
    const addEventListener = window.addEventListener;
    window.addEventListener = function (
        this: Window,
        ...args: Parameters<typeof addEventListener>
    ) {
        const [type, listener] = args;
        if (
            type === 'load' &&
            typeof listener === 'function' &&
            document.readyState === 'complete'
        ) {
            listener.call(window, new Event('load'));
            return;
        }
        addEventListener.apply(this, args);
    } as typeof window.addEventListener;
    try {
        await importer();
    } finally {
        window.addEventListener = addEventListener;
    }
    return true;
}
