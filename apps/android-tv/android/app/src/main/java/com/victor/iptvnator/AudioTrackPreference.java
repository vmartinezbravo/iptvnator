package com.victor.iptvnator;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import java.util.ArrayList;

/**
 * The audio track the player starts with, while there is no track picker:
 * the device language first, and never an audio description if another
 * track exists.
 */
final class AudioTrackPreference {

    private AudioTrackPreference() {}

    /**
     * @param languages each track's language as Media3 normalizes it ("es",
     *     "es-ES") or null
     * @param roleFlags each track's Media3 role flags
     * @param deviceLanguage the device language, normalized the same way
     * @return the index of the track to play
     */
    static int choose(String[] languages, int[] roleFlags, String deviceLanguage) {
        if (languages.length == 0 || languages.length != roleFlags.length) {
            throw new IllegalArgumentException("one language and one role per track");
        }
        int firstWithoutDescription = -1;
        for (int i = 0; i < languages.length; i++) {
            if ((roleFlags[i] & C.ROLE_FLAG_DESCRIBES_VIDEO) != 0) {
                continue;
            }
            if (isDeviceLanguage(languages[i], deviceLanguage)) {
                return i;
            }
            if (firstWithoutDescription < 0) {
                firstWithoutDescription = i;
            }
        }
        return Math.max(firstWithoutDescription, 0);
    }

    /**
     * The override that switches to the preferred supported audio track, or
     * null when that track already plays or there is no audio.
     */
    static TrackSelectionOverride override(Tracks tracks, String deviceLanguage) {
        ArrayList<Tracks.Group> groups = new ArrayList<>();
        ArrayList<Integer> trackIndexes = new ArrayList<>();
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() != C.TRACK_TYPE_AUDIO) {
                continue;
            }
            for (int i = 0; i < group.length; i++) {
                if (group.isTrackSupported(i)) {
                    groups.add(group);
                    trackIndexes.add(i);
                }
            }
        }
        if (groups.isEmpty()) {
            return null;
        }
        String[] languages = new String[groups.size()];
        int[] roleFlags = new int[groups.size()];
        for (int i = 0; i < groups.size(); i++) {
            Format format = groups.get(i).getTrackFormat(trackIndexes.get(i));
            languages[i] = format.language;
            roleFlags[i] = format.roleFlags;
        }
        int choice = choose(languages, roleFlags, deviceLanguage);
        Tracks.Group group = groups.get(choice);
        int track = trackIndexes.get(choice);
        return group.isTrackSelected(track) ? null : new TrackSelectionOverride(group.getMediaTrackGroup(), track);
    }

    private static boolean isDeviceLanguage(String language, String deviceLanguage) {
        return (
            language != null &&
            deviceLanguage != null &&
            (language.equals(deviceLanguage) || language.startsWith(deviceLanguage + "-"))
        );
    }
}
