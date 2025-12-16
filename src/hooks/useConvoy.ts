import { useState, useCallback } from 'react';
import { Convoy, ConvoyMember, Destination, ConvoyStats } from '@/types/convoy';

// Mock data for demonstration
const mockMembers: ConvoyMember[] = [
  {
    id: '1',
    name: 'Alex (Leader)',
    isLeader: true,
    isSpeaking: false,
    isOnline: true,
    currentSpeed: 72,
    topSpeed: 95,
    distanceDriven: 145.3,
    joinedAt: new Date(Date.now() - 3600000),
  },
  {
    id: '2',
    name: 'Jordan',
    isLeader: false,
    isSpeaking: true,
    isOnline: true,
    currentSpeed: 68,
    topSpeed: 88,
    distanceDriven: 142.1,
    joinedAt: new Date(Date.now() - 3400000),
  },
  {
    id: '3',
    name: 'Sam',
    isLeader: false,
    isSpeaking: false,
    isOnline: true,
    currentSpeed: 70,
    topSpeed: 92,
    distanceDriven: 143.8,
    joinedAt: new Date(Date.now() - 3200000),
  },
  {
    id: '4',
    name: 'Casey',
    isLeader: false,
    isSpeaking: false,
    isOnline: true,
    currentSpeed: 65,
    topSpeed: 85,
    distanceDriven: 140.5,
    joinedAt: new Date(Date.now() - 3000000),
  },
];

const mockConvoy: Convoy = {
  id: '1',
  name: 'Highway Runners',
  code: 'HWR-2847',
  members: mockMembers,
  destination: undefined,
  createdAt: new Date(Date.now() - 3600000),
  totalDistance: 571.7,
  groupTopSpeed: 95,
};

export function useConvoy() {
  const [convoy, setConvoy] = useState<Convoy>(mockConvoy);
  const [currentUser] = useState<ConvoyMember>(mockMembers[0]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const stats: ConvoyStats = {
    groupDistance: convoy.totalDistance,
    groupTopSpeed: convoy.groupTopSpeed,
    personalDistance: currentUser.distanceDriven,
    personalTopSpeed: currentUser.topSpeed,
    averageSpeed: Math.round(convoy.members.reduce((a, b) => a + b.currentSpeed, 0) / convoy.members.length),
    tripDuration: Math.round((Date.now() - convoy.createdAt.getTime()) / 60000),
  };

  const setDestination = useCallback((destination: Omit<Destination, 'id' | 'setBy' | 'setAt'>) => {
    const newDestination: Destination = {
      ...destination,
      id: Math.random().toString(36).substr(2, 9),
      setBy: currentUser.name,
      setAt: new Date(),
    };
    setConvoy(prev => ({ ...prev, destination: newDestination }));
    return newDestination;
  }, [currentUser]);

  const clearDestination = useCallback(() => {
    setConvoy(prev => ({ ...prev, destination: undefined }));
  }, []);

  const toggleSpeaking = useCallback(() => {
    setIsSpeaking(prev => !prev);
  }, []);

  const openNavigation = useCallback((app: 'google' | 'apple' | 'waze') => {
    if (!convoy.destination) return;
    
    const { lat, lng, name } = convoy.destination;
    let url = '';
    
    switch (app) {
      case 'google':
        url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(name)}`;
        break;
      case 'apple':
        url = `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
        break;
      case 'waze':
        url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
        break;
    }
    
    window.open(url, '_blank');
  }, [convoy.destination]);

  return {
    convoy,
    currentUser,
    stats,
    isSpeaking,
    setDestination,
    clearDestination,
    toggleSpeaking,
    openNavigation,
  };
}
