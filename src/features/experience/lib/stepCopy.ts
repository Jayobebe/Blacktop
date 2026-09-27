import type { ExperienceTerms } from './terms';

export type SetupStep = 'vehicle' | 'mode' | 'style' | 'care' | 'preview';

export const SETUP_STEPS: SetupStep[] = ['vehicle', 'mode', 'style', 'care', 'preview'];

/** Eyebrow / title / subtitle for each setup step. */
export function stepCopy(step: SetupStep, t: ExperienceTerms) {
  switch (step) {
    case 'vehicle':
      return { eyebrow: 'Your machine', title: 'What do you ride?', subtitle: 'Pick everything you use. The first one is your main.' };
    case 'mode':
      return { eyebrow: 'Your crew', title: "Who's coming with you?", subtitle: 'This sets up your Home screen.' };
    case 'style':
      return { eyebrow: 'Your style', title: `What's a typical ${t.ride}?`, subtitle: "We'll ask about the things that matter most to you first." };
    case 'care':
      return { eyebrow: 'Your priorities', title: 'Make it yours.', subtitle: 'Anything you skip is hidden, not deleted. Bring it back any time in Settings.' };
    case 'preview':
      return { eyebrow: 'Your Blacktop', title: `Built around how you ${t.ride}.`, subtitle: 'Change any of this later in Settings.' };
  }
}
