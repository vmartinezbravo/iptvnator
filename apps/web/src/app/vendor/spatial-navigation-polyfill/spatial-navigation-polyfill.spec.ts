type SpatialWindow = Window & { navigate?: (dir: string) => void };

function rect(top: number, height: number): DOMRect {
    return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 100,
        bottom: top + height,
        width: 100,
        height,
        toJSON: () => ({}),
    } as DOMRect;
}

describe('vendored spatial navigation polyfill', () => {
    const elementFromPoint = jest.fn(() => null);
    let first: HTMLButtonElement;
    let second: HTMLButtonElement;

    beforeAll(async () => {
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: elementFromPoint,
        });
        await import('./spatial-navigation-polyfill.js');
    });

    beforeEach(() => {
        document.body.innerHTML =
            '<button id="first">First</button><button id="second">Second</button>';
        first = document.querySelector('#first') as HTMLButtonElement;
        second = document.querySelector('#second') as HTMLButtonElement;
        const rects = new Map<Element, DOMRect>([
            [first, rect(0, 20)],
            [second, rect(50, 20)],
        ]);
        jest.spyOn(
            Element.prototype,
            'getBoundingClientRect'
        ).mockImplementation(function (this: Element) {
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
        first.focus();

        (window as SpatialWindow).navigate?.('down');

        expect(document.activeElement).toBe(second);
        expect(elementFromPoint).not.toHaveBeenCalled();
    });
});
