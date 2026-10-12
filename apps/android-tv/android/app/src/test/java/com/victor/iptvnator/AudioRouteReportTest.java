package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.media3.common.C;
import org.junit.Test;

public class AudioRouteReportTest {

    @Test
    public void namesTheDolbyAndPcmEncodings() {
        assertEquals("ac3", AudioRouteReport.encodingName(C.ENCODING_AC3));
        assertEquals("eac3", AudioRouteReport.encodingName(C.ENCODING_E_AC3));
        assertEquals("eac3-joc", AudioRouteReport.encodingName(C.ENCODING_E_AC3_JOC));
        assertEquals("pcm16", AudioRouteReport.encodingName(C.ENCODING_PCM_16BIT));
        assertEquals("pcm-float", AudioRouteReport.encodingName(C.ENCODING_PCM_FLOAT));
        assertEquals("other:" + C.ENCODING_DTS, AudioRouteReport.encodingName(C.ENCODING_DTS));
    }

    @Test
    public void treatsCompressedOutputAsPassthrough() {
        assertTrue(AudioRouteReport.isPassthrough(C.ENCODING_AC3));
        assertTrue(AudioRouteReport.isPassthrough(C.ENCODING_E_AC3));
        assertTrue(AudioRouteReport.isPassthrough(C.ENCODING_E_AC3_JOC));
    }

    /** Review Focus 1: a receiver without passthrough gets decoded PCM. */
    @Test
    public void audioReportMarksDecodedOutputWhenTheSinkHasNoPassthrough() {
        assertFalse(AudioRouteReport.isPassthrough(C.ENCODING_PCM_16BIT));
        assertFalse(AudioRouteReport.isPassthrough(C.ENCODING_PCM_FLOAT));
    }
}
