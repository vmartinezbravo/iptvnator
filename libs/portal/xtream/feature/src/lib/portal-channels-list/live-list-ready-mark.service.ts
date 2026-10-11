import { Injectable } from '@angular/core';

/**
 * Startup measurement for the Android port: marks the first moment a live
 * channel list has rows, once per page load. `console.info` on purpose — it
 * reaches logcat in production builds, where the scoped logger is silent.
 */
@Injectable({ providedIn: 'root' })
export class LiveListReadyMark {
    private emitted = false;

    emitOnce(): void {
        if (this.emitted) {
            return;
        }
        this.emitted = true;
        performance.mark('iptvnator:live-list-ready');
        console.info('[perf] live-list-ready');
    }
}
