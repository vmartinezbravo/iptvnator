import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { TranslateModule } from '@ngx-translate/core';
import {
    DEFAULT_PLAYER_CAPABILITIES,
    createEmptyControlsState,
} from './player-controls-defaults';
import { PlayerControlsComponent } from './player-controls.component';
import type {
    PlayerControlsCommands,
    PlayerController,
} from './player-controls.model';

describe('PlayerControlsComponent with a TV remote', () => {
    let fixture: ComponentFixture<PlayerControlsComponent>;
    let commands: Pick<jest.Mocked<PlayerControlsCommands>, 'togglePlay'>;

    const press = (key: string) => {
        const event = new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
        });
        document.dispatchEvent(event);
        fixture.detectChanges();
        return event.defaultPrevented;
    };
    const playButton = () =>
        (fixture.nativeElement as HTMLElement).querySelector(
            '[data-test-id="player-controls-play"]'
        );

    beforeEach(async () => {
        jest.useFakeTimers();
        await TestBed.configureTestingModule({
            imports: [PlayerControlsComponent, TranslateModule.forRoot()],
            providers: [
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: { isNativeShell: true },
                },
            ],
        }).compileComponents();
        commands = { togglePlay: jest.fn() };
        const controller = {
            capabilities: signal({ ...DEFAULT_PLAYER_CAPABILITIES }),
            state: signal({
                ...createEmptyControlsState(),
                status: 'playing' as const,
            }),
            commands: commands as unknown as PlayerControlsCommands,
        } satisfies PlayerController;
        fixture = TestBed.createComponent(PlayerControlsComponent);
        fixture.componentRef.setInput('controller', controller);
        fixture.detectChanges();
    });

    afterEach(() => {
        fixture.destroy();
        jest.useRealTimers();
    });

    it('D-pad press reveals hidden controls and focuses play', () => {
        jest.advanceTimersByTime(10000);
        fixture.detectChanges();
        expect(fixture.componentInstance.controlsAreVisible()).toBe(false);

        expect(press('ArrowDown')).toBe(true);

        expect(fixture.componentInstance.controlsAreVisible()).toBe(true);
        expect(document.activeElement).toBe(playButton());
    });

    it('toggles playback with the remote play/pause key', () => {
        expect(press('MediaPlayPause')).toBe(true);
        expect(commands.togglePlay).toHaveBeenCalledTimes(1);
    });
});
