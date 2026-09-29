package com.blacktoplive.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The anti-theft alarm's siren and chirps, and the auto-rescue siren, made here
 * rather than in the WebView so they always come out of the phone's own
 * loudspeaker. WebView audio follows the media or call route, which is the
 * Bluetooth headset or intercom whenever one is connected: right for voice chat
 * and turn-by-turn, useless for a siren (the helmet has usually walked off with
 * the rider).
 *
 * The siren also takes the alarm volume to full and, while it sounds, steps out
 * of call mode (voice chat), where Android would turn an alarm down or send it to
 * the headset. Both are put back when it stops.
 */
@CapacitorPlugin(name = "AlarmSound")
public class AlarmSoundPlugin extends Plugin {
    private static final int RATE = 44100;

    private final Object lock = new Object();
    private AudioManager audioManager;
    private Thread sirenThread;
    private volatile boolean sirenOn = false;
    private int savedMode = -1;
    private int savedAlarmVolume = -1;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void startSiren(PluginCall call) {
        synchronized (lock) {
            if (sirenThread == null) {
                takeOverAudio();
                sirenOn = true;
                sirenThread = new Thread(this::runSiren, "blacktop-siren");
                sirenThread.start();
            }
        }
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void stopSiren(PluginCall call) {
        stopSirenNow();
        call.resolve(new JSObject());
    }

    /** One of the short alarm sounds: arm, disarm, nudge (a warning) or entry (the countdown beep). */
    @PluginMethod
    public void chirp(PluginCall call) {
        final String kind = call.getString("kind", "nudge");
        new Thread(() -> playChirp(kind), "blacktop-chirp").start();
        call.resolve(new JSObject());
    }

    @Override
    protected void handleOnDestroy() {
        stopSirenNow();
    }

    private void stopSirenNow() {
        Thread thread;
        synchronized (lock) {
            sirenOn = false;
            thread = sirenThread;
            sirenThread = null;
        }
        if (thread != null) {
            try {
                thread.join(600);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        synchronized (lock) {
            if (sirenThread == null) giveBackAudio();
        }
    }

    /** Full alarm volume, and out of call mode, for as long as the siren sounds. */
    private void takeOverAudio() {
        if (audioManager == null) return;
        try {
            int mode = audioManager.getMode();
            if (mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_IN_CALL) {
                savedMode = mode;
                audioManager.setMode(AudioManager.MODE_NORMAL);
            }
        } catch (Exception ignored) {
            savedMode = -1;
        }
        try {
            savedAlarmVolume = audioManager.getStreamVolume(AudioManager.STREAM_ALARM);
            audioManager.setStreamVolume(AudioManager.STREAM_ALARM, audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
        } catch (Exception ignored) {
            savedAlarmVolume = -1;
        }
    }

    private void giveBackAudio() {
        if (audioManager == null) return;
        if (savedAlarmVolume >= 0) {
            try {
                audioManager.setStreamVolume(AudioManager.STREAM_ALARM, savedAlarmVolume, 0);
            } catch (Exception ignored) {
                // Do Not Disturb can refuse; the volume stays up.
            }
            savedAlarmVolume = -1;
        }
        if (savedMode >= 0) {
            try {
                audioManager.setMode(savedMode);
            } catch (Exception ignored) {
                // Voice chat re-applies its own route when it next refreshes.
            }
            savedMode = -1;
        }
    }

    /** A track for alarm sounds, pinned to the built-in loudspeaker. */
    private AudioTrack newTrack(int bytes, int mode) {
        AudioTrack track = new AudioTrack(
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
            new AudioFormat.Builder()
                .setSampleRate(RATE)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build(),
            bytes,
            mode,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        );
        AudioDeviceInfo speaker = builtInSpeaker();
        if (speaker != null) track.setPreferredDevice(speaker);
        return track;
    }

    private AudioDeviceInfo builtInSpeaker() {
        if (audioManager == null) return null;
        for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return device;
        }
        return null;
    }

    /**
     * The wail, as the web siren (radioFx.alarmSiren): a sawtooth and a square
     * sweeping ±450 Hz around 1050 Hz on a triangle about once a second.
     */
    private void runSiren() {
        int chunk = RATE / 25;
        int min = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioTrack track;
        try {
            track = newTrack(Math.max(min, chunk * 2 * 3), AudioTrack.MODE_STREAM);
        } catch (Exception e) {
            return;
        }
        short[] buf = new short[chunk];
        double a = 0, b = 0, lfo = 0, level = 0;
        double fadeIn = 1.0 / (RATE * 0.08);
        double fadeOut = 1.0 / (RATE * 0.12);
        boolean stopping = false;
        try {
            track.play();
            while (true) {
                if (!sirenOn) stopping = true;
                for (int i = 0; i < chunk; i++) {
                    lfo += 0.95 / RATE;
                    if (lfo >= 1) lfo -= 1;
                    double tri = lfo < 0.5 ? 4 * lfo - 1 : 3 - 4 * lfo;
                    a += (1050 + 450 * tri) / RATE;
                    if (a >= 1) a -= 1;
                    b += (1060 + 450 * tri) / RATE;
                    if (b >= 1) b -= 1;
                    level = stopping ? Math.max(0, level - fadeOut) : Math.min(1, level + fadeIn);
                    double v = (0.55 * (2 * a - 1) + 0.35 * (b < 0.5 ? 1 : -1)) * 0.9 * level;
                    buf[i] = (short) (Math.max(-1, Math.min(1, v)) * 32000);
                }
                track.write(buf, 0, chunk);
                if (stopping && level <= 0) break;
            }
            track.stop();
        } catch (Exception ignored) {
            // Released under us, or the audio service went away.
        } finally {
            track.release();
        }
    }

    /** The chirps, as the web ones (radioFx.alarmChirp): square blips of {start s, Hz, length s, level}. */
    private void playChirp(String kind) {
        double[][] tones;
        switch (kind) {
            case "arm":
                tones = new double[][] { { 0, 880, 0.09, 0.4 }, { 0.13, 1320, 0.12, 0.4 } };
                break;
            case "disarm":
                tones = new double[][] { { 0, 1320, 0.09, 0.36 }, { 0.13, 880, 0.14, 0.36 } };
                break;
            case "entry":
                tones = new double[][] { { 0, 1800, 0.06, 0.45 }, { 0.1, 1800, 0.06, 0.45 } };
                break;
            default:
                tones = new double[][] { { 0, 1500, 0.07, 0.42 } };
        }
        double length = 0;
        for (double[] tone : tones) length = Math.max(length, tone[0] + tone[2]);
        int n = (int) Math.ceil((length + 0.03) * RATE);
        short[] pcm = new short[n];
        for (double[] tone : tones) {
            int start = (int) (tone[0] * RATE);
            int len = (int) (tone[2] * RATE);
            double phase = 0;
            for (int i = 0; i < len && start + i < n; i++) {
                phase += tone[1] / RATE;
                if (phase >= 1) phase -= 1;
                double s = i / (double) RATE;
                double env = Math.min(1, s / 0.008) * Math.min(1, Math.max(0, (tone[2] - s) / 0.02));
                double v = (phase < 0.5 ? 1 : -1) * tone[3] * env * 32767;
                pcm[start + i] = (short) Math.max(-32767, Math.min(32767, pcm[start + i] + v));
            }
        }
        AudioTrack track;
        try {
            track = newTrack(n * 2, AudioTrack.MODE_STATIC);
        } catch (Exception e) {
            return;
        }
        try {
            track.write(pcm, 0, n);
            track.play();
            Thread.sleep((long) ((length + 0.1) * 1000));
            track.stop();
        } catch (Exception ignored) {
            // Interrupted or the track failed: nothing left to play.
        } finally {
            track.release();
        }
    }
}
