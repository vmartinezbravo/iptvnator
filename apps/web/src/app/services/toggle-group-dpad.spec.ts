import { startToggleGroupDpad } from './toggle-group-dpad';

describe('startToggleGroupDpad', () => {
    let stop: () => void;
    let navigate: jest.Mock;
    let groupKeydown: jest.Mock;
    let first: HTMLButtonElement;
    let outside: HTMLButtonElement;

    const key = (element: HTMLElement, key: string) => {
        const event = new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(event);
        return event;
    };

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="mat-button-toggle-group">
                <button id="grid">Grid view</button>
                <button id="list">List view</button>
            </div>
            <button id="outside">Play</button>`;
        first = document.querySelector('#grid') as HTMLButtonElement;
        outside = document.querySelector('#outside') as HTMLButtonElement;
        // Stands in for MatButtonToggleGroup's own (keydown) handler.
        groupKeydown = jest.fn();
        document
            .querySelector('.mat-button-toggle-group')
            ?.addEventListener('keydown', groupKeydown);
        navigate = jest.fn();
        (window as unknown as { navigate: jest.Mock }).navigate = navigate;
        stop = startToggleGroupDpad(window);
    });

    afterEach(() => {
        stop();
        delete (window as unknown as { navigate?: unknown }).navigate;
        document.body.innerHTML = '';
    });

    it.each([
        ['ArrowLeft', 'left'],
        ['ArrowRight', 'right'],
        ['ArrowUp', 'up'],
        ['ArrowDown', 'down'],
    ])(
        'moves %s spatially out of a toggle group without selecting',
        (name, dir) => {
            first.focus();

            const event = key(first, name);

            expect(navigate).toHaveBeenCalledWith(dir);
            expect(event.defaultPrevented).toBe(true);
            expect(groupKeydown).not.toHaveBeenCalled();
        }
    );

    it('leaves Enter to the toggle group, which selects', () => {
        first.focus();

        expect(key(first, 'Enter').defaultPrevented).toBe(false);
        expect(groupKeydown).toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves arrows outside toggle groups alone', () => {
        outside.focus();

        expect(key(outside, 'ArrowDown').defaultPrevented).toBe(false);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('stops when asked', () => {
        stop();
        first.focus();

        key(first, 'ArrowDown');

        expect(navigate).not.toHaveBeenCalled();
        expect(groupKeydown).toHaveBeenCalled();
    });
});
