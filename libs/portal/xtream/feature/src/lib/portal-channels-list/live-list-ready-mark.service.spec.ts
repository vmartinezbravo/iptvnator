import { TestBed } from '@angular/core/testing';
import { LiveListReadyMark } from './live-list-ready-mark.service';

describe('LiveListReadyMark', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        delete (performance as { mark?: unknown }).mark;
    });

    it('marks and logs only the first time per page load', () => {
        // jsdom has no User Timing marks.
        const mark = jest.fn();
        Object.defineProperty(performance, 'mark', {
            configurable: true,
            value: mark,
        });
        const info = jest
            .spyOn(console, 'info')
            .mockImplementation(() => undefined);
        const readyMark = TestBed.inject(LiveListReadyMark);

        readyMark.emitOnce();
        readyMark.emitOnce();

        expect(mark).toHaveBeenCalledTimes(1);
        expect(mark).toHaveBeenCalledWith('iptvnator:live-list-ready');
        expect(info).toHaveBeenCalledTimes(1);
        expect(info).toHaveBeenCalledWith('[perf] live-list-ready');
    });
});
