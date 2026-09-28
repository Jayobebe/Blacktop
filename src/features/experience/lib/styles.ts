import type { LucideIcon } from 'lucide-react';
import { Briefcase, HeartPulse, Sun, Flame, PartyPopper } from 'lucide-react';
import type { ExperienceTerms } from './terms';
import type { RideStyle } from './profile';

import { tr } from '@/lib/i18n';
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
    crowd: () => tr("commuters"),
    icon: Briefcase,
    title: () => tr("Getting from A to B"),
    subtitle: (t) => tr("Commutes and errands. You want the {0} to be easy and safe.", [t.ride]),
  },
  {
    id: 'fitness',
    crowd: () => tr("fitness riders"),
    icon: HeartPulse,
    title: () => tr("Staying fit"),
    subtitle: () => tr("Distance, time and progress over the weeks."),
  },
  {
    id: 'leisure',
    crowd: (t) => tr("weekend {0}", [t.riders]),
    icon: Sun,
    title: (t) => tr("Weekend {0} and trips", [t.rides]),
    subtitle: () => tr("Scenic routes, good weather, nowhere to be."),
  },
  {
    id: 'performance',
    crowd: (t) => tr("fast {0}", [t.riders]),
    icon: Flame,
    title: () => tr("Pushing the limits"),
    subtitle: () => tr("Track days, twisties and every number that comes with them."),
  },
  {
    id: 'social',
    crowd: () => tr("crews"),
    icon: PartyPopper,
    title: (t) => tr("{0} with mates", [t.Rides]),
    subtitle: () => tr("Meet-ups, crews and bragging rights."),
  },
];
