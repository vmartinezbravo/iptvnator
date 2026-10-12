import { Injectable, inject } from '@angular/core';
import { RuntimeCapabilitiesService } from '@iptvnator/services';

/**
 * On the Fire TV Stick a category switch builds every visible channel row in
 * one long task. Rows paint their logo and name first and add the programme
 * and the action buttons one painted frame later, all of them together in a
 * single task (one change detection), so the switch shows up sooner.
 */
@Injectable({ providedIn: 'root' })
export class RowDetailsScheduler {
    readonly defers = inject(RuntimeCapabilitiesService).isNativeShell;

    private queue: Array<() => void> = [];
    private scheduled = false;

    /** Runs `callback` after the next paint; returns a cancel function. */
    afterNextPaint(callback: () => void): () => void {
        this.queue.push(callback);
        if (!this.scheduled) {
            this.scheduled = true;
            // rAF runs just before the paint; the timeout, right after it.
            requestAnimationFrame(() => setTimeout(() => this.flush()));
        }
        return () => {
            this.queue = this.queue.filter((queued) => queued !== callback);
        };
    }

    private flush(): void {
        const queue = this.queue;
        this.queue = [];
        this.scheduled = false;
        queue.forEach((callback) => callback());
    }
}
