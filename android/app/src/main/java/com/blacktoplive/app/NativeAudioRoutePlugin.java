package com.blacktoplive.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

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
}