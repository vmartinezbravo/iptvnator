import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
    MAT_DIALOG_DATA,
    MatDialog,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import type { TvAction } from './tv-options-keys';

export interface TvOptionsDialogData {
    readonly actions: readonly TvAction[];
}

/**
 * The TV options menu: the focused item's options as a list the D-pad walks
 * (the dialog keeps the focus in) and Back closes. A choice closes the menu
 * first, so the focus is back on the item when its hidden button is pressed
 * and a menu that button opens is not trapped behind this one.
 */
@Component({
    selector: 'app-tv-options-dialog',
    imports: [MatButtonModule, MatDialogModule, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h2 mat-dialog-title>{{ 'TV_OPTIONS.TITLE' | translate }}</h2>
        <mat-dialog-content class="tv-options">
            @for (action of data.actions; track $index) {
                <button
                    mat-button
                    type="button"
                    class="tv-options__action"
                    (click)="choose(action)"
                >
                    {{ action.label }}
                </button>
            }
        </mat-dialog-content>
    `,
    styles: `
        .tv-options {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 280px;
        }

        .tv-options__action {
            justify-content: flex-start;
        }
    `,
})
export class TvOptionsDialogComponent {
    readonly data = inject<TvOptionsDialogData>(MAT_DIALOG_DATA);
    private readonly dialogRef = inject(MatDialogRef<TvOptionsDialogComponent>);

    choose(action: TvAction): void {
        this.dialogRef.afterClosed().subscribe(() => action.run());
        this.dialogRef.close();
    }
}

export function openTvOptions(
    dialog: MatDialog,
    actions: readonly TvAction[]
): void {
    dialog.open<TvOptionsDialogComponent, TvOptionsDialogData>(
        TvOptionsDialogComponent,
        { data: { actions }, autoFocus: 'first-tabbable' }
    );
}
