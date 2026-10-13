import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { WorkspaceBackNavigationService } from '@iptvnator/portal/shared/data-access';
import { ConfirmDialogData, DialogService } from '@iptvnator/ui/components';
import { WorkspaceStartupPreferencesService } from '@iptvnator/workspace/shell/util';
import {
    TV_APP_EXIT,
    TvBackNavigationService,
} from './tv-back-navigation.service';

describe('TvBackNavigationService', () => {
    let openDialogs: { close: jest.Mock }[];
    let overlay: HTMLElement;
    let goBack: jest.Mock;
    let navigateByUrl: jest.Mock;
    let url: string;
    let confirm: jest.Mock;
    let exitApp: jest.Mock;
    let exitFullscreen: jest.Mock;
    let fullscreenElement: Element | null;

    beforeEach(() => {
        openDialogs = [];
        overlay = document.createElement('div');
        goBack = jest.fn(() => false);
        navigateByUrl = jest.fn(async () => true);
        url = '/workspace/dashboard';
        confirm = jest.fn();
        exitApp = jest.fn(async () => undefined);
        exitFullscreen = jest.fn(async () => undefined);
        fullscreenElement = null;
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => fullscreenElement,
        });
        Object.defineProperty(document, 'exitFullscreen', {
            configurable: true,
            value: exitFullscreen,
        });

        TestBed.configureTestingModule({
            providers: [
                { provide: MatDialog, useValue: { openDialogs } },
                {
                    provide: OverlayContainer,
                    useValue: { getContainerElement: () => overlay },
                },
                {
                    provide: WorkspaceBackNavigationService,
                    useValue: { goBack },
                },
                {
                    provide: Router,
                    useValue: {
                        get url() {
                            return url;
                        },
                        navigateByUrl,
                    },
                },
                {
                    provide: WorkspaceStartupPreferencesService,
                    useValue: {
                        getFirstAvailableWorkspacePath: () =>
                            '/workspace/dashboard',
                    },
                },
                {
                    provide: DialogService,
                    useValue: { openConfirmDialog: confirm },
                },
                {
                    provide: TranslateService,
                    useValue: { instant: (key: string) => key },
                },
                { provide: TV_APP_EXIT, useValue: exitApp },
            ],
        });
    });

    afterEach(() => {
        delete (document as unknown as { fullscreenElement?: unknown })
            .fullscreenElement;
        delete (document as unknown as { exitFullscreen?: unknown })
            .exitFullscreen;
    });

    const handleBack = () =>
        TestBed.inject(TvBackNavigationService).handleBack();

    it('closes the top dialog', async () => {
        const below = { close: jest.fn() };
        const top = { close: jest.fn() };
        openDialogs.push(below, top);

        await expect(handleBack()).resolves.toBe('dialog');
        expect(top.close).toHaveBeenCalled();
        expect(below.close).not.toHaveBeenCalled();
    });

    it('closes an open menu through its backdrop', async () => {
        const backdrop = document.createElement('div');
        backdrop.className = 'cdk-overlay-backdrop';
        const click = jest.fn();
        backdrop.addEventListener('click', click);
        overlay.append(backdrop);

        await expect(handleBack()).resolves.toBe('overlay');
        expect(click).toHaveBeenCalled();
    });

    it('ignores overlays without a backdrop, such as tooltips', async () => {
        overlay.innerHTML = '<div class="cdk-overlay-pane">Tooltip</div>';
        url = '/workspace/sources';

        await expect(handleBack()).resolves.not.toBe('overlay');
    });

    it('leaves fullscreen', async () => {
        fullscreenElement = document.body;

        await expect(handleBack()).resolves.toBe('fullscreen');
        expect(exitFullscreen).toHaveBeenCalled();
    });

    it('closes the top dialog before leaving fullscreen', async () => {
        const dialog = { close: jest.fn() };
        openDialogs.push(dialog);
        fullscreenElement = document.body;

        await expect(handleBack()).resolves.toBe('dialog');
        expect(dialog.close).toHaveBeenCalled();
        expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it("runs the page's Back from the workspace header", async () => {
        goBack.mockReturnValue(true);
        url = '/workspace/xtreams/1/vod/2';

        await expect(handleBack()).resolves.toBe('workspace-back');
        expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('goes to the workspace start page from any other page without history', async () => {
        url = '/workspace/xtreams/1/live?category=3';

        await expect(handleBack()).resolves.toBe('history');
        expect(navigateByUrl).toHaveBeenCalledWith('/workspace/dashboard', {
            replaceUrl: true,
        });
    });

    it('asks for confirmation instead of exiting at root', async () => {
        await expect(handleBack()).resolves.toBe('exit-confirm');
        expect(exitApp).not.toHaveBeenCalled();
        expect(confirm).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'TV_EXIT.TITLE',
                confirmLabel: 'TV_EXIT.CONFIRM',
            })
        );

        (confirm.mock.calls[0][0] as ConfirmDialogData).onConfirm();
        expect(exitApp).toHaveBeenCalled();
    });
});
