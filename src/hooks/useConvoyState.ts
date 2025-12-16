import { useCallback, useSyncExternalStore } from 'react';
import { ConvoyState, ConvoyMemberInfo, ConvoyDestination } from '@/types/convoy';
import { useProfile } from './useProfile';

type Listener = () => void;
const listeners = new Set<Listener>();

let convoyState: ConvoyState = {
  id: null,
  code: null,
  isLeader: false,
  members: [],
  isActive: false,
  destination: null,
};

function getSnapshot(): ConvoyState {
  return convoyState;
}

function getServerSnapshot(): ConvoyState {
  return convoyState;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach(l => l());
}

function setConvoyState(updater: (prev: ConvoyState) => ConvoyState) {
  convoyState = updater(convoyState);
  emitChange();
}

function generateConvoyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function useConvoyState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { profile } = useProfile();

  const createConvoy = useCallback(() => {
    const code = generateConvoyCode();
    const id = crypto.randomUUID();
    const member: ConvoyMemberInfo = {
      id: crypto.randomUUID(),
      name: profile.name,
      isLeader: true,
      isReady: true,
      joinedAt: new Date().toISOString(),
    };

    setConvoyState(() => ({
      id,
      code,
      isLeader: true,
      members: [member],
      isActive: true,
      destination: null,
    }));

    return { id, code };
  }, [profile.name]);

  const joinConvoy = useCallback((code: string) => {
    const member: ConvoyMemberInfo = {
      id: crypto.randomUUID(),
      name: profile.name,
      isLeader: false,
      isReady: true,
      joinedAt: new Date().toISOString(),
    };

    setConvoyState(() => ({
      id: crypto.randomUUID(),
      code: code.toUpperCase(),
      isLeader: false,
      members: [
        {
          id: crypto.randomUUID(),
          name: 'Convoy Leader',
          isLeader: true,
          isReady: true,
          joinedAt: new Date().toISOString(),
        },
        member,
      ],
      isActive: true,
      destination: null,
    }));

    return true;
  }, [profile.name]);

  const leaveConvoy = useCallback(() => {
    setConvoyState(() => ({
      id: null,
      code: null,
      isLeader: false,
      members: [],
      isActive: false,
      destination: null,
    }));
  }, []);

  const setDestination = useCallback((destination: ConvoyDestination) => {
    setConvoyState((prev) => ({
      ...prev,
      destination,
    }));
  }, []);

  const clearDestination = useCallback(() => {
    setConvoyState((prev) => ({
      ...prev,
      destination: null,
    }));
  }, []);

  return {
    convoy: state,
    createConvoy,
    joinConvoy,
    leaveConvoy,
    setDestination,
    clearDestination,
  };
}
