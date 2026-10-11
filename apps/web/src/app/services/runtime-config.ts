import { AppConfig } from '../../environments/environment';

export interface IptvnatorRuntimeConfig {
    readonly BACKEND_URL?: string;
}

export function resolveBackendUrl(
    runtimeConfig: IptvnatorRuntimeConfig | undefined,
    fallbackUrl: string
): string {
    const runtimeUrl = runtimeConfig?.BACKEND_URL?.trim();
    return runtimeUrl || fallbackUrl;
}

export function getRuntimeBackendUrl(): string {
    return resolveBackendUrl(
        globalThis.window?.__IPTVNATOR_CONFIG__,
        AppConfig.BACKEND_URL
    );
}

export interface ServiceWorkerRuntimeContext {
    readonly electronBridge?: unknown;
    readonly protocol?: string;
    readonly nativeShell?: boolean;
}

function getDefaultServiceWorkerRuntimeContext(): ServiceWorkerRuntimeContext {
    const browserWindow = globalThis.window as
        | (Window & {
              electron?: unknown;
              Capacitor?: { isNativePlatform?: () => boolean };
          })
        | undefined;

    return {
        electronBridge: browserWindow?.electron,
        protocol:
            browserWindow?.location?.protocol ?? globalThis.location?.protocol,
        nativeShell: browserWindow?.Capacitor?.isNativePlatform?.() === true,
    };
}

export function shouldEnableServiceWorker(
    production = AppConfig.production,
    navigatorRef: Navigator | undefined = globalThis.navigator,
    runtimeContext = getDefaultServiceWorkerRuntimeContext()
): boolean {
    return (
        production &&
        !!navigatorRef &&
        'serviceWorker' in navigatorRef &&
        !runtimeContext.electronBridge &&
        runtimeContext.protocol !== 'file:' &&
        !runtimeContext.nativeShell
    );
}
