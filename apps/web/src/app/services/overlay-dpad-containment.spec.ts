import { containOverlayDpad } from './overlay-dpad-containment';

/** Fires the polyfill's cancelable event for leaving a container. */
function noTarget(container: HTMLElement): CustomEvent {
    const event = new CustomEvent('navnotarget', {
        bubbles: true,
        cancelable: true,
        detail: { dir: 'left' },
    });
    container.dispatchEvent(event);
    return event;
}

describe('containOverlayDpad', () => {
    let overlays: HTMLElement;
    let dialogContent: HTMLElement;
    let stop: () => void;

    beforeEach(() => {
        document.body.innerHTML =
            '<div class="cdk-overlay-container"><div class="cdk-overlay-pane"><div class="dialog-content"></div></div></div>';
        overlays = document.querySelector(
            '.cdk-overlay-container'
        ) as HTMLElement;
        dialogContent = document.querySelector(
            '.dialog-content'
        ) as HTMLElement;
        stop = containOverlayDpad(overlays);
    });

    afterEach(() => {
        stop();
        document.body.innerHTML = '';
    });

    it('makes the overlay container a spatial navigation container', () => {
        expect(
            overlays.style.getPropertyValue('--spatial-navigation-contain')
        ).toBe('contain');
    });

    it('keeps the D-pad focus inside dialogs and menus', () => {
        expect(noTarget(overlays).defaultPrevented).toBe(true);
    });

    it('still lets the focus leave inner containers of a dialog', () => {
        expect(noTarget(dialogContent).defaultPrevented).toBe(false);
    });

    it('restores the overlay container when stopped', () => {
        stop();

        expect(noTarget(overlays).defaultPrevented).toBe(false);
        expect(
            overlays.style.getPropertyValue('--spatial-navigation-contain')
        ).toBe('');
    });
});
