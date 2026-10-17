package com.blacktoplive.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.content.Intent;
import android.media.AudioManager;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.view.InputDevice;
import android.view.KeyEvent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "NativeAudioRoute",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class NativeAudioRoutePlugin extends Plugin {
    private AudioManager audioManager;
    private int previousMode = AudioManager.MODE_NORMAL;
    private boolean wasSpeakerphoneOn = false;
    private boolean communicationActive = false;
    /** Convoy voice's media session: a headset's play / pause reaches the app as "mediaButton". */
    private MediaSession mediaSession;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void startCommunicationAudio(PluginCall call) {
        if (audioManager == null) {
            call.reject("Audio service unavailable");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("bluetooth", call, "startAfterBluetoothPermission");
            return;
        }

        activateCommunicationRoute();
        call.resolve(new JSObject());
    }

    @PermissionCallback
    public void startAfterBluetoothPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Bluetooth permission denied");
            return;
        }
        activateCommunicationRoute();
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void refreshCommunicationAudio(PluginCall call) {
        if (audioManager == null) {
            call.reject("Audio service unavailable");
            return;
        }
        activateCommunicationRoute();
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void stopCommunicationAudio(PluginCall call) {
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            } else {
                audioManager.stopBluetoothSco();
                audioManager.setBluetoothScoOn(false);
            }
            audioManager.setSpeakerphoneOn(wasSpeakerphoneOn);
            audioManager.setMode(previousMode);
            communicationActive = false;
        }
        call.resolve(new JSObject());
    }

    private void activateCommunicationRoute() {
        if (!communicationActive) {
            previousMode = audioManager.getMode();
            wasSpeakerphoneOn = audioManager.isSpeakerphoneOn();
            communicationActive = true;
        }
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo headset = null;
            for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
                int type = device.getType();
                if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                    || type == AudioDeviceInfo.TYPE_BLE_HEADSET
                    || type == AudioDeviceInfo.TYPE_WIRED_HEADSET
                    || type == AudioDeviceInfo.TYPE_USB_HEADSET
                    || type == AudioDeviceInfo.TYPE_HEARING_AID) {
                    headset = device;
                    if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || type == AudioDeviceInfo.TYPE_BLE_HEADSET) break;
                }
            }
            if (headset != null) {
                audioManager.setSpeakerphoneOn(false);
                audioManager.setCommunicationDevice(headset);
            } else {
                // No headset: use the loudspeaker, never the quiet call earpiece.
                audioManager.clearCommunicationDevice();
                audioManager.setSpeakerphoneOn(true);
            }
        } else {
            boolean btAvailable = false;
            for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                int type = device.getType();
                if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) {
                    btAvailable = true;
                    break;
                }
            }
            if (btAvailable) {
                audioManager.setSpeakerphoneOn(false);
                audioManager.setBluetoothScoOn(true);
                audioManager.startBluetoothSco();
            } else {
                audioManager.setSpeakerphoneOn(true);
            }
        }
    }

    /**
     * Takes the phone's media buttons for convoy voice: a headset's or
     * intercom's play / pause (or its single call button) sends "mediaButton"
     * to the web app, which mutes or unmutes. The session says it's playing, so
     * Android hands the buttons here rather than to the last music app.
     */
    @PluginMethod
    public void startMediaButtons(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (mediaSession == null) {
                mediaSession = new MediaSession(getContext(), "BlacktopVoice");
                mediaSession.setCallback(new MediaSession.Callback() {
                    @Override
                    public boolean onMediaButtonEvent(Intent intent) {
                        KeyEvent key = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                        if (key == null || key.getAction() != KeyEvent.ACTION_DOWN || key.getRepeatCount() > 0) return true;
                        switch (key.getKeyCode()) {
                            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                            case KeyEvent.KEYCODE_MEDIA_PLAY:
                            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                            case KeyEvent.KEYCODE_HEADSETHOOK:
                                // Which key: play only unmutes and pause only mutes on the web side.
                                JSObject pressed = new JSObject();
                                int code = key.getKeyCode();
                                pressed.put("key", code == KeyEvent.KEYCODE_MEDIA_PLAY ? "play" : code == KeyEvent.KEYCODE_MEDIA_PAUSE ? "pause" : "toggle");
                                pressed.put("bluetooth", fromBluetooth(key));
                                notifyListeners("mediaButton", pressed);
                                return true;
                            default:
                                return super.onMediaButtonEvent(intent);
                        }
                    }
                });
            }
            mediaSession.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE)
                .setState(PlaybackState.STATE_PLAYING, 0, 1f)
                .build());
            mediaSession.setActive(true);
            call.resolve(new JSObject());
        });
    }

    @PluginMethod
    public void stopMediaButtons(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (mediaSession != null) {
                mediaSession.setActive(false);
                mediaSession.release();
                mediaSession = null;
            }
            call.resolve(new JSObject());
        });
    }

    /**
     * Whether a media key came from a Bluetooth headset or intercom: one is
     * connected for audio, and the key didn't come from a real wired input
     * device (Bluetooth's AVRCP keys arrive with no device or a virtual one;
     * earphones on the jack or USB-C have their own). The armed alarm only
     * takes these, since earphones can be plugged into a parked phone.
     */
    private boolean fromBluetooth(KeyEvent key) {
        InputDevice dev = key.getDevice();
        if (dev != null && !dev.isVirtual()) {
            String name = dev.getName() == null ? "" : dev.getName().toLowerCase();
            if (!name.contains("avrcp") && !name.contains("bluetooth")) return false;
        }
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return true;
            if (Build.VERSION.SDK_INT >= 31 && (t == AudioDeviceInfo.TYPE_BLE_HEADSET || t == AudioDeviceInfo.TYPE_BLE_SPEAKER)) return true;
        }
        return false;
    }

    /** What the activity asked for before a ride locked it, put back on unlock. */
    private Integer orientationBeforeLock = null;

    /**
     * Holds the screen the way it is now (a ride at speed: leaning the bike
     * mustn't turn the screen). Kept here with the other ride-time device
     * controls rather than in a plugin of its own.
     */
    @PluginMethod
    public void lockScreenOrientation(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (orientationBeforeLock == null) orientationBeforeLock = getActivity().getRequestedOrientation();
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LOCKED);
            call.resolve(new JSObject());
        });
    }

    @PluginMethod
    public void unlockScreenOrientation(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().setRequestedOrientation(orientationBeforeLock != null ? orientationBeforeLock : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            orientationBeforeLock = null;
            call.resolve(new JSObject());
        });
    }
}
