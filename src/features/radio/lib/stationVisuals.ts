import { Radio, Music, Disc3, Guitar, Mic2, Headphones, type LucideIcon } from 'lucide-react';
import { ACCENT_COLORS, type AccentColor } from '@/features/settings';
import type { RadioIcon } from '../types';
import { tr } from '@/lib/i18n';

export const RADIO_ICONS: { id: RadioIcon; Icon: LucideIcon; label: string }[] = [
  { id: 'radio', Icon: Radio, label: tr("Radio") },
  { id: 'music', Icon: Music, label: tr("Music") },
  { id: 'disc', Icon: Disc3, label: tr("Disc") },
  { id: 'guitar', Icon: Guitar, label: tr("Guitar") },
  { id: 'mic', Icon: Mic2, label: tr("Mic") },
  { id: 'headphones', Icon: Headphones, label: tr("Phones") },
];

export function getRadioIcon(id: RadioIcon): LucideIcon {
  return RADIO_ICONS.find((i) => i.id === id)?.Icon || Radio;
}

/** Reuses the app's accent palette so stations match Blacktop's theming. */
export function stationHsl(color: AccentColor): string {
  return (ACCENT_COLORS.find((c) => c.id === color) || ACCENT_COLORS[0]).hsl;
}

export function trackTitle(name: string | null): string {
  if (!name) return tr("No track");
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
