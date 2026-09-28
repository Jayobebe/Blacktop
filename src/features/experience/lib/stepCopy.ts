import type { ExperienceTerms } from './terms';
import { tr } from '@/lib/i18n';

export type SetupStep = 'vehicle' | 'mode' | 'style' | 'care' | 'preview';

export const SETUP_STEPS: SetupStep[] = ['vehicle', 'mode', 'style', 'care', 'preview'];

/** Eyebrow / title / subtitle for each setup step. */
export function stepCopy(step: SetupStep, t: ExperienceTerms) {
  switch (step) {
    case 'vehicle':
      return { eyebrow: tr("Your machine"), title: tr("What do you ride?"), subtitle: tr("Pick everything you use. The first one is your main.") };
    case 'mode':
      return { eyebrow: tr("Your crew"), title: tr("Who's coming with you?"), subtitle: tr("This sets up your Home screen.") };
    case 'style':
      return { eyebrow: tr("Your style"), title: tr("What's a typical {0}?", [t.ride]), subtitle: tr("We'll ask about the things that matter most to you first.") };
    case 'care':
      return { eyebrow: tr("Your priorities"), title: tr("Make it yours."), subtitle: tr("Anything you skip is hidden, not deleted. Bring it back any time in Settings.") };
    case 'preview':
      return { eyebrow: tr("Your Blacktop"), title: tr("Built around how you {0}.", [t.ride]), subtitle: tr("Change any of this later in Settings.") };
  }
}
