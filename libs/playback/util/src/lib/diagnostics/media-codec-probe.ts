/**
 * MSE content types checked on each test device (spec §6.2): Chromium's MSE
 * cannot play MPEG-2 video, and AC-3/E-AC-3 depend on how the WebView was
 * built even when the hardware decodes them.
 */
export const MEDIA_CODEC_PROBES = {
    avc: 'video/mp4; codecs="avc1.640028"',
    hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"',
    vp9: 'video/mp4; codecs="vp09.00.10.08"',
    aac: 'audio/mp4; codecs="mp4a.40.2"',
    ac3: 'audio/mp4; codecs="ac-3"',
    eac3: 'audio/mp4; codecs="ec-3"',
} as const;

export type MediaCodecProbeResult = Record<
    keyof typeof MEDIA_CODEC_PROBES,
    boolean
>;

export function probeMediaCodecs(
    isTypeSupported: (type: string) => boolean
): MediaCodecProbeResult {
    const result = {} as MediaCodecProbeResult;
    for (const [codec, type] of Object.entries(MEDIA_CODEC_PROBES)) {
        result[codec as keyof MediaCodecProbeResult] = isTypeSupported(type);
    }
    return result;
}
