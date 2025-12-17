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
      stationaryTime: 0,
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

        // Update all members with varied behavior for different badges
        const updatedMembers = prev.members.map((member, index) => {
          let memberSpeed: number;
          let stationaryIncrement = 0;
          
          // Give each member a different behavior pattern
          if (index === 2) {
            // SpeedDemon - fastest rider, aggressive acceleration
            const speedBase = 60 + Math.sin((elapsedSeconds + index) / 3) * 35;
            memberSpeed = Math.max(5, Math.min(140, speedBase + (Math.random() - 0.3) * 20));
          } else if (index === 1) {
            // RoadRunner - consistent high distance, moderate speed
            memberSpeed = 55 + Math.sin((elapsedSeconds + index) / 6) * 15 + (Math.random() - 0.5) * 10;
            memberSpeed = Math.max(40, Math.min(80, memberSpeed));
          } else if (index === 4) {
            // NightRider - frequently stops, gets Rocksteady badge
            const stopChance = Math.sin(elapsedSeconds / 4);
            if (stopChance > 0.3) {
              memberSpeed = 0;
              stationaryIncrement = 0.5; // Add 0.5 seconds of stationary time
            } else {
              memberSpeed = 35 + Math.random() * 25;
            }
          } else {
            // Others - normal varied speeds
            const memberBaseSpeed = 40 + (index * 5) + Math.sin((elapsedSeconds + index * 2) / 4) * 25;
            const memberVariation = (Math.random() - 0.5) * 15;
            memberSpeed = Math.max(0, Math.min(100, memberBaseSpeed + memberVariation));
            if (memberSpeed < 5) {
              memberSpeed = 0;
              stationaryIncrement = 0.5;
            }
          }
          
          const memberTopSpeed = Math.max(member.topSpeed || 0, memberSpeed);
          
          // Accumulate member distance
          const memberDistanceIncrement = memberSpeed / 3600 * 0.5;
          const memberDistance = (member.distanceDriven || 0) + memberDistanceIncrement;
          
          // Track stationary time
          const memberStationaryTime = (member.stationaryTime || 0) + stationaryIncrement;

          return {
            ...member,
            currentSpeed: Math.round(memberSpeed),
            topSpeed: Math.round(memberTopSpeed),
            distanceDriven: memberDistance,
            stationaryTime: memberStationaryTime,
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
