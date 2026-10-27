import { useEffect, useState } from 'react';
import type { RadioStation } from '../types';

/**
 * What a live SomaFM station is playing (its public songs list, open to any
 * site), asked every 30 seconds only while `enabled` (the radio's panel is on
 * screen and the station is playing). Null for other stations, or when it
 * can't be had.
 */
const EVERY_MS = 30_000;

function somaId(station: RadioStation | null): string | null {
  const m = station?.streamUrl ? /somafm\.com\/([a-z0-9]+)-/i.exec(station.streamUrl) : null;
  return m ? m[1] : null;
}

export function useLiveNowPlaying(station: RadioStation | null, enabled: boolean): { artist: string; title: string } | null {
  const id = somaId(station);
  const [song, setSong] = useState<{ id: string; artist: string; title: string } | null>(null);
  useEffect(() => {
    if (!id || !enabled) return;
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`https://somafm.com/songs/${id}.json`);
        if (!res.ok) return;
        const json = (await res.json()) as { songs?: Array<{ artist?: string; title?: string }> };
        const first = json.songs?.[0];
        if (live && first?.title) setSong({ id, artist: first.artist ?? '', title: first.title });
      } catch {
        /* nothing shown this time */
      }
    };
    void load();
    const t = window.setInterval(load, EVERY_MS);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [id, enabled]);
  return song && song.id === id ? { artist: song.artist, title: song.title } : null;
}
