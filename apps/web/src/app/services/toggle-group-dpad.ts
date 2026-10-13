const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
};

type SpatialWindow = Window & { navigate?: (dir: string) => void };

/**
 * Material's button toggle groups take every arrow key: they cycle through
 * their own toggles and select the one they reach. With the D-pad that traps
 * the focus (season Grid/List view) and changes the selection on the way.
 * On the TV shell, arrows inside a group go to spatial navigation instead:
 * they move between the toggles without selecting and leave the group at its
 * edges; OK still selects. Needs the polyfill's `window.navigate`.
 */
export function startToggleGroupDpad(win: Window = window): () => void {
    const onKeydown = (event: KeyboardEvent) => {
        const dir = ARROWS[event.key];
        const navigate = (win as SpatialWindow).navigate;
        const target = event.target as Element | null;
        if (
            !dir ||
            !navigate ||
            event.defaultPrevented ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            !target?.closest?.('.mat-button-toggle-group')
        )
            return;
        event.preventDefault();
        event.stopPropagation();
        navigate(dir);
    };
    win.addEventListener('keydown', onKeydown, { capture: true });
    return () =>
        win.removeEventListener('keydown', onKeydown, { capture: true });
}
