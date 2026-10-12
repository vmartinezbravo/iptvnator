import {
    InlinePlaybackPlayer,
    PlaybackDiagnosticCode,
    PlaybackDiagnosticSource,
    type PlaybackDiagnostic,
    type PlaybackRecommendationTarget,
} from '@iptvnator/playback/util';
import type { ExternalRecoveryStates } from './external-playback-recovery';
import {
    createWebPlayerRecommendations,
    resolveRenderableWebPlayer,
    toInlinePlaybackPlayer,
} from './web-player-recovery-policy';
import { VideoPlayer } from '@iptvnator/shared/interfaces';

const DIAGNOSTIC: PlaybackDiagnostic = {
    code: PlaybackDiagnosticCode.UnsupportedContainer,
    source: PlaybackDiagnosticSource.Native,
    sourceUrl: 'https://example.com/movie.mkv',
    container: 'matroska',
    mimeType: 'video/matroska',
    player: InlinePlaybackPlayer.VideoJs,
    audioCodecs: [],
    videoCodecs: [],
};

function externalStates(
    overrides: Partial<ExternalRecoveryStates> = {}
): ExternalRecoveryStates {
    return {
        mpv: { attempts: 0, sessionId: null, status: 'idle' },
        vlc: { attempts: 0, sessionId: null, status: 'idle' },
        ...overrides,
    };
}

function recommendations(options: {
    attemptedTargets?: ReadonlySet<PlaybackRecommendationTarget>;
    diagnostic?: PlaybackDiagnostic;
    externalStates?: ExternalRecoveryStates;
    managedExternalPlayersAvailable?: boolean;
    nativeExternalPlayerAvailable?: boolean;
    alternativeWebPlayersAvailable?: boolean;
    bindingTarget?: (typeof InlinePlaybackPlayer)[keyof typeof InlinePlaybackPlayer];
}) {
    return createWebPlayerRecommendations({
        diagnostic: options.diagnostic ?? DIAGNOSTIC,
        binding: {
            generation: 1,
            target: options.bindingTarget ?? InlinePlaybackPlayer.VideoJs,
        },
        alternativeWebPlayersAvailable: options.alternativeWebPlayersAvailable,
        attemptedTargets: options.attemptedTargets ?? new Set(),
        externalStates: options.externalStates ?? externalStates(),
        managedExternalPlayersAvailable:
            options.managedExternalPlayersAvailable ?? true,
        nativeExternalPlayerAvailable:
            options.nativeExternalPlayerAvailable ?? false,
        playbackExternallyTransferable: true,
        isLive: false,
        alternativeSourceCount: 1,
    });
}

function targets(
    result: ReturnType<typeof recommendations>
): readonly string[] {
    return result.map((item) =>
        item.action === 'player' ? item.target : item.action
    );
}

describe('device player inside the web player view', () => {
    // M3U lists still play inline: the device player choice shows
    // there as the HTML5 player, the native shell's inline engine.
    it('renders the device player choice with HTML5', () => {
        expect(resolveRenderableWebPlayer(VideoPlayer.NativePlayer)).toBe(
            VideoPlayer.Html5Player
        );
        expect(toInlinePlaybackPlayer(VideoPlayer.NativePlayer)).toBe(
            InlinePlaybackPlayer.Html5
        );
    });
});

