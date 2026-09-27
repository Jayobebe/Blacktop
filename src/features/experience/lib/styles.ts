import type { LucideIcon } from 'lucide-react';
import { Briefcase, HeartPulse, Sun, Flame, PartyPopper } from 'lucide-react';
import type { ExperienceTerms } from './terms';
import type { RideStyle } from './profile';

export interface StyleInfo {
  id: RideStyle;
  icon: LucideIcon;
  title: (t: ExperienceTerms) => string;
  subtitle: (t: ExperienceTerms) => string;
  /** "Popular with …" on recommended deck cards. */
  crowd: (t: ExperienceTerms) => string;
}

/** "What's a typical ride for you?" — orders the care deck, most relevant first. */
export const RIDE_STYLES: StyleInfo[] = [
  {
    id: 'commute',
    crowd: () => 'commuters',
    icon: Briefcase,
    title: () => 'Getting from A to B',
    subtitle: (t) => `Commutes and errands. You want the ${t.ride} to be easy and safe.`,
  },
  {
    id: 'fitness',
    crowd: () => 'fitness riders',
    icon: HeartPulse,
    title: () => 'Staying fit',
    subtitle: () => 'Distance, time and progress over the weeks.',
  },
  {
    id: 'leisure',
    crowd: (t) => `weekend ${t.riders}`,
    icon: Sun,
    title: (t) => `Weekend ${t.rides} and trips`,
    subtitle: () => 'Scenic routes, good weather, nowhere to be.',
  },
  {
    id: 'performance',
    crowd: (t) => `fast ${t.riders}`,
    icon: Flame,
    title: () => 'Pushing the limits',
    subtitle: () => 'Track days, twisties and every number that comes with them.',
  },
  {
    id: 'social',
    crowd: () => 'crews',
    icon: PartyPopper,
    title: (t) => `${t.Rides} with mates`,
    subtitle: () => 'Meet-ups, crews and bragging rights.',
  },
];
