import { Directive, ElementRef, inject } from '@angular/core';
import { RuntimeCapabilitiesService } from '@iptvnator/services';

const HIDDEN_PANE = '[inert], .sidebar-collapsed, .context-panel--collapsed';

const SCROLL_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'PageUp',
    'PageDown',
    'Home',
    'End',
    ' ',
]);

function unmodified(event: KeyboardEvent): boolean {
    return (
        !event.defaultPrevented &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
    );
}

/** Enter the visible live pane without selecting a channel or starting playback. */
export function focusLiveChannels(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' || !unmodified(event)) return;
    const category = event.currentTarget as HTMLElement;
    if (category.getAttribute('aria-current') !== 'true') return;
    const pane = category.ownerDocument.getElementById('live-channels');
    if (
        !pane?.checkVisibility({ checkVisibilityCSS: true }) ||
        pane.closest(HIDDEN_PANE)
    )
        return;
    event.preventDefault();
    event.stopPropagation();
    pane.focus({ preventScroll: true });
}

/** Native scroll ownership survives CDK row recycling; row actions remain buttons. */
@Directive({
    selector: '[appChannelScrollFocus]',
    host: {
        tabindex: '0',
        role: 'region',
        class: 'channel-scroll-focus',
        '(click)': 'onClick($event)',
        '(keydown)': 'onKeydown($event)',
    },
})
export class ChannelScrollFocusDirective {
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    /**
     * On the TV shell the D-pad moves row by row: there native scrolling would
     * leave the focus behind, and the WebView's own spatial navigation jumps
     * to the favorite buttons.
     */
    private readonly dpadRows = inject(RuntimeCapabilitiesService)
        .isNativeShell;

    onClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (event.detail <= 0 || !target.closest('.channel-list-item')) return;
        if (
            target.closest(
                'button:not(.channel-content), a, input, select, textarea'
            )
        )
            return;
        this.host.nativeElement.focus({ preventScroll: true });
    }

    onKeydown(event: KeyboardEvent): void {
        const pane = this.host.nativeElement;
        const target = event.target as HTMLElement;
        if (!unmodified(event) || pane.closest(HIDDEN_PANE)) return;
        const rowAction = target.matches('button.channel-content');
        if (target !== pane && !rowAction) return;

        if (event.key === 'ArrowLeft' && pane.id === 'live-channels') {
            const category = pane.ownerDocument.querySelector<HTMLElement>(
                '#portal-categories [aria-current="true"]'
            );
            if (
                !category?.checkVisibility({ checkVisibilityCSS: true }) ||
                category.closest(HIDDEN_PANE)
            )
                return;
            event.preventDefault();
            event.stopPropagation();
            category.focus({ preventScroll: true });
        } else if (
            this.dpadRows &&
            (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        ) {
            event.preventDefault();
            event.stopPropagation();
            this.focusRow(target, event.key === 'ArrowDown' ? 1 : -1);
        } else if (
            SCROLL_KEYS.has(event.key) &&
            !(rowAction && event.key === ' ')
        ) {
            // Do not preventDefault: Chromium owns scroll distance, repetition,
            // PageUp/PageDown and Shift+Space. Only silence global player keys.
            event.stopPropagation();
            pane.focus({ preventScroll: true });
        }
    }

    /**
     * Moves to the row above or below; from the pane, to the first visible
     * row. CDK renders a buffer beyond the viewport, so the next row exists
     * and focusing it scrolls it into view.
     */
    private focusRow(from: HTMLElement, step: 1 | -1): void {
        const pane = this.host.nativeElement;
        const rows = Array.from(
            pane.querySelectorAll<HTMLElement>(
                '.channel-list-item button.channel-content'
            )
        );
        if (from === pane) {
            const top = pane.getBoundingClientRect().top;
            const first =
                rows.find((row) => row.getBoundingClientRect().bottom > top) ??
                rows[0];
            first?.focus();
            return;
        }
        rows[rows.indexOf(from) + step]?.focus();
    }
}
