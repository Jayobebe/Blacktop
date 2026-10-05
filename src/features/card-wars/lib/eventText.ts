import { Bug, Camera, CircleDot, CloudRain, Droplets, Flag, Orbit, ShieldCheck, Users, Wind, Wrench, type LucideIcon } from 'lucide-react';
import { tr } from '@/lib/i18n';
import type { RoundEvent } from './events';

export const EVENT_ICON: Record<RoundEvent, LucideIcon> = {
  rain: CloudRain,
  tailwind: Wind,
  pitstop: Wrench,
  redflag: Flag,
  oil: Droplets,
  tyres: CircleDot,
  photo: Camera,
  safety: ShieldCheck,
  crowd: Users,
  gremlin: Bug,
  rapture: Orbit,
};

export function eventName(e: RoundEvent): string {
  switch (e) {
    case 'rain':
      return tr("Rain");
    case 'tailwind':
      return tr("Tailwind");
    case 'pitstop':
      return tr("Pit stop");
    case 'redflag':
      return tr("Red flag");
    case 'oil':
      return tr("Oil on track");
    case 'tyres':
      return tr("Fresh tyres");
    case 'photo':
      return tr("Photo finish");
    case 'safety':
      return tr("Safety car");
    case 'crowd':
      return tr("Home crowd");
    case 'gremlin':
      return tr("Mechanical gremlin");
    default:
      return tr("Rapture");
  }
}

export function eventEffect(e: RoundEvent): string {
  switch (e) {
    case 'rain':
      return tr("Ratings are pulled closer together. Anyone's round.");
    case 'tailwind':
      return tr("The winner hits 15 harder.");
    case 'pitstop':
      return tr("Each side's most damaged card gets 15 health back.");
    case 'redflag':
      return tr("Round stopped: no damage, dog tags handed back.");
    case 'oil':
      return tr("A Corners round does double damage.");
    case 'tyres':
      return tr("Both cards ride as new: wear doesn't count this round.");
    case 'photo':
      return tr("Within 5% is a draw, and both cards take 10.");
    case 'safety':
      return tr("No card can burn out this round.");
    case 'crowd':
      return tr("A card that's already won a round gets 8% more.");
    case 'gremlin':
      return tr("Dog tags jam: no effect, and they're not used up.");
    default:
      return tr("A tractor beam takes each side's best card. Yours beams back home at full condition.");
  }
}
