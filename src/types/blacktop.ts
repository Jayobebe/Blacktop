import type { BadgeType } from './convoy';
export interface UserProfile {
  name: string;
  createdAt: string;
  preferredNavApp: NavigationApp;
}

export interface BadgeCounts {
  speedDemon: number;
  journeyman: number;
  fallback: number;
}

export interface RidePhoto {
  id: string;
  dataUrl: string; // base64 encoded image
  addedAt: string;
  caption?: string;
}

export interface RideRecording {
  id: string;
  filename: string;
  blobUrl?: string; // Temporary URL for pending download
  thumbnailUrl?: string; // Thumbnail image from the recording
  savedAt?: string; // When it was saved to device
  duration?: number; // Recording duration in seconds
  size?: number; // File size in bytes
}

export interface LeanSample {
  angle: number; // in degrees, positive = right, negative = left
  timestamp: number;
}

export interface GForceSample {
  g: number; // total acceleration magnitude in g (includes gravity, ~1.0 at rest)
  timestamp: number;
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
  maxLeanLeft: number; // in degrees (absolute value)
  maxLeanRight: number; // in degrees (absolute value)
  maxGForce?: number; // peak total G magnitude during the ride; absent on rides recorded before this feature existed
  gpsPoints: GpsPoint[];
  leanSamples?: LeanSample[]; // High-frequency lean data (10Hz)
  gForceSamples?: GForceSample[]; // High-frequency G-force data (10Hz)
  earnedBadges?: BadgeType[]; // Badges earned in this ride (convoy only)
  photos?: RidePhoto[]; // Local-only photos
  recording?: RideRecording; // Video recording from live stream
  overlayAvailable?: boolean; // Overlay video stored locally for download
  overlayBlobUrl?: string; // Legacy: temporary blob URL (not persisted); kept for backward compatibility
  bikeId?: string; // Garage: which bike this ride was logged against
}

export interface GpsPoint {
  lat: number;
  lng: number;
  speed: number; // in mph
  timestamp: number;
  leanAngle?: number; // in degrees, positive = right, negative = left
}

export interface RideStats {
  totalRides: number;
  totalDistance: number; // in miles
  totalDuration: number; // in seconds
  personalTopSpeed: number; // in mph
  personalMaxGForce: number; // peak total G magnitude across all rides; 0 if none recorded
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
  isPaused: boolean;
  currentSpeed: number;
  maxSpeed: number;
  currentLean: number; // in degrees, positive = right, negative = left
  maxLeanLeft: number; // in degrees (absolute value)
  maxLeanRight: number; // in degrees (absolute value)
  maxGForce: number; // peak total G magnitude so far this ride
  distance: number;
  duration: number;
  gpsPoints: GpsPoint[];
  leanSamples: LeanSample[]; // High-frequency lean data (10Hz)
  gForceSamples: GForceSample[]; // High-frequency G-force data (10Hz)
  gpsStatus: GpsStatus;
  inactivityTimedOut: boolean; // true once the inactivity guard has paused tracking
}

export type NavigationApp = 'google' | 'waze' | 'apple' | 'blacktop';

export interface AppSettings {
  preferredNavApp: NavigationApp;
  hasCompletedOnboarding: boolean;
}
