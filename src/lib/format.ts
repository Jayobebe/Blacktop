import type { SpeedUnit, DistanceUnit } from '@/hooks/useSettings';

const MPH_TO_KPH = 1.60934;
const MILES_TO_KM = 1.60934;

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatDistance(miles: number, unit: DistanceUnit = 'miles'): string {
  const value = unit === 'km' ? miles * MILES_TO_KM : miles;
  
  if (value < 0.1) {
    return '0.0';
  }
  if (value < 10) {
    return value.toFixed(1);
  }
  return Math.round(value).toString();
}

export function formatSpeed(mph: number, unit: SpeedUnit = 'mph'): number {
  return unit === 'kph' ? Math.round(mph * MPH_TO_KPH) : Math.round(mph);
}

export function getSpeedLabel(unit: SpeedUnit = 'mph'): string {
  return unit === 'kph' ? 'KPH' : 'MPH';
}

export function getDistanceLabel(unit: DistanceUnit = 'miles'): string {
  return unit === 'km' ? 'km' : 'mi';
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
