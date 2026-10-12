import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import type { NativeBackupFileInfo } from './native-backup-file';

export interface NativeBackupPickerDialogData {
    readonly files: readonly NativeBackupFileInfo[];
}

/**
 * Restore on the native shell: the backups of `Documents/IPTVnator` as a
 * list of buttons, so the remote's D-pad and OK pick one. The newest has the
 * initial focus; closing without a pick yields `undefined`.
 */
@Component({
    imports: [
        DatePipe,
        MatButtonModule,
        MatDialogModule,
        MatIconModule,
        TranslateModule,
    ],
    styles: [
        `
            .native-backup-picker__list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin: 0;
                padding: 0;
                list-style: none;
            }

            .native-backup-picker__file {
                width: 100%;
                justify-content: flex-start;
                text-align: start;
            }

            .native-backup-picker__date {
                margin-inline-start: 12px;
                opacity: 0.7;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h2 mat-dialog-title>
            {{ 'SETTINGS.BACKUP_PICK_TITLE' | translate }}
        </h2>
        <mat-dialog-content>
            <ul class="native-backup-picker__list">
                @for (file of data.files; track file.name; let first = $first) {
                    <li>
                        <button
                            mat-stroked-button
                            class="native-backup-picker__file"
                            data-test-id="native-backup-file"
                            [attr.cdkFocusInitial]="first ? '' : null"
                            (click)="pick(file.name)"
                        >
                            <mat-icon>description</mat-icon>
                            {{ file.name }}
                            <span class="native-backup-picker__date">{{
                                file.modifiedAt | date: 'short'
                            }}</span>
                        </button>
                    </li>
                }
            </ul>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button mat-dialog-close>
                {{ 'CANCEL' | translate }}
            </button>
        </mat-dialog-actions>
    `,
})
export class NativeBackupPickerDialogComponent {
    readonly data = inject<NativeBackupPickerDialogData>(MAT_DIALOG_DATA);
    private readonly dialogRef = inject(
        MatDialogRef<NativeBackupPickerDialogComponent, string>
    );

    pick(fileName: string): void {
        this.dialogRef.close(fileName);
    }
}
