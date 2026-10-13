const CONTAIN = '--spatial-navigation-contain';

/**
 * Keeps the D-pad inside CDK overlays (dialogs, menus) on the TV shell.
 * The repo copy of the spatial navigation polyfill no longer hit-tests what
 * a dialog backdrop covers, so without this the arrows would leave a dialog
 * for the page behind it. The polyfill reads `--spatial-navigation-contain`
 * from inline styles only, which makes the overlay container a navigation
 * container, and it asks before leaving one with a cancelable
 * `navnotarget` event, which is refused here.
 */
export function containOverlayDpad(container: HTMLElement): () => void {
    const refuseToLeave = (event: Event) => {
        if (event.target === container) event.preventDefault();
    };
    container.style.setProperty(CONTAIN, 'contain');
    container.addEventListener('navnotarget', refuseToLeave);
    return () => {
        container.style.removeProperty(CONTAIN);
        container.removeEventListener('navnotarget', refuseToLeave);
    };
}
