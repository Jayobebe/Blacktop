export interface UserProfile {
  name: string;
  createdAt: string;
  preferredNavApp: 'google' | 'waze' | 'apple';
}

export interface RideSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  isConvoyRide: boolean;
  distance: number; // in miles
  duration: number; // in seconds
  averageSpeed: number; // in mph
  maxSpeed: number; // in mph
  gpsPoints: GpsPoint[];
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
}

export type NavigationApp = 'google' | 'waze' | 'apple';

export interface AppSettings {
  preferredNavApp: NavigationApp;
  hasCompletedOnboarding: boolean;
}
