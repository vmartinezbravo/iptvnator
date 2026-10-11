import { inject } from '@angular/core';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { ElectronService } from './electron.service';
import { NativeDataService } from './native-data.service';
import { PwaService } from './pwa.service';

/**
 * Picks the data service for the current runtime: Electron IPC, the native
 * (Capacitor) transport, or the PWA backend proxy.
 */
export function DataFactory() {
    if (window.electron) {
        return inject(ElectronService);
    }
    if (inject(RuntimeCapabilitiesService).isNativeShell) {
        return inject(NativeDataService);
    }
    return inject(PwaService);
}
