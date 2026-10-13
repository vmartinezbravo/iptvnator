import { afterNextRender, inject, Injector } from '@angular/core';
import { RuntimeCapabilitiesService } from '@iptvnator/services';

export interface ControlsShortcutHandlers {
    isAvailable: () => boolean;
    /**
     * The player's host element, used to opt out of global shortcuts while
     * an ancestor is `inert` (e.g. behind the workspace's phone context
     * drawer) or marked `data-player-shortcuts-suspended` (a host surface
     * that owns the keyboard itself, such as the programme guide with the
     * player docked): both strip the player of keyboard ownership, but
     * document-level keydown listeners still fire, so shortcuts must check
     * it themselves.
     */
    hostElement?: () => HTMLElement | null;
    canTogglePaused: () => boolean;
    canSeek: () => boolean;
    canAdjustVolume: () => boolean;
    canToggleFullscreen: () => boolean;
    onEscape: () => void;
    togglePaused: () => void;
    toggleFullscreen: () => void;
    seekBy: (deltaSeconds: number) => void;
    adjustVolume: (delta: number) => void;
    toggleMute: () => void;
    /**
     * True on the TV shell, where a remote drives the player: its media keys
     * work whatever button has the focus, and a D-pad press first brings
     * back hidden controls. Elsewhere the browser or OS owns media keys.
     */
    tvRemote?: () => boolean;
    isPaused?: () => boolean;
    controlsVisible?: () => boolean;
    revealAndFocusPlay?: () => void;
}

const DPAD_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Enter',
]);
const REMOTE_SEEK_SECONDS = 10;

const INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'select',
    'summary',
    'textarea',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="combobox"]',
    '[role="link"]',
    '[role="listbox"]',
    '[role^="menuitem"]',
    '[role="option"]',
    '[role="radio"]',
    '[role="slider"]',
    '[role="switch"]',
    '[role="textbox"]',
].join(',');

export class ControlsShortcuts {
    private static readonly instances = new Set<ControlsShortcuts>();
    private static active: ControlsShortcuts | null = null;

    private handlers: ControlsShortcutHandlers | null = null;
    private readonly listener = (event: KeyboardEvent) => this.handle(event);

    attach(handlers: ControlsShortcutHandlers): void {
        this.handlers = handlers;
        ControlsShortcuts.instances.add(this);
        ControlsShortcuts.active ??= this;
        if (typeof document !== 'undefined') {
            document.addEventListener('keydown', this.listener);
        }
    }

    activate(): void {
        if (this.handlers) {
            ControlsShortcuts.active = this;
        }
    }

    detach(): void {
        if (typeof document !== 'undefined') {
            document.removeEventListener('keydown', this.listener);
        }
        this.handlers = null;
        ControlsShortcuts.instances.delete(this);
        if (ControlsShortcuts.active === this) {
            ControlsShortcuts.active = ControlsShortcuts.lastAttachedInstance();
        }
    }

    private handle(event: KeyboardEvent): void {
        const handlers = this.handlers;
        if (!handlers) {
            return;
        }

        // If another mounted controls instance already handled this keypress
        // (it calls preventDefault below), don't double-execute it here.
        if (event.defaultPrevented) {
            return;
        }

        // A player inside an inert region is outside the interaction model
        // entirely — a modal surface above it owns the keyboard. The same
        // applies to a host surface that marks its player container
        // `data-player-shortcuts-suspended` (the programme guide docks the
        // player but keeps the arrows, Space and F for itself). This also
        // covers Escape: the surface above decides what Escape means, not
        // the player it obscures or demotes.
        if (
            handlers
                .hostElement?.()
                ?.closest('[inert], [data-player-shortcuts-suspended]')
        ) {
            return;
        }

        if (event.key === 'Escape') {
            handlers.onEscape();
            return;
        }

        if (handlers.tvRemote?.() && this.handleRemote(event, handlers)) {
            return;
        }

        if (
            this.shouldIgnore(event) ||
            ControlsShortcuts.resolvePlaybackOwner() !== this
        ) {
            return;
        }

        switch (event.key) {
            case ' ':
            case 'k':
            case 'K':
                if (!handlers.canTogglePaused()) {
                    return;
                }
                event.preventDefault();
                handlers.togglePaused();
                return;
            case 'f':
            case 'F':
                if (!handlers.canToggleFullscreen()) {
                    return;
                }
                event.preventDefault();
                handlers.toggleFullscreen();
                return;
            case 'ArrowLeft':
                if (!handlers.canSeek()) {
                    return;
                }
                event.preventDefault();
                handlers.seekBy(-5);
                return;
            case 'ArrowRight':
                if (!handlers.canSeek()) {
                    return;
                }
                event.preventDefault();
                handlers.seekBy(5);
                return;
            case 'ArrowUp':
                if (!handlers.canAdjustVolume()) {
                    return;
                }
                event.preventDefault();
                handlers.adjustVolume(0.05);
                return;
            case 'ArrowDown':
                if (!handlers.canAdjustVolume()) {
                    return;
                }
                event.preventDefault();
                handlers.adjustVolume(-0.05);
                return;
            case 'm':
            case 'M':
                if (!handlers.canAdjustVolume()) {
                    return;
                }
                event.preventDefault();
                handlers.toggleMute();
                return;
        }
    }

