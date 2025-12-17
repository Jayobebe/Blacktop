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

        // Update all members with varied behavior
        // Leader (index 0) should win ALL badges: top speed, most distance, most stationary time
        const updatedMembers = prev.members.map((member, index) => {
          let memberSpeed: number;
          let stationaryIncrement = 0;
          
          if (index === 0) {
            // Leader (You) - wins all badges
            // High speed bursts for Speed Demon + consistent movement for Journeyman
            // Also accumulate stationary time for Rocksteady
            const phase = elapsedSeconds % 10;
            if (phase < 2) {
              // Brief stops to accumulate stationary time
              memberSpeed = 0;
              stationaryIncrement = 0.5;
            } else {
              // High speed riding - ensures top speed and good distance
              memberSpeed = 70 + Math.sin(elapsedSeconds / 2) * 30 + (Math.random() - 0.3) * 15;
              memberSpeed = Math.max(60, Math.min(130, memberSpeed));
            }
          } else if (index === 2) {
            // SpeedDemon name - fast but not as fast as leader
            const speedBase = 50 + Math.sin((elapsedSeconds + index) / 3) * 30;
            memberSpeed = Math.max(5, Math.min(110, speedBase + (Math.random() - 0.3) * 15));
          } else if (index === 1) {
            // RoadRunner - good distance but less than leader
            memberSpeed = 45 + Math.sin((elapsedSeconds + index) / 6) * 15 + (Math.random() - 0.5) * 10;
            memberSpeed = Math.max(30, Math.min(70, memberSpeed));
          } else if (index === 4) {
            // NightRider - stops sometimes but less than leader
            const stopChance = Math.sin(elapsedSeconds / 6);
            if (stopChance > 0.5) {
              memberSpeed = 0;
              stationaryIncrement = 0.5;
            } else {
              memberSpeed = 35 + Math.random() * 25;
            }
          } else {
            // Others - normal varied speeds
            const memberBaseSpeed = 35 + (index * 3) + Math.sin((elapsedSeconds + index * 2) / 4) * 20;
            const memberVariation = (Math.random() - 0.5) * 15;
            memberSpeed = Math.max(0, Math.min(90, memberBaseSpeed + memberVariation));
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
