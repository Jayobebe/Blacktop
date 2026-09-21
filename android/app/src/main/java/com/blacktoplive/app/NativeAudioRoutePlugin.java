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
    private void startAfterBluetoothPermission(PluginCall call) {
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
        audioManager.setSpeakerphoneOn(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo bluetooth = null;
            AudioDeviceInfo earpiece = null;
            for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
                int type = device.getType();
                if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                    || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && type == AudioDeviceInfo.TYPE_BLE_HEADSET)) {
                    bluetooth = device;
                    break;
                }
                if (type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) earpiece = device;
            }
            AudioDeviceInfo route = bluetooth != null ? bluetooth : earpiece;
            if (route != null) audioManager.setCommunicationDevice(route);
        } else {
            audioManager.setBluetoothScoOn(true);
            audioManager.startBluetoothSco();
        }
    }
}