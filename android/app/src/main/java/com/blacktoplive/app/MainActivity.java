package com.blacktoplive.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAudioRoutePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
