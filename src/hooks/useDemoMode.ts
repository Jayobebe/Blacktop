import { useCallback, useEffect, useRef, useState } from 'react';
import { ConvoyMemberInfo } from '@/types/convoy';

const DEMO_MEMBERS: ConvoyMemberInfo[] = [
  {
    id: 'demo-1',
    userId: 'demo-user-1',
    name: 'You',
    isLeader: true,
    isReady: true,
    hasNavigated: true,
    joinedAt: new Date().toISOString(),
    currentSpeed: 0,
    topSpeed: 0,
    distanceDriven: 0,
  },
  {
    id: 'demo-2',
    userId: 'demo-user-2',
    name: 'RoadRunner',
    isLeader: false,
    isReady: true,
    hasNavigated: true,
    joinedAt: new Date().toISOString(),
    currentSpeed: 0,
    topSpeed: 0,
    distanceDriven: 0,
  },
  {
    id: 'demo-3',
    userId: 'demo-user-3',
    name: 'SpeedDemon',
    isLeader: false,
    isReady: true,
    hasNavigated: true,
    joinedAt: new Date().toISOString(),
    currentSpeed: 0,
    topSpeed: 0,
    distanceDriven: 0,
  },
  {
    id: 'demo-4',
    userId: 'demo-user-4',
    name: 'CruiserKing',
    isLeader: false,
    isReady: true,
    hasNavigated: true,
    joinedAt: new Date().toISOString(),
    currentSpeed: 0,
    topSpeed: 0,
    distanceDriven: 0,
  },
  {
    id: 'demo-5',
    userId: 'demo-user-5',
    name: 'NightRider',
    isLeader: false,
    isReady: true,
    hasNavigated: false,
    joinedAt: new Date().toISOString(),
    currentSpeed: 0,
    topSpeed: 0,
    distanceDriven: 0,
  },
];

interface DemoState {
  isActive: boolean;
  members: ConvoyMemberInfo[];
  speakingUsers: Set<string>;
  currentSpeed: number;
  maxSpeed: number;
  distance: number;
  duration: number;
}

export function useDemoMode() {
  const [demoState, setDemoState] = useState<DemoState>({
    isActive: false,
    members: [],
    speakingUsers: new Set(),
    currentSpeed: 0,
    maxSpeed: 0,
    distance: 0,
    duration: 0,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startDemo = useCallback(() => {
    startTimeRef.current = Date.now();
    
    // Initialize members with starting stats
    const initialMembers = DEMO_MEMBERS.map((m, index) => ({
      ...m,
      currentSpeed: 0,
      topSpeed: 0,
      distanceDriven: 0,
    }));

    setDemoState({
      isActive: true,
      members: initialMembers,
      speakingUsers: new Set(),
      currentSpeed: 0,
      maxSpeed: 0,
      distance: 0,
      duration: 0,
    });

    // Main simulation loop - updates every 500ms
    intervalRef.current = setInterval(() => {
      setDemoState((prev) => {
        if (!prev.isActive) return prev;

        const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Simulate realistic speed changes for user
        const baseSpeed = 45 + Math.sin(elapsedSeconds / 5) * 20;
        const speedVariation = (Math.random() - 0.5) * 10;
        const newSpeed = Math.max(0, Math.min(120, baseSpeed + speedVariation));
        const newMaxSpeed = Math.max(prev.maxSpeed, newSpeed);
        
        // Accumulate distance (speed in mph, time in seconds)
        const distanceIncrement = newSpeed / 3600 * 0.5; // 0.5 second intervals
        const newDistance = prev.distance + distanceIncrement;

        // Update all members with realistic but varied speeds
        const updatedMembers = prev.members.map((member, index) => {
          // Each member has their own speed pattern
          const memberBaseSpeed = 40 + (index * 5) + Math.sin((elapsedSeconds + index * 2) / 4) * 25;
          const memberVariation = (Math.random() - 0.5) * 15;
          const memberSpeed = Math.max(0, Math.min(130, memberBaseSpeed + memberVariation));
          const memberTopSpeed = Math.max(member.topSpeed || 0, memberSpeed);
          
          // Accumulate member distance
          const memberDistanceIncrement = memberSpeed / 3600 * 0.5;
          const memberDistance = (member.distanceDriven || 0) + memberDistanceIncrement;

          return {
            ...member,
            currentSpeed: Math.round(memberSpeed),
            topSpeed: Math.round(memberTopSpeed),
            distanceDriven: memberDistance,
          };
        });

        return {
          ...prev,
          members: updatedMembers,
          currentSpeed: Math.round(newSpeed),
          maxSpeed: Math.round(newMaxSpeed),
          distance: newDistance,
          duration: elapsedSeconds,
        };
      });
    }, 500);

    // Speaking simulation - random members "speak" periodically
    speakingIntervalRef.current = setInterval(() => {
      setDemoState((prev) => {
        if (!prev.isActive) return prev;

        const newSpeakingUsers = new Set<string>();
        
        // Random chance for each member to be speaking
        prev.members.forEach((member) => {
          // 15% chance to be speaking at any moment
          if (Math.random() < 0.15) {
            newSpeakingUsers.add(member.userId);
          }
        });

        return {
          ...prev,
          speakingUsers: newSpeakingUsers,
        };
      });
    }, 800);

  }, []);

  const stopDemo = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }

    setDemoState({
      isActive: false,
      members: [],
      speakingUsers: new Set(),
      currentSpeed: 0,
      maxSpeed: 0,
      distance: 0,
      duration: 0,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);
    };
  }, []);

  return {
    demoState,
    startDemo,
    stopDemo,
  };
}
