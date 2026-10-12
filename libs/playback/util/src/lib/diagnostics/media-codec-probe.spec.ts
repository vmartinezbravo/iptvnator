import { MEDIA_CODEC_PROBES, probeMediaCodecs } from './media-codec-probe';

describe('probeMediaCodecs', () => {
    it('maps each probe through isTypeSupported', () => {
        const supported = new Set([
            MEDIA_CODEC_PROBES.avc,
            MEDIA_CODEC_PROBES.aac,
            MEDIA_CODEC_PROBES.eac3,
        ]);
        const isTypeSupported = jest.fn((type: string) => supported.has(type));

        expect(probeMediaCodecs(isTypeSupported)).toEqual({
            avc: true,
            hevc: false,
            vp9: false,
            aac: true,
            ac3: false,
            eac3: true,
        });
        expect(isTypeSupported.mock.calls.map(([type]) => type)).toEqual([
            'video/mp4; codecs="avc1.640028"',
            'video/mp4; codecs="hvc1.1.6.L120.90"',
            'video/mp4; codecs="vp09.00.10.08"',
            'audio/mp4; codecs="mp4a.40.2"',
            'audio/mp4; codecs="ac-3"',
            'audio/mp4; codecs="ec-3"',
        ]);
    });
});
