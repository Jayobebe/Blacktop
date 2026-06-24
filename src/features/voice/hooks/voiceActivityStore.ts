import { useSyncExternalStore } from 'react';

// useVoiceChannel keeps its own React state for speakingUsers (and owns the
// single live WebRTC connection for the convoy), but other features — like
// the map's member markers — need read access to "who's talking right now"
// without instantiating a second voice connection. This module-level store
// mirrors that state for those external readers.
type Listener = () => void;
const listeners = new Set<Listener>();

let speakingUsers: Set<string> = new Set();

function getSnapshot(): Set<string> {
  return speakingUsers;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Called by useVoiceChannel whenever its local speakingUsers state changes.
export function setSpeakingUsers(next: Set<string>) {
  speakingUsers = next;
  listeners.forEach((l) => l());
}

export function useSpeakingUsers(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
