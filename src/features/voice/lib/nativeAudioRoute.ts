import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeAudioRoutePlugin {
  startCommunicationAudio(): Promise<void>;
  refreshCommunicationAudio(): Promise<void>;
  stopCommunicationAudio(): Promise<void>;
  startMediaButtons(): Promise<void>;
  stopMediaButtons(): Promise<void>;
  addListener(event: 'mediaButton', cb: () => void): Promise<{ remove: () => Promise<void> }>;
}

const NativeAudioRoute = registerPlugin<NativeAudioRoutePlugin>('NativeAudioRoute');

interface AudioSessionNavigator extends Navigator {
  audioSession?: { type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record' };
}

export function startBrowserCommunicationAudio(): void {
  const audioSession = (navigator as AudioSessionNavigator).audioSession;
  if (audioSession) audioSession.type = 'play-and-record';
}

export function stopBrowserCommunicationAudio(): void {
  const audioSession = (navigator as AudioSessionNavigator).audioSession;
  if (audioSession) audioSession.type = 'auto';
}

export async function startNativeCommunicationAudio(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await NativeAudioRoute.startCommunicationAudio();
  } catch (error) {
    console.warn('[Voice] Native Bluetooth audio route unavailable:', error);
  }
}

export async function refreshNativeCommunicationAudio(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await NativeAudioRoute.refreshCommunicationAudio();
  } catch (error) {
    console.warn('[Voice] Native Bluetooth audio route refresh failed:', error);
  }
}

export async function stopNativeCommunicationAudio(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await NativeAudioRoute.stopCommunicationAudio();
  } catch (error) {
    console.warn('[Voice] Native audio route cleanup failed:', error);
  }
}
/**
 * The Android app's own media session for convoy voice: a headset's or
 * intercom's play / pause button calls `onPress` (the web view has no media
 * session of its own to receive it). Returns a stop. A no-op elsewhere.
 */
export async function listenToMediaButtons(onPress: () => void): Promise<() => void> {
  if (Capacitor.getPlatform() !== 'android') return () => {};
  try {
    const handle = await NativeAudioRoute.addListener('mediaButton', onPress);
    await NativeAudioRoute.startMediaButtons();
    return () => {
      void handle.remove();
      void NativeAudioRoute.stopMediaButtons().catch(() => {});
    };
  } catch (error) {
    console.warn('[Voice] Media buttons unavailable:', error);
    return () => {};
  }
}
