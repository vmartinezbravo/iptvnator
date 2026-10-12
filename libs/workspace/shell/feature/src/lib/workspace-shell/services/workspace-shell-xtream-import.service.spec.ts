import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PlaylistRefreshActionService } from '@iptvnator/playlist/shared/ui';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { WorkspaceShellRouteStateService } from './workspace-shell-route-state.service';
import { WorkspaceShellXtreamImportService } from './workspace-shell-xtream-import.service';

describe('WorkspaceShellXtreamImportService', () => {
    it('re-words the import overlay after a runtime language switch', () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                WorkspaceShellXtreamImportService,
                {
                    provide: XtreamStore,
                    useValue: {
                        getImportCount: signal(0),
                        itemsToImport: signal(0),
                        activeImportContentType: signal(null),
                        activeImportCurrentCount: signal(0),
                        activeImportTotalCount: signal(0),
                        currentImportPhase: signal(null),
                        isCancellingImport: signal(false),
                    },
                },
                {
                    provide: PlaylistRefreshActionService,
                    useValue: { refreshPreparation: signal(null) },
                },
                { provide: RuntimeCapabilitiesService, useValue: {} },
                { provide: WorkspaceShellRouteStateService, useValue: {} },
            ],
        });
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation('en', {
            WORKSPACE: { SHELL: { XTREAM_IMPORT_TITLE: 'Importing' } },
        });
        translate.setTranslation('ru', {
            WORKSPACE: { SHELL: { XTREAM_IMPORT_TITLE: 'Импорт' } },
        });
        translate.use('en');
        // The shell provides this service, so it outlives the Settings
        // visit where the language is switched.
        const service = TestBed.inject(WorkspaceShellXtreamImportService);

        expect(service.xtreamImportTitleLabel()).toBe('Importing');

        translate.use('ru');

        expect(service.xtreamImportTitleLabel()).toBe('Импорт');
    });

    describe('per-section import overlay', () => {
        type LoadState = 'idle' | 'loading' | 'ready' | 'error';
        const setup = (options: {
            section: string;
            isNativeShell: boolean;
            loadStates: Record<'live' | 'vod' | 'series', LoadState>;
        }) => {
            const route = signal({
                kind: 'workspace',
                context: { provider: 'xtreams', playlistId: 'p1' },
                section: options.section,
            });
            TestBed.configureTestingModule({
                imports: [TranslateModule.forRoot()],
                providers: [
                    WorkspaceShellXtreamImportService,
                    {
                        provide: XtreamStore,
                        useValue: {
                            getImportCount: signal(0),
                            itemsToImport: signal(0),
                            activeImportCurrentCount: signal(0),
                            activeImportTotalCount: signal(0),
                            currentImportPhase: signal(null),
                            isCancellingImport: signal(false),
                            activeImportSessionId: signal('session-1'),
                            contentInitBlockReason: signal(null),
                            contentLoadStateByType: signal(options.loadStates),
                        },
                    },
                    {
                        provide: PlaylistRefreshActionService,
                        useValue: { refreshPreparation: signal(null) },
                    },
                    {
                        provide: RuntimeCapabilitiesService,
                        useValue: { isNativeShell: options.isNativeShell },
                    },
                    {
                        provide: WorkspaceShellRouteStateService,
                        useValue: {
                            currentRoute: route,
                            currentContext: computed(() => route().context),
                            currentSection: computed(() => route().section),
                        },
                    },
                ],
            });
            return TestBed.inject(WorkspaceShellXtreamImportService);
        };
        const liveReady = {
            live: 'ready',
            vod: 'loading',
            series: 'idle',
        } as const;

        it('hides the overlay in Live on native once live channels are ready', () => {
            const service = setup({
                section: 'live',
                isNativeShell: true,
                loadStates: liveReady,
            });
            expect(service.showXtreamImportOverlay()).toBe(false);
        });

        it('keeps the overlay in Live on native while live channels load', () => {
            const service = setup({
                section: 'live',
                isNativeShell: true,
                loadStates: { live: 'loading', vod: 'idle', series: 'idle' },
            });
            expect(service.showXtreamImportOverlay()).toBe(true);
        });

        it('keeps the overlay in Movies on native while movies load', () => {
            const service = setup({
                section: 'vod',
                isNativeShell: true,
                loadStates: liveReady,
            });
            expect(service.showXtreamImportOverlay()).toBe(true);
        });

        it('keeps the overlay in Search on native until the whole import ends', () => {
            const service = setup({
                section: 'search',
                isNativeShell: true,
                loadStates: { live: 'ready', vod: 'ready', series: 'loading' },
            });
            expect(service.showXtreamImportOverlay()).toBe(true);
        });

        it('keeps the whole-import overlay outside the native shell', () => {
            const service = setup({
                section: 'live',
                isNativeShell: false,
                loadStates: liveReady,
            });
            expect(service.showXtreamImportOverlay()).toBe(true);
        });
    });
});
