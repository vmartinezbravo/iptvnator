import { findTvActions, startTvOptionsKeys, TvAction } from './tv-options-keys';

describe('TV options keys', () => {
    let stop: () => void;
    let open: jest.Mock<void, [readonly TvAction[]]>;
    let card: HTMLElement;
    let plain: HTMLButtonElement;
    let cardClicks: jest.Mock;

    const key = (type: 'keydown' | 'keyup', name: string, target?: Element) => {
        const event = new KeyboardEvent(type, {
            key: name,
            bubbles: true,
            cancelable: true,
        });
        (target ?? document.activeElement ?? document.body).dispatchEvent(
            event
        );
        return event;
    };

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = `
            <div data-tv-item>
                <button id="card">Movie</button>
                <button data-tv-action aria-label="Add to favorites">★</button>
                <button data-tv-action aria-label="Mark as watched" disabled>✓</button>
                <button data-tv-action aria-label="More actions">⋮</button>
            </div>
            <button id="plain">Play</button>`;
        card = document.getElementById('card') as HTMLElement;
        plain = document.getElementById('plain') as HTMLButtonElement;
        cardClicks = jest.fn();
        card.addEventListener('click', cardClicks);
        open = jest.fn();
        stop = startTvOptionsKeys(open);
    });

    afterEach(() => {
        stop();
        jest.useRealTimers();
    });

    it('lists the enabled actions of the focused item, in page order', () => {
        expect(findTvActions(card).map((action) => action.label)).toEqual([
            'Add to favorites',
            'More actions',
        ]);
        expect(findTvActions(plain)).toEqual([]);
    });

    it('presses the button inside a marked component, named by its TV label', () => {
        document.body.innerHTML = `
            <div data-tv-item>
                <button id="play">Play</button>
                <app-detail-icon-button data-tv-action data-tv-label="Remove from favorites">
                    <button aria-label="Favorite">♥</button>
                </app-detail-icon-button>
            </div>`;
        const inner = document.querySelector(
            'app-detail-icon-button button'
        ) as HTMLButtonElement;
        const pressed = jest.fn();
        inner.addEventListener('click', pressed);

        const [action] = findTvActions(document.getElementById('play'));
        action.run();

        expect(action.label).toBe('Remove from favorites');
        expect(pressed).toHaveBeenCalledTimes(1);
    });

    it('offers the actions an item names from elsewhere in the page', () => {
        document.body.innerHTML = `
            <nav data-tv-item data-tv-actions="workspace-command-palette">
                <a id="rail-link" href="/movies">Movies</a>
            </nav>
            <header>
                <button data-tv-action="workspace-command-palette" aria-label="Open command palette">⚡</button>
            </header>`;

        expect(
            findTvActions(document.getElementById('rail-link')).map(
                (action) => action.label
            )
        ).toEqual(['Open command palette']);
    });

    it('runs an action by pressing its hidden button', () => {
        const more = document.querySelector(
            '[aria-label="More actions"]'
        ) as HTMLButtonElement;
        const pressed = jest.fn();
        more.addEventListener('click', pressed);

        findTvActions(card)[1].run();

        expect(pressed).toHaveBeenCalledTimes(1);
    });

    it('opens the options of the focused item with the Menu key', () => {
        card.focus();

        const event = key('keydown', 'ContextMenu');

        expect(event.defaultPrevented).toBe(true);
        expect(open.mock.calls[0][0].map((action) => action.label)).toEqual([
            'Add to favorites',
            'More actions',
        ]);
    });

    it('does nothing with the Menu key where there are no options', () => {
        plain.focus();

        const event = key('keydown', 'ContextMenu');

        expect(event.defaultPrevented).toBe(false);
        expect(open).not.toHaveBeenCalled();
    });

    it('activates the item on a short OK, once it is released', () => {
        card.focus();

        expect(key('keydown', 'Enter').defaultPrevented).toBe(true);
        expect(cardClicks).not.toHaveBeenCalled();
        key('keyup', 'Enter');

        expect(cardClicks).toHaveBeenCalledTimes(1);
        expect(open).not.toHaveBeenCalled();
    });

    it('opens the options instead on a long OK, held past half a second', () => {
        card.focus();

        key('keydown', 'Enter');
        jest.advanceTimersByTime(500);
        key('keyup', 'Enter');

        expect(open).toHaveBeenCalledTimes(1);
        expect(cardClicks).not.toHaveBeenCalled();
    });

    it('opens the options on a held OK that repeats before its release', () => {
        card.focus();

        key('keydown', 'Enter');
        key('keydown', 'Enter');
        key('keydown', 'Enter');
        key('keyup', 'Enter');

        expect(open).toHaveBeenCalledTimes(1);
        expect(cardClicks).not.toHaveBeenCalled();
    });

    it('leaves OK alone on elements without options', () => {
        plain.focus();

        expect(key('keydown', 'Enter').defaultPrevented).toBe(false);
    });
});
