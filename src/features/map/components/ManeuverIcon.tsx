import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  GitFork,
  Merge,
  RotateCcw,
  RotateCw,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** The arrow for a manoeuvre (the turn banner's and the ride screen's mini map's). */
export function ManeuverIcon({ m, className }: { m: { type: string; modifier?: string | null; side?: 'left' | 'right' }; className?: string }) {
  const mod = m.modifier ?? 'straight';
  if (m.type === 'arrive') return <Flag className={className} />;
  if (m.type === 'roundabout' || m.type === 'rotary' || m.type === 'roundabout turn') {
    // Round the island the way traffic goes: clockwise where they drive on the left.
    return m.side === 'left' ? <RotateCw className={className} /> : <RotateCcw className={className} />;
  }
  if (m.type === 'merge') return <Merge className={cn(className, mod.includes('left') && '-scale-x-100')} />;
  if (m.type === 'fork') return <GitFork className={cn(className, 'rotate-180', mod.includes('left') && '-scale-x-100')} />;
  switch (mod) {
    case 'uturn':
      return <Undo2 className={cn(className, '-rotate-90')} />;
    case 'sharp left':
    case 'left':
      return <CornerUpLeft className={className} />;
    case 'sharp right':
    case 'right':
      return <CornerUpRight className={className} />;
    case 'slight left':
      return <ArrowUpLeft className={className} />;
    case 'slight right':
      return <ArrowUpRight className={className} />;
    default:
      return <ArrowUp className={className} />;
  }
}
