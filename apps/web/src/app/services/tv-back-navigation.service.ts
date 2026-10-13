import { OverlayContainer } from '@angular/cdk/overlay';
import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { WorkspaceBackNavigationService } from '@iptvnator/portal/shared/data-access';
import { DialogService } from '@iptvnator/ui/components';
import { WorkspaceStartupPreferencesService } from '@iptvnator/workspace/shell/util';

export type TvBackResult =
    | 'dialog'
    | 'overlay'
    | 'fullscreen'
    | 'workspace-back'
    | 'history'
    | 'exit-confirm';

/** Closes the app; `App.exitApp()` from @capacitor/app, loaded on demand. */
export const TV_APP_EXIT = new InjectionToken<() => Promise<void>>(
    'TV_APP_EXIT',
    {
        providedIn: 'root',
        factory: () => async () => {
            const { App } = await import('@capacitor/app');
            await App.exitApp();
        },
    }
);

/**
 * The remote's Back key on the TV shell, while the app is in front (the
 * Media3 player activity handles its own Back). Applies the first case that
 * holds: close the top dialog, close a menu, leave fullscreen, run the
 * workspace header's Back (the page's own, or in-app history), go to the
 * workspace start page, and there ask before exiting.
 */
@Injectable({ providedIn: 'root' })
export class TvBackNavigationService {
    private readonly dialog = inject(MatDialog);
    private readonly overlays = inject(OverlayContainer);
    private readonly document = inject(DOCUMENT);
    private readonly workspaceBack = inject(WorkspaceBackNavigationService);
    private readonly router = inject(Router);
    private readonly startup = inject(WorkspaceStartupPreferencesService);
    private readonly dialogs = inject(DialogService);
    private readonly translate = inject(TranslateService);
    private readonly exitApp = inject(TV_APP_EXIT);

    async handleBack(): Promise<TvBackResult> {
        const dialogs = this.dialog.openDialogs;
        if (dialogs.length > 0) {
            dialogs[dialogs.length - 1].close();
            return 'dialog';
        }
        // Menus and selects have a backdrop; tooltips (shown on focus) do not.
        const backdrops = this.overlays
            .getContainerElement()
            .querySelectorAll<HTMLElement>('.cdk-overlay-backdrop');
        if (backdrops.length > 0) {
            backdrops[backdrops.length - 1].click();
            return 'overlay';
        }
        if (this.document.fullscreenElement) {
            await this.document.exitFullscreen();
            return 'fullscreen';
        }
        if (this.workspaceBack.goBack()) {
            return 'workspace-back';
        }
        const root = this.startup.getFirstAvailableWorkspacePath();
        if (this.router.url.split(/[?#]/)[0] !== root) {
            // No in-app history left (the header would offer it otherwise):
            // history.back() would do nothing, so go to the start page.
            await this.router.navigateByUrl(root, { replaceUrl: true });
            return 'history';
        }
        this.dialogs.openConfirmDialog({
            title: this.translate.instant('TV_EXIT.TITLE'),
            message: this.translate.instant('TV_EXIT.MESSAGE'),
            confirmLabel: this.translate.instant('TV_EXIT.CONFIRM'),
            onConfirm: () => void this.exitApp(),
        });
        return 'exit-confirm';
    }
}
