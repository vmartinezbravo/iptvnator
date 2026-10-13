import { startTvOptionsHint } from './tv-options-hint';

describe('startTvOptionsHint', () => {
    let stop: () => void;

    const hint = () =>
        document.querySelector('.tv-options-hint') as HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = `
            <div data-tv-item>
                <button id="card">Movie</button>
                <button data-tv-action aria-label="More actions">⋮</button>
            </div>
            <button id="plain">Play</button>`;
        stop = startTvOptionsHint(() => 'Menu / hold OK: options');
    });

    afterEach(() => stop());

    it('stays hidden until an element with options has the focus', () => {
        expect(hint().hidden).toBe(true);

        (document.getElementById('card') as HTMLElement).focus();

        expect(hint().hidden).toBe(false);
        expect(hint().textContent).toBe('Menu / hold OK: options');
    });

    it('goes away on an element without options', () => {
        (document.getElementById('card') as HTMLElement).focus();
        (document.getElementById('plain') as HTMLElement).focus();

        expect(hint().hidden).toBe(true);
    });

    it('is removed when stopped', () => {
        stop();

        expect(document.querySelector('.tv-options-hint')).toBeNull();
        stop = () => undefined;
    });
});
