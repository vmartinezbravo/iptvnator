import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import {
    ChannelScrollFocusDirective,
    focusLiveChannels,
} from './channel-scroll-focus.directive';

@Component({
    imports: [ChannelScrollFocusDirective],
    template: `
        <div id="portal-categories">
            <button aria-current="true" (keydown)="enter($event)">News</button>
            <button (keydown)="enter($event)">Sport</button>
        </div>
        <div appChannelScrollFocus id="live-channels" aria-label="Channels">
            <div class="channel-list-item">
                <button class="channel-content">Channel</button>
                <button class="favorite-button">Favorite</button>
            </div>
            <input />
        </div>
    `,
})
class Host {
    readonly enter = focusLiveChannels;
}

describe('Channel scroll focus', () => {
    let fixture: ComponentFixture<Host>;
    let pane: HTMLElement;
    let category: HTMLButtonElement;
    let action: HTMLButtonElement;
    const key = (element: HTMLElement, key: string, modifiers = {}) => {
        const event = new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
            ...modifiers,
        });
        element.dispatchEvent(event);
        return event;
    };

    beforeEach(() => {
        fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        pane = fixture.nativeElement.querySelector('#live-channels');
        category = fixture.nativeElement.querySelector(
            '#portal-categories button'
        );
        action = pane.querySelector('.channel-content')!;
        pane.checkVisibility = () => true;
        category.checkVisibility = () => true;
    });

    it('transfers focus both ways without clicks or scroll resets', () => {
        const click = jest.fn();
        pane.addEventListener('click', click);
        pane.scrollTop = 400;
        category.focus();
        expect(key(category, 'ArrowRight').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(pane);
        expect(pane.scrollTop).toBe(400);
        expect(key(pane, 'ArrowLeft').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(category);
        expect(click).not.toHaveBeenCalled();
    });

    it('does not transfer from unselected categories, modified keys or into hidden/inert panes', () => {
        const other = category.nextElementSibling as HTMLElement;
        other.focus();
        key(other, 'ArrowRight');
        expect(document.activeElement).toBe(other);
        category.focus();
        key(category, 'ArrowRight', { ctrlKey: true });
        expect(document.activeElement).toBe(category);
        pane.checkVisibility = () => false;
        key(category, 'ArrowRight');
        expect(document.activeElement).toBe(category);
        pane.checkVisibility = () => true;
        pane.classList.add('sidebar-collapsed');
        key(category, 'ArrowRight');
        expect(document.activeElement).toBe(category);
        pane.classList.remove('sidebar-collapsed');
        pane.setAttribute('inert', '');
        key(category, 'ArrowRight');
        expect(document.activeElement).toBe(category);
    });

    it('keeps pointer selection in the scroll owner but preserves keyboard activation and row actions', () => {
        action.focus();
        action.dispatchEvent(
            new MouseEvent('click', { bubbles: true, detail: 1 })
        );
        expect(document.activeElement).toBe(pane);
        action.focus();
        action.click();
        expect(document.activeElement).toBe(action);
        const favorite =
            pane.querySelector<HTMLButtonElement>('.favorite-button')!;
        favorite.focus();
        favorite.dispatchEvent(
            new MouseEvent('click', { bubbles: true, detail: 1 })
        );
        expect(document.activeElement).toBe(favorite);
    });

    it.each(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])(
        'retains native %s scrolling when a virtual row is recycled',
        (name) => {
            const globalKey = jest.fn();
            document.addEventListener('keydown', globalKey);
            try {
                action.focus();
                const event = key(action, name);
                expect(event.defaultPrevented).toBe(false);
                expect(document.activeElement).toBe(pane);
                action.remove();
                expect(document.activeElement).toBe(pane);
                expect(globalKey).not.toHaveBeenCalled();
            } finally {
                document.removeEventListener('keydown', globalKey);
            }
        }
    );

    it('leaves Tab, Shift+Tab, Enter, Space on buttons and input keys alone', () => {
        for (const name of ['Tab', 'Enter', ' ']) {
            action.focus();
            expect(key(action, name).defaultPrevented).toBe(false);
            expect(document.activeElement).toBe(action);
        }
        expect(key(action, 'Tab', { shiftKey: true }).defaultPrevented).toBe(
            false
        );
        const input = pane.querySelector('input')!;
        input.focus();
        key(input, 'ArrowLeft');
        key(input, 'ArrowDown');
        expect(document.activeElement).toBe(input);
    });

    it('does not refocus when rows update asynchronously', () => {
        category.focus();
        pane.append(document.createElement('button'));
        fixture.detectChanges();
        expect(document.activeElement).toBe(category);
    });
});

@Component({
    imports: [ChannelScrollFocusDirective],
    template: `
        <div appChannelScrollFocus id="live-channels" aria-label="Channels">
            @for (name of channels; track name) {
                <div class="channel-list-item">
                    <button class="channel-content">{{ name }}</button>
                    <button class="favorite-button">Favorite</button>
                </div>
            }
        </div>
    `,
})
class TvHost {
    readonly channels = ['One', 'Two', 'Three'];
}

describe('Channel scroll focus on a native shell (D-pad)', () => {
    let pane: HTMLElement;
    let rows: HTMLButtonElement[];
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
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: { isNativeShell: true },
                },
            ],
        });
        const fixture = TestBed.createComponent(TvHost);
        fixture.detectChanges();
        pane = fixture.nativeElement.querySelector('#live-channels');
        rows = Array.from(pane.querySelectorAll('button.channel-content'));
    });

    it('moves the focus to the next and previous channel row', () => {
        rows[0].focus();

        expect(key(rows[0], 'ArrowDown').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(rows[1]);
        expect(key(rows[1], 'ArrowDown').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(rows[2]);
        expect(key(rows[2], 'ArrowUp').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(rows[1]);
    });

    it('enters the rows from the pane', () => {
        pane.focus();

        expect(key(pane, 'ArrowDown').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(rows[0]);
    });

    it('keeps the focus on the first and last rows at the ends of the list', () => {
        rows[2].focus();
        expect(key(rows[2], 'ArrowDown').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(rows[2]);

        rows[0].focus();
        expect(key(rows[0], 'ArrowUp').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(rows[0]);
    });

    it('leaves the favorite buttons to spatial navigation', () => {
        const favorite = pane.querySelector<HTMLElement>('.favorite-button')!;
        favorite.focus();

        expect(key(favorite, 'ArrowDown').defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(favorite);
    });
});
