import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { startNativeStyleTuning } from './native-style-tuning';

const MENU_ITEM_HAS =
    '.mat-mdc-menu-item:has(.material-icons, mat-icon, [matButtonIcon]) { padding-left: 12px; }';
const RTL_MENU_ITEM_HAS =
    '[dir=rtl] .mat-mdc-menu-item:has(.material-icons, mat-icon, [matButtonIcon]) { padding-right: 12px; }';
const MENU_ITEM = '.mat-mdc-menu-item { min-height: 48px; }';

function addStyle(css: string): HTMLStyleElement {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
}

function selectors(style: HTMLStyleElement): string[] {
    return Array.from(style.sheet?.cssRules ?? []).map(
        (rule) => (rule as CSSStyleRule).selectorText
    );
}

const runtime = (isNativeShell: boolean) =>
    ({ isNativeShell }) as RuntimeCapabilitiesService;

describe('startNativeStyleTuning', () => {
    let stop: () => void;

    afterEach(() => {
        stop?.();
        document.head.innerHTML = '';
        document.documentElement.classList.remove('native-shell');
    });

    it('removes the Material menu-item :has rules already in the document', () => {
        const style = addStyle(MENU_ITEM + MENU_ITEM_HAS + RTL_MENU_ITEM_HAS);

        stop = startNativeStyleTuning(runtime(true), document);

        expect(selectors(style)).toEqual(['.mat-mdc-menu-item']);
    });

    it('removes them from component styles added later', async () => {
        stop = startNativeStyleTuning(runtime(true), document);

        const style = addStyle(MENU_ITEM_HAS + MENU_ITEM);
        await Promise.resolve();

        expect(selectors(style)).toEqual(['.mat-mdc-menu-item']);
    });

    it('removes them inside grouping rules', () => {
        const style = addStyle(`@media (min-width: 1px) { ${MENU_ITEM_HAS} ${MENU_ITEM} }`);

        stop = startNativeStyleTuning(runtime(true), document);

        const media = style.sheet?.cssRules[0] as CSSMediaRule;
        expect(
            Array.from(media.cssRules).map(
                (rule) => (rule as CSSStyleRule).selectorText
            )
        ).toEqual(['.mat-mdc-menu-item']);
    });

    it('marks the document as a native shell for its style overrides', () => {
        stop = startNativeStyleTuning(runtime(true), document);

        expect(
            document.documentElement.classList.contains('native-shell')
        ).toBe(true);
    });

    it('leaves the styles untouched outside a native shell', async () => {
        const style = addStyle(MENU_ITEM_HAS);

        stop = startNativeStyleTuning(runtime(false), document);
        const later = addStyle(MENU_ITEM_HAS);
        await Promise.resolve();

        expect(selectors(style)).toHaveLength(1);
        expect(selectors(later)).toHaveLength(1);
        expect(
            document.documentElement.classList.contains('native-shell')
        ).toBe(false);
    });
});
