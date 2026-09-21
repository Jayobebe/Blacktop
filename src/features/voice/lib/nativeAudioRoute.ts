import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeAudioRoutePlugin {
  startCommunicationAudio(): Promise<void>;
  refreshCommunicationAudio(): Promise<void>;
  stopCommunicationAudio(): Promise<void>;
}

const NativeAudioRoute = registerPlugin<NativeAudioRoutePlugin>('NativeAudioRoute');

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