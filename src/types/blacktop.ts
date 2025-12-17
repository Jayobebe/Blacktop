export interface UserProfile {
  name: string;
  createdAt: string;
  preferredNavApp: 'google' | 'waze' | 'apple';
}

export interface BadgeCounts {
  speedDemon: number;
  journeyman: number;
  rocksteady: number;
}

export interface RideSession {
  id: string;
  name?: string; // Optional custom name for the ride
  startedAt: string;
  endedAt: string | null;
  isConvoyRide: boolean;
  distance: number; // in miles
  duration: number; // in seconds
  averageSpeed: number; // in mph
  maxSpeed: number; // in mph
  gpsPoints: GpsPoint[];
  earnedBadge?: 'speed-demon' | 'journeyman' | 'rocksteady'; // Badge earned in this ride
}

export interface GpsPoint {
  lat: number;
  lng: number;
  speed: number; // in mph
  timestamp: number;
}

export interface RideStats {
  totalRides: number;
  totalDistance: number; // in miles
  totalDuration: number; // in seconds
  personalTopSpeed: number; // in mph
  averageRideLength: number; // in miles
  convoyRides: number;
  badges: BadgeCounts;
}

export interface GpsStatus {
  accuracy: number | null; // in meters
  lastUpdate: number | null; // timestamp
  source: 'device' | 'calculated' | 'none';
}

export interface ActiveRideState {
  isActive: boolean;
  startedAt: string | null;
  isConvoyMode: boolean;
  currentSpeed: number;
  maxSpeed: number;
  distance: number;
  duration: number;
  gpsPoints: GpsPoint[];
  gpsStatus: GpsStatus;
}

export type NavigationApp = 'google' | 'waze' | 'apple';

export interface AppSettings {
  preferredNavApp: NavigationApp;
  hasCompletedOnboarding: boolean;
}
