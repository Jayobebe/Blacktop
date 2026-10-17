import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeAudioRoutePlugin {
  startCommunicationAudio(): Promise<void>;
  refreshCommunicationAudio(): Promise<void>;
  stopCommunicationAudio(): Promise<void>;
  startMediaButtons(): Promise<void>;
  stopMediaButtons(): Promise<void>;
  addListener(event: 'mediaButton', cb: (e?: { key?: string; bluetooth?: boolean }) => void): Promise<{ remove: () => Promise<void> }>;
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
export type MediaButtonKey = 'play' | 'pause' | 'toggle';

/** Convoy voice and the armed alarm can both want the buttons: the session stays up while either does. */
let mediaButtonUsers = 0;

/**
 * The Android app's own media session: a headset's or intercom's play / pause
 * button calls `onPress` (the web view has no media session of its own to
 * receive it), with whether it came from a connected Bluetooth device (the
 * alarm takes only those: wired earphones can be plugged into a parked phone
 * without unlocking it). Returns a stop. A no-op elsewhere.
 */
export async function listenToMediaButtons(onPress: (key: MediaButtonKey, bluetooth: boolean) => void): Promise<() => void> {
  if (Capacitor.getPlatform() !== 'android') return () => {};
  try {
    // Which key: an app built before keys were sent says nothing, which is a toggle (and not known to be Bluetooth).
    const handle = await NativeAudioRoute.addListener('mediaButton', (e) =>
      onPress(e?.key === 'play' ? 'play' : e?.key === 'pause' ? 'pause' : 'toggle', e?.bluetooth === true),
    );
    mediaButtonUsers += 1;
    await NativeAudioRoute.startMediaButtons();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      void handle.remove();
      mediaButtonUsers = Math.max(0, mediaButtonUsers - 1);
      if (mediaButtonUsers === 0) void NativeAudioRoute.stopMediaButtons().catch(() => {});
    };
  } catch (error) {
    console.warn('[Voice] Media buttons unavailable:', error);
    return () => {};
  }
}
