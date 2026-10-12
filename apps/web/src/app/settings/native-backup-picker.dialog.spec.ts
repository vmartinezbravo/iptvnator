import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { NativeBackupPickerDialogComponent } from './native-backup-picker.dialog';

describe('NativeBackupPickerDialogComponent', () => {
    const files = [
        { name: 'iptvnator-playlist-backup-2026-10-12.json', modifiedAt: 2 },
        { name: 'iptvnator-playlist-backup-2026-09-01.json', modifiedAt: 1 },
    ];
    let close: jest.Mock;

    function render() {
        close = jest.fn();
        TestBed.configureTestingModule({
            imports: [
                NativeBackupPickerDialogComponent,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: MAT_DIALOG_DATA, useValue: { files } },
                { provide: MatDialogRef, useValue: { close } },
            ],
        });
        const fixture = TestBed.createComponent(
            NativeBackupPickerDialogComponent
        );
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    it('lists every backup as a focusable button, newest first with initial focus', () => {
        const element = render();
        const buttons = Array.from(
            element.querySelectorAll<HTMLButtonElement>(
                '[data-test-id="native-backup-file"]'
            )
        );

        expect(buttons.map((b) => b.textContent)).toEqual([
            expect.stringContaining(files[0].name),
            expect.stringContaining(files[1].name),
        ]);
        expect(buttons[0].hasAttribute('cdkfocusinitial')).toBe(true);
    });

    it('returns the picked backup name', () => {
        const element = render();

        element
            .querySelectorAll<HTMLButtonElement>(
                '[data-test-id="native-backup-file"]'
            )[1]
            .click();

        expect(close).toHaveBeenCalledWith(files[1].name);
    });
});
