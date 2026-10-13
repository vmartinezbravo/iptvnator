/** An option of the focused item: a button the TV shell hides from the D-pad. */
export interface TvAction {
    readonly label: string;
    readonly run: () => void;
}

/** How long OK is held before it opens the options instead. */
export const LONG_PRESS_MS = 500;

/**
 * The options of the item that holds `from`: the enabled `[data-tv-action]`
 * buttons inside its closest `[data-tv-item]`, in page order. A mark on a
 * component stands for the button inside it. The label is the mark's
 * `data-tv-label`, else the button's own (translated) aria-label.
 */
export function findTvActions(from: Element | null): TvAction[] {
    const item = from?.closest('[data-tv-item]');
    if (!item) return [];
    return Array.from(item.querySelectorAll<HTMLElement>('[data-tv-action]'))
        .map((mark) => ({
            mark,
            button: (mark instanceof HTMLButtonElement
                ? mark
                : mark.querySelector('button')) as HTMLButtonElement | null,
        }))
        .filter(({ button }) => button && !button.disabled)
        .map(({ mark, button }) => ({
            label: (
                mark.dataset['tvLabel'] ??
                button?.getAttribute('aria-label') ??
                button?.textContent ??
                ''
            ).trim(),
            run: () => button?.click(),
        }));
}

/**
 * On the TV shell, the remote's Menu key (forwarded by MainActivity as a
 * ContextMenu key) or a long OK opens the options of the focused item. On
 * items with options, OK therefore acts on release: a short press still
 * activates the item, a press held for `LONG_PRESS_MS` (or one the remote
 * repeats) opens the options instead.
 */
export function startTvOptionsKeys(
    open: (actions: readonly TvAction[]) => void,
    win: Window = window
): () => void {
    let held: { target: HTMLElement; timer: number; long: boolean } | null =
        null;

    const openFor = (target: Element | null) => {
        const actions = findTvActions(target);
        if (actions.length === 0) return false;
        open(actions);
        return true;
    };

    const onKeydown = (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const target = win.document.activeElement as HTMLElement | null;
        if (event.key === 'ContextMenu') {
            if (openFor(target)) event.preventDefault();
            return;
        }
        if (event.key !== 'Enter') return;
        if (held) {
            // The remote repeats a held OK: it is a long press.
            event.preventDefault();
            event.stopPropagation();
            if (!held.long) {
                held.long = true;
                win.clearTimeout(held.timer);
                openFor(held.target);
            }
            return;
        }
        if (!target || findTvActions(target).length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const press = {
            target,
            long: false,
            timer: win.setTimeout(() => {
                press.long = true;
                openFor(target);
            }, LONG_PRESS_MS),
        };
        held = press;
    };

    const onKeyup = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || !held) return;
        const press = held;
        held = null;
        event.preventDefault();
        event.stopPropagation();
        win.clearTimeout(press.timer);
        if (!press.long) press.target.click();
    };

    win.addEventListener('keydown', onKeydown, true);
    win.addEventListener('keyup', onKeyup, true);
    return () => {
        win.removeEventListener('keydown', onKeydown, true);
        win.removeEventListener('keyup', onKeyup, true);
        if (held) win.clearTimeout(held.timer);
    };
}
