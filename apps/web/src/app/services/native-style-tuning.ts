import { RuntimeCapabilitiesService } from '@iptvnator/services';

/**
 * Angular Material's `.mat-mdc-menu-item:has(.material-icons, mat-icon,
 * [matButtonIcon])` makes the Fire TV WebView recalculate the style of the
 * whole document on every DOM insertion (a tooltip, a list row): 120–160 ms
 * on the Stick, 1 ms without it. It only swaps the item padding for the
 * "with icon" tokens, which equal the plain ones in this theme (12px), so
 * dropping it changes nothing on screen.
 */
const COSTLY_SELECTOR = '.mat-mdc-menu-item:has(';

function removeCostlyRules(rules: CSSRuleList): void {
    for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i] as CSSStyleRule & CSSGroupingRule;
        if (rule.selectorText?.includes(COSTLY_SELECTOR)) {
            const parent =
                (rule.parentRule as CSSGroupingRule | null) ??
                rule.parentStyleSheet;
            parent?.deleteRule(i);
        } else if (rule.cssRules) {
            removeCostlyRules(rule.cssRules);
        }
    }
}

function tuneSheet(sheet: CSSStyleSheet | null): void {
    try {
        if (sheet) removeCostlyRules(sheet.cssRules);
    } catch {
        // Cross-origin sheets cannot be read; ours are all same-origin.
    }
}

/**
 * On the native shell, marks the document with `native-shell` (the hook for
 * the Stick's style overrides in styles.scss) and strips the costly Material
 * rules from the styles in the document and from component styles Angular
 * adds later. Returns a stop function.
 */
export function startNativeStyleTuning(
    runtime: RuntimeCapabilitiesService,
    doc: Document = document
): () => void {
    if (!runtime.isNativeShell) return () => undefined;

    doc.documentElement.classList.add('native-shell');
    Array.from(doc.styleSheets).forEach(tuneSheet);
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLStyleElement) tuneSheet(node.sheet);
                if (node instanceof HTMLLinkElement) {
                    node.addEventListener('load', () => tuneSheet(node.sheet), {
                        once: true,
                    });
                }
            });
        }
    });
    observer.observe(doc.head, { childList: true });
    return () => observer.disconnect();
}
