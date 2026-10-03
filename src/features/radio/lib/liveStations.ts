import type { RadioStation } from '../types';

/**
 * Built-in live internet stations. They're streamed straight from the
 * broadcaster (SomaFM: listener-supported, free to link from players), never
 * stored, and sit on the dial ahead of the rider's own file stations.
 */
export const LIVE_STATIONS: RadioStation[] = [
  { id: 'live_metal', name: 'Metal Detector', color: 'red', icon: 'guitar', tracks: [], createdAt: '', streamUrl: 'https://ice1.somafm.com/metal-128-mp3' },
  { id: 'live_bootliquor', name: 'Boot Liquor', color: 'orange', icon: 'guitar', tracks: [], createdAt: '', streamUrl: 'https://ice1.somafm.com/bootliquor-128-mp3' },
  { id: 'live_u80s', name: 'Underground 80s', color: 'pink', icon: 'disc', tracks: [], createdAt: '', streamUrl: 'https://ice1.somafm.com/u80s-128-mp3' },
  { id: 'live_defcon', name: 'DEF CON Radio', color: 'green', icon: 'headphones', tracks: [], createdAt: '', streamUrl: 'https://ice1.somafm.com/defcon-128-mp3' },
  { id: 'live_groovesalad', name: 'Groove Salad', color: 'cyan', icon: 'music', tracks: [], createdAt: '', streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { id: 'live_secretagent', name: 'Secret Agent', color: 'purple', icon: 'radio', tracks: [], createdAt: '', streamUrl: 'https://ice1.somafm.com/secretagent-128-mp3' },
];

export function getLiveStation(id: string | null) {
  return id ? LIVE_STATIONS.find((s) => s.id === id) || null : null;
}
