package com.victor.iptvnator;

import androidx.media3.common.C;

/**
 * Names the encoding Media3 writes to the audio output. A Dolby encoding
 * there means passthrough (the HDMI receiver decodes); PCM means the Stick
 * decoded it.
 */
final class AudioRouteReport {

    private AudioRouteReport() {}

    static String encodingName(int encoding) {
        switch (encoding) {
            case C.ENCODING_AC3:
                return "ac3";
            case C.ENCODING_E_AC3:
                return "eac3";
            case C.ENCODING_E_AC3_JOC:
                return "eac3-joc";
            case C.ENCODING_PCM_16BIT:
                return "pcm16";
            case C.ENCODING_PCM_FLOAT:
                return "pcm-float";
            default:
                return "other:" + encoding;
        }
    }

    static boolean isPassthrough(int encoding) {
        return encoding == C.ENCODING_AC3 || encoding == C.ENCODING_E_AC3 || encoding == C.ENCODING_E_AC3_JOC;
    }
}
