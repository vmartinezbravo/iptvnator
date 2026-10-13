import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { TvOptionsDialogComponent } from './tv-options-dialog.component';

describe('TvOptionsDialogComponent', () => {
    let closed: Subject<void>;
    let close: jest.Mock;
    let favorite: jest.Mock;
    let more: jest.Mock;

    beforeEach(() => {
        closed = new Subject<void>();
        close = jest.fn();
        favorite = jest.fn();
        more = jest.fn();
        TestBed.configureTestingModule({
            imports: [TvOptionsDialogComponent, TranslateModule.forRoot()],
            providers: [
                {
                    provide: MatDialogRef,
                    useValue: { close, afterClosed: () => closed },
                },
                {
                    provide: MAT_DIALOG_DATA,
                    useValue: {
                        actions: [
                            { label: 'Add to favorites', run: favorite },
                            { label: 'More actions', run: more },
                        ],
                    },
                },
            ],
        });
    });

    const buttons = () => {
        const fixture = TestBed.createComponent(TvOptionsDialogComponent);
        fixture.detectChanges();
        return Array.from(
            (fixture.nativeElement as HTMLElement).querySelectorAll('button')
        );
    };

    it('lists one button per option of the focused item', () => {
        expect(buttons().map((b) => b.textContent?.trim())).toEqual([
            'Add to favorites',
            'More actions',
        ]);
    });

    it('closes first and runs the chosen option once the dialog is gone', () => {
        buttons()[1].click();

        expect(close).toHaveBeenCalled();
        expect(more).not.toHaveBeenCalled();
        closed.next();
        expect(more).toHaveBeenCalledTimes(1);
        expect(favorite).not.toHaveBeenCalled();
    });
});
