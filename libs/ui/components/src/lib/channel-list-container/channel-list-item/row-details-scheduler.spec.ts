import { TestBed } from '@angular/core/testing';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { RowDetailsScheduler } from './row-details-scheduler';

function setUp(isNativeShell: boolean): RowDetailsScheduler {
    TestBed.configureTestingModule({
        providers: [
            {
                provide: RuntimeCapabilitiesService,
                useValue: { isNativeShell },
            },
        ],
    });
    return TestBed.inject(RowDetailsScheduler);
}

describe('RowDetailsScheduler', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('defers row details only on a native shell', () => {
        expect(setUp(true).defers).toBe(true);
        TestBed.resetTestingModule();
        expect(setUp(false).defers).toBe(false);
    });

    it('runs every row queued in a frame together, after the next paint', () => {
        const scheduler = setUp(true);
        const ran: string[] = [];
        const rafSpy = jest.spyOn(window, 'requestAnimationFrame');

        scheduler.afterNextPaint(() => ran.push('a'));
        scheduler.afterNextPaint(() => ran.push('b'));

        expect(rafSpy).toHaveBeenCalledTimes(1);
        expect(ran).toEqual([]);
        jest.advanceTimersByTime(16);
        expect(ran).toEqual([]);
        jest.runOnlyPendingTimers();
        expect(ran).toEqual(['a', 'b']);
    });

    it('skips a row cancelled before the paint', () => {
        const scheduler = setUp(true);
        const ran: string[] = [];

        const cancel = scheduler.afterNextPaint(() => ran.push('gone'));
        scheduler.afterNextPaint(() => ran.push('kept'));
        cancel();
        jest.runAllTimers();

        expect(ran).toEqual(['kept']);
    });

    it('schedules a new frame for rows queued after a flush', () => {
        const scheduler = setUp(true);
        const ran: string[] = [];

        scheduler.afterNextPaint(() => ran.push('first'));
        jest.runAllTimers();
        scheduler.afterNextPaint(() => ran.push('second'));
        jest.runAllTimers();

        expect(ran).toEqual(['first', 'second']);
    });
});