    /**
     * The TV remote's keys; true when the event was taken. Media keys skip
     * the interactive-control check (the focus is always on a button there)
     * and, like the D-pad reveal, need this instance to own playback.
     */
    private handleRemote(
        event: KeyboardEvent,
        handlers: ControlsShortcutHandlers
    ): boolean {
        if (
            event.metaKey ||
            event.ctrlKey ||
            event.altKey ||
            ControlsShortcuts.resolvePlaybackOwner() !== this
        ) {
            return false;
        }
        if (DPAD_KEYS.has(event.key)) {
            if (handlers.controlsVisible?.() !== false) return false;
            event.preventDefault();
            handlers.revealAndFocusPlay?.();
            return true;
        }
        const paused = handlers.isPaused?.() ?? false;
        switch (event.key) {
            case 'MediaPlayPause':
            case 'MediaPlay':
            case 'MediaPause':
                if (!handlers.canTogglePaused()) return false;
                event.preventDefault();
                if (
                    event.key === 'MediaPlayPause' ||
                    (event.key === 'MediaPlay') === paused
                ) {
                    handlers.togglePaused();
                }
                return true;
            case 'MediaFastForward':
            case 'MediaRewind':
                if (!handlers.canSeek()) return false;
                event.preventDefault();
                handlers.seekBy(
                    event.key === 'MediaFastForward'
                        ? REMOTE_SEEK_SECONDS
                        : -REMOTE_SEEK_SECONDS
                );
                return true;
            default:
                return false;
        }
    }

    /**
     * Ignore modified playback keys so app/native shortcuts retain ownership,
     * and ignore events originating from an interactive control anywhere in
     * the composed path. Escape is handled before this check so it can still
     * close controls popovers while a modifier key is held.
     */
    private shouldIgnore(event: KeyboardEvent): boolean {
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return true;
        }

        const path =
            typeof event.composedPath === 'function'
                ? event.composedPath()
                : [];
        const nodes = path.length > 0 ? path : [event.target];
        return nodes.some((node) => {
            const element = node as HTMLElement | null;
            if (!element || typeof element.tagName !== 'string') {
                return false;
            }
            if (
                typeof element.matches === 'function' &&
                element.matches(INTERACTIVE_SELECTOR)
            ) {
                return true;
            }
            return element.isContentEditable === true;
        });
    }

    private static resolvePlaybackOwner(): ControlsShortcuts | null {
        if (this.active?.handlers?.isAvailable()) {
            return this.active;
        }

        let fallback: ControlsShortcuts | null = null;
        for (const instance of this.instances) {
            if (instance.handlers?.isAvailable()) {
                fallback = instance;
            }
        }
        this.active = fallback;
        return fallback;
    }

    private static lastAttachedInstance(): ControlsShortcuts | null {
        let last: ControlsShortcuts | null = null;
        for (const instance of this.instances) {
            last = instance;
        }
        return last;
    }
}

type TvRemoteHandlers = Pick<
    ControlsShortcutHandlers,
    'tvRemote' | 'isPaused' | 'controlsVisible' | 'revealAndFocusPlay'
>;

/**
 * The shortcut handlers a TV remote needs: on the native shell its media
 * keys drive playback and a D-pad press over hidden controls brings them
 * back with the focus on play. Call in an injection context.
 */
export function tvRemoteShortcuts(
    view: { isPaused: () => boolean; controlsAreVisible: () => boolean },
    host: HTMLElement,
    reveal: () => void
): TvRemoteHandlers {
    const isNativeShell = inject(RuntimeCapabilitiesService).isNativeShell;
    const injector = inject(Injector);
    return {
        tvRemote: () => isNativeShell,
        isPaused: () => view.isPaused(),
        controlsVisible: () => view.controlsAreVisible(),
        revealAndFocusPlay: () => {
            reveal();
            afterNextRender(
                () =>
                    host
                        .querySelector<HTMLElement>(
                            '[data-test-id="player-controls-play"]'
                        )
                        ?.focus(),
                { injector }
            );
        },
    };
}
