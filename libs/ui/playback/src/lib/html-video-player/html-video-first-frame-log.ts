import type { PlaybackUrlSourceKind } from '@iptvnator/playback/util';

/**
 * Logs how long each source takes from being assigned to its first `playing`
 * event, so device runs (Fire TV) can read time-to-first-frame from the
 * console: `[perf] first-frame <ms> <kind>`.
 */
export class HtmlVideoFirstFrameLog {
    private pending: { startedAt: number; kind: PlaybackUrlSourceKind } | null =
        null;

    constructor(private readonly video: HTMLVideoElement) {
        video.addEventListener('playing', this.handlePlaying);
    }

    /** Starts timing a new source; `null` stops timing (no source). */
    mark(kind: PlaybackUrlSourceKind | null): void {
        this.pending = kind ? { startedAt: performance.now(), kind } : null;
    }

    destroy(): void {
        this.video.removeEventListener('playing', this.handlePlaying);
        this.pending = null;
    }

    private readonly handlePlaying = (): void => {
        const pending = this.pending;
        if (!pending) return;
        this.pending = null;
        console.info(
            '[perf] first-frame',
            Math.round(performance.now() - pending.startedAt),
            pending.kind
        );
    };
}
