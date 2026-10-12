package com.victor.iptvnator;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.ui.PlayerView;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Fullscreen Media3 player of the phase 4b prototype. Plays one item of the
 * list it was started with; on live lists, up/down and channel keys zap.
 * Back closes it and returns to the WebView, which stays loaded behind.
 */
public class NativePlayerActivity extends AppCompatActivity {

    private static final String TAG = "NativePlayer";
    private static final int MAX_REDIRECTS = 5;
    private static final int BUFFER_FOR_PLAYBACK_MS = 1000;
    private static final int BUFFER_AFTER_REBUFFER_MS = 2000;

    private final ExecutorService resolver = Executors.newSingleThreadExecutor();
    private final Handler mainThread = new Handler(Looper.getMainLooper());

    private ArrayList<String> urls;
    private ChannelCursor cursor;
    private boolean isLive;
    private ExoPlayer player;
    private volatile String userAgent;
    /** Bumped on every channel change so a late redirect lookup is ignored. */
    private int request;
    private long clockStart;
    private boolean firstFrameSeen;
    private boolean closed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_native_player);
        Intent intent = getIntent();
        urls = intent.getStringArrayListExtra(NativePlayerPlugin.EXTRA_URLS);
        if (urls == null || urls.isEmpty()) {
            finish();
            return;
        }
        cursor = new ChannelCursor(urls.size(), intent.getIntExtra(NativePlayerPlugin.EXTRA_INDEX, 0));
        isLive = intent.getBooleanExtra(NativePlayerPlugin.EXTRA_IS_LIVE, false);

        player = new ExoPlayer.Builder(this).setLoadControl(buildLoadControl()).build();
        player.addListener(new Player.Listener() {
            @Override
            public void onRenderedFirstFrame() {
                reportFirstFrame();
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                NativePlayerEvents.error(cursor.index(), error.getErrorCodeName(), error.getMessage());
            }
        });
        PlayerView view = findViewById(R.id.player_view);
        view.setPlayer(player);
        view.setUseController(!isLive);
        view.setKeepScreenOn(true);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finish();
            }
        });

        clockStart = intent.getLongExtra(NativePlayerPlugin.EXTRA_REQUESTED_AT, SystemClock.elapsedRealtime());
        play(cursor.index(), intent.getLongExtra(NativePlayerPlugin.EXTRA_START_POSITION_MS, 0));
    }

    private static DefaultLoadControl buildLoadControl() {
        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                DefaultLoadControl.DEFAULT_MIN_BUFFER_MS,
                DefaultLoadControl.DEFAULT_MAX_BUFFER_MS,
                BUFFER_FOR_PLAYBACK_MS,
                BUFFER_AFTER_REBUFFER_MS
            )
            .build();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int step = zapStep(event.getKeyCode());
        if (step != 0 && isLive && urls.size() > 1) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                zap(step);
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private static int zapStep(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_CHANNEL_UP:
                return 1;
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                return -1;
            default:
                return 0;
        }
    }

    private void zap(int step) {
        clockStart = SystemClock.elapsedRealtime();
        play(step > 0 ? cursor.next() : cursor.previous(), 0);
    }

    /** Resolves the redirects off the main thread, then starts the item. */
    private void play(int index, long startPositionMs) {
        int current = ++request;
        firstFrameSeen = false;
        player.stop();
        String url = urls.get(index);
        resolver.execute(() -> {
            if (userAgent == null) {
                userAgent = WebSettings.getDefaultUserAgent(this);
            }
            String playable = StreamRedirects.resolve(url, userAgent, StreamRedirects.HTTP, MAX_REDIRECTS);
            mainThread.post(() -> start(current, playable, startPositionMs));
        });
    }

    private void start(int current, String playable, long startPositionMs) {
        if (current != request || player == null) {
            return;
        }
        DataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent(userAgent)
            .setAllowCrossProtocolRedirects(true);
        MediaItem item = MediaItem.fromUri(playable);
        MediaSource source = StreamRedirects.isHls(playable)
            ? new HlsMediaSource.Factory(http).createMediaSource(item)
            : new ProgressiveMediaSource.Factory(http).createMediaSource(item);
        if (startPositionMs > 0) {
            player.setMediaSource(source, startPositionMs);
        } else {
            // Live streams must start at the live edge, not at position 0.
            player.setMediaSource(source);
        }
        player.prepare();
        player.setPlayWhenReady(true);
    }

    private void reportFirstFrame() {
        if (firstFrameSeen) {
            return;
        }
        firstFrameSeen = true;
        long ms = SystemClock.elapsedRealtime() - clockStart;
        Log.i(TAG, "[perf] native-first-frame " + ms + " " + cursor.index());
        NativePlayerEvents.firstFrame(cursor.index(), ms);
    }

    /** Leaving the player (Back, Home) closes it: TV apps do not keep it. */
    @Override
    protected void onStop() {
        super.onStop();
        if (player != null && !closed) {
            closed = true;
            NativePlayerEvents.closed(cursor.index(), player.getCurrentPosition());
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        resolver.shutdownNow();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
