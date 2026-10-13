type SpatialWindow = Window & { navigate?: (dir: string) => void };

function rect(top: number, height: number): DOMRect {
    return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: height ? 100 : 0,
        bottom: top + height,
        width: height ? 100 : 0,
        height,
        toJSON: () => ({}),
    } as DOMRect;
}

const navigate = (dir: string) => (window as SpatialWindow).navigate?.(dir);

describe('vendored spatial navigation polyfill', () => {
    const elementFromPoint = jest.fn(() => null);
    let rects: Map<Element, DOMRect>;
    let button: (id: string) => HTMLButtonElement;

    beforeAll(async () => {
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: elementFromPoint,
        });
        await import('./spatial-navigation-polyfill.js');
        // Binds the polyfill's keydown and focusin listeners.
        window.dispatchEvent(new Event('load'));
    });

    beforeEach(() => {
        document.body.innerHTML = ['a', 'b', 'c', 'd']
            .map((id) => `<button id="${id}">${id}</button>`)
            .join('');
        button = (id) => document.getElementById(id) as HTMLButtonElement;
        rects = new Map<Element, DOMRect>([
            [button('a'), rect(0, 20)],
            [button('b'), rect(50, 20)],
            [button('c'), rect(100, 20)],
            [button('d'), rect(150, 20)],
        ]);
        jest.spyOn(
            Element.prototype,
            'getBoundingClientRect'
        ).mockImplementation(function (this: Element) {
            if (!this.isConnected) return rect(0, 0);
            return rects.get(this) ?? rect(0, 400);
        });
        for (const name of ['clientHeight', 'clientWidth']) {
            Object.defineProperty(document.documentElement, name, {
                configurable: true,
                value: 400,
            });
        }
        elementFromPoint.mockClear();
    });

    afterEach(() => jest.restoreAllMocks());

    it('treats candidates inside the viewport as visible without hit-testing points', () => {
        button('a').focus();

        navigate('down');

        expect(document.activeElement).toBe(button('b'));
        expect(elementFromPoint).not.toHaveBeenCalled();
    });

    it('keeps going from where a focused element was when it is hidden in place', () => {
        button('b').focus();
        rects.set(button('b'), rect(50, 0));

        navigate('down');

        expect(document.activeElement).toBe(button('c'));
    });

    it('forgets the hidden element position once the focus reaches another element', () => {
        button('b').focus();
        rects.set(button('b'), rect(50, 0));
        navigate('down');
        rects.set(button('b'), rect(50, 20));
        button('d').focus();

        navigate('up');

        expect(document.activeElement).toBe(button('c'));
    });

    it('forgets the position of a focused element that left the page', () => {
        button('b').focus();
        button('b').remove();

        // From the page, not from where b was (which would pick a).
        navigate('up');

        expect(document.activeElement).toBe(button('d'));
    });
});
