import type { SpeedUnit, DistanceUnit } from '@/features/settings';

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

/** Compact generalised count: 950 -> "950", 3700 -> "3.7k", 2_200_000 -> "2.2M" */
export function formatCompactCount(n: number): string {
  if (n < 1000) return Math.round(n).toString();
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)}k`;
  }
  const v = n / 1_000_000;
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)}M`;
}

/** Compact distance number (unit rendered separately via getDistanceLabel) */
export function formatCompactDistance(miles: number, unit: DistanceUnit = 'miles'): string {
  const value = unit === 'km' ? miles * MILES_TO_KM : miles;
  return formatCompactCount(value);
}

/** Compact duration: "4d", "12h", "45m", "30s" — largest meaningful unit only */
export function formatCompactDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(seconds)}s`;
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