describe('createWebPlayerRecommendations external outcomes', () => {
    it('offers neither Video.js nor ArtPlayer where only the HTML5 player exists', () => {
        const hlsDecodeError = {
            ...DIAGNOSTIC,
            code: PlaybackDiagnosticCode.MediaDecodeError,
            source: PlaybackDiagnosticSource.Hls,
            container: 'm3u8',
            mimeType: 'application/vnd.apple.mpegurl',
            player: InlinePlaybackPlayer.Html5,
        };
        const desktop = recommendations({
            diagnostic: hlsDecodeError,
            bindingTarget: InlinePlaybackPlayer.Html5,
        });
        const native = recommendations({
            diagnostic: hlsDecodeError,
            bindingTarget: InlinePlaybackPlayer.Html5,
            managedExternalPlayersAvailable: false,
            nativeExternalPlayerAvailable: true,
            alternativeWebPlayersAvailable: false,
        });

        expect(targets(desktop)).toContain(InlinePlaybackPlayer.VideoJs);
        expect(targets(native)).not.toContain(InlinePlaybackPlayer.VideoJs);
        expect(targets(native)).not.toContain(InlinePlaybackPlayer.ArtPlayer);
        expect(targets(native)).toContain('vlc');
    });

    it('diagnostic view offers "Abrir en VLC" when supportsNativeExternalPlayer', () => {
        const native = recommendations({
            managedExternalPlayersAvailable: false,
            nativeExternalPlayerAvailable: true,
        });
        const neither = recommendations({
            managedExternalPlayersAvailable: false,
        });

        expect(targets(native)).toContain('vlc');
        expect(targets(native)).not.toContain('mpv');
        expect(targets(neither)).not.toContain('vlc');
    });

    it('keeps an attempted failed external target and promotes its untried sibling', () => {
        const result = recommendations({
            attemptedTargets: new Set(['mpv']),
            externalStates: externalStates({
                mpv: {
                    attempts: 1,
                    sessionId: 'mpv-session',
                    status: 'error',
                },
            }),
        });

        expect(targets(result)).toEqual(['vlc', 'mpv', 'alternative-source']);
        expect(result.map((item) => item.priority)).toEqual([
            'primary',
            'secondary',
            'secondary',
        ]);
    });

    it('retains inline family exclusion while reranking only external siblings', () => {
        const result = recommendations({
            diagnostic: {
                ...DIAGNOSTIC,
                code: PlaybackDiagnosticCode.MediaDecodeError,
                source: PlaybackDiagnosticSource.Hls,
                container: 'm3u8',
                mimeType: 'application/vnd.apple.mpegurl',
            },
            attemptedTargets: new Set([InlinePlaybackPlayer.Html5, 'mpv']),
            externalStates: externalStates({
                mpv: { attempts: 1, sessionId: null, status: 'error' },
            }),
        });

        expect(targets(result)).toEqual(['vlc', 'mpv', 'alternative-source']);
        expect(targets(result)).not.toContain(InlinePlaybackPlayer.Html5);
    });

    it('keeps a failed external target and reveals its capped sibling', () => {
        const result = recommendations({
            diagnostic: {
                ...DIAGNOSTIC,
                code: PlaybackDiagnosticCode.DrmOrEncryption,
                source: PlaybackDiagnosticSource.Hls,
                container: 'm3u8',
                mimeType: 'application/vnd.apple.mpegurl',
            },
            attemptedTargets: new Set(['mpv']),
            externalStates: externalStates({
                mpv: { attempts: 1, sessionId: null, status: 'error' },
            }),
        });

        expect(targets(result)).toEqual([
            InlinePlaybackPlayer.Html5,
            'vlc',
            'mpv',
        ]);
        expect(result).toHaveLength(3);
    });

    it('retains a previously attempted target that the initial cap omitted', () => {
        const result = recommendations({
            diagnostic: {
                ...DIAGNOSTIC,
                code: PlaybackDiagnosticCode.DrmOrEncryption,
                source: PlaybackDiagnosticSource.Hls,
                container: 'm3u8',
                mimeType: 'application/vnd.apple.mpegurl',
            },
            attemptedTargets: new Set(['vlc']),
            externalStates: externalStates({
                vlc: { attempts: 1, sessionId: null, status: 'error' },
            }),
        });

        expect(targets(result)).toEqual([
            InlinePlaybackPlayer.Html5,
            'mpv',
            'vlc',
        ]);
        expect(result).toHaveLength(3);
    });

    it('preserves policy order for equal attempt counts and stays capped at three', () => {
        const result = recommendations({
            attemptedTargets: new Set(['mpv', 'vlc']),
            externalStates: externalStates({
                mpv: { attempts: 2, sessionId: null, status: 'error' },
                vlc: { attempts: 2, sessionId: null, status: 'error' },
            }),
        });

        expect(targets(result)).toEqual(['mpv', 'vlc', 'alternative-source']);
        expect(result).toHaveLength(3);
    });

    it('does not mutate attempts or external state inputs', () => {
        const attemptedTargets = new Set<PlaybackRecommendationTarget>(['mpv']);
        const states = externalStates({
            mpv: { attempts: 1, sessionId: 'mpv-1', status: 'started' },
        });
        const attemptedBefore = [...attemptedTargets];
        const statesBefore = JSON.stringify(states);

        recommendations({ attemptedTargets, externalStates: states });

        expect([...attemptedTargets]).toEqual(attemptedBefore);
        expect(JSON.stringify(states)).toBe(statesBefore);
    });
});
