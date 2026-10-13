import { NavigationEnd, NavigationStart, Event as RouterEvent } from '@angular/router';
import { Subject } from 'rxjs';
import { startSectionSwitchBar } from './section-switch-bar';

describe('startSectionSwitchBar', () => {
    let stop: () => void;
    let navigate: jest.Mock;
    let events: Subject<RouterEvent>;
    let frames: (() => void)[];
    let movies: HTMLAnchorElement;
    let live: HTMLAnchorElement;
    let other: HTMLAnchorElement;

    const switching = () =>
        document.documentElement.classList.contains('section-switching');
    const nextFrame = () => frames.splice(0).forEach((run) => run());
    const click = (element: HTMLElement, init: MouseEventInit = {}) => {
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
            ...init,
        });
        element.dispatchEvent(event);
        return event;
    };

    beforeEach(() => {
        window.history.replaceState(null, '', '/workspace/xtreams/1/live');
        document.body.innerHTML = `
            <nav>
                <a class="portal-rail-link" href="/workspace/xtreams/1/vod">Movies</a>
                <a class="portal-rail-link" href="/workspace/xtreams/1/live">Live TV</a>
            </nav>
            <a id="other" href="/workspace/settings">Settings</a>`;
        [movies, live] = Array.from(
            document.querySelectorAll<HTMLAnchorElement>('.portal-rail-link')
        );
        other = document.getElementById('other') as HTMLAnchorElement;
        navigate = jest.fn();
        events = new Subject<RouterEvent>();
        frames = [];
        stop = startSectionSwitchBar({
            navigate,
            events,
            afterPaint: (run) => frames.push(run),
        });
    });

    afterEach(() => {
        stop();
        document.documentElement.classList.remove('section-switching');
    });

    it('shows the bar first and opens the section after the next paint', () => {
        const event = click(movies);

        expect(event.defaultPrevented).toBe(true);
        expect(switching()).toBe(true);
        expect(navigate).not.toHaveBeenCalled();

        nextFrame();

        expect(navigate).toHaveBeenCalledWith('/workspace/xtreams/1/vod');
    });

    it('hides the bar once the new section has rendered', () => {
        click(movies);
        nextFrame();
        events.next(new NavigationStart(1, '/workspace/xtreams/1/vod'));
        events.next(
            new NavigationEnd(
                1,
                '/workspace/xtreams/1/vod',
                '/workspace/xtreams/1/vod'
            )
        );

        expect(switching()).toBe(true);
        nextFrame();
        expect(switching()).toBe(false);
    });

    it('adds a single bar element, hidden from assistive technology', () => {
        const bars = document.querySelectorAll('.section-switch-bar');

        expect(bars).toHaveLength(1);
        expect(bars[0].getAttribute('aria-hidden')).toBe('true');
    });

    it('leaves the link of the section on screen, other links and modified clicks alone', () => {
        for (const event of [
            click(live),
            click(other),
            click(movies, { ctrlKey: true }),
        ]) {
            expect(event.defaultPrevented).toBe(false);
        }
        expect(switching()).toBe(false);
        expect(frames).toHaveLength(0);
    });
});
