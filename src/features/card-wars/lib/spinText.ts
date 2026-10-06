import { tr } from '@/lib/i18n';
import { cardById } from './catalog';
import { V2, showRpm } from './rules';
import type { SpinResult } from './shop';
import { parseOwnedTag } from './tagRules';
import { tagName } from './tags';

/** What a spin landed on, as the reel shows it. */
export function spinLabel(r: SpinResult): string {
  if (r.kind === 'card') return cardById(r.card)?.name ?? tr("New card");
  if (r.kind === 'tag') {
    const tag = r.tag ? parseOwnedTag(r.tag) : null;
    return tag ? tr("{0} dog tag", [tagName(tag.power)]) : tr("Dog tag");
  }
  if (r.kind === 'duplicate') return tr("Duplicate · +{0} RPM", [showRpm(r.rpm)]);
  if (r.kind === 'rpm') return tr("+{0} RPM", [showRpm(r.rpm)]);
  return r.spins === 1 ? tr("+1 spin") : tr("+{0} spins", [r.spins]);
}

/** The line under what was won. */
export function spinCaption(r: SpinResult): string {
  switch (r.kind) {
    case 'card':
      return tr("It's yours. Swap it into your deck any time.");
    case 'tag':
      return tr("A new dog tag. Put it in your deck from the dog tags list.");
    case 'duplicate':
      return r.tag ? tr("You already have that dog tag, so part of the spin came back.") : tr("You already own that card, so you get 75% of its shop price in RPM.");
    case 'rpm':
      return tr("RPM back in your pocket.");
    default:
      return r.spins === 1 ? tr("Your next spin on this shelf is free.") : tr("Your next {0} spins on this shelf are free.", [r.spins]);
  }
}

/** What flies past on a shelf's reel before it stops. */
export const REEL_LABELS = V2 ? [tr("Card"), tr("RPM"), tr("Dog tag"), tr("+1 spin"), tr("RPM"), tr("Card")] : [tr("Card"), tr("RPM"), tr("+1 spin"), tr("RPM"), tr("Card")];
/** The free card spins only ever land cards. */
export const CARD_REEL_LABELS = [tr("Road"), tr("Race"), 'GTLM', 'F1', tr("Road"), 'MotoGP', tr("Race"), 'TT'];
/** And the free dog tag spins, dog tags. */
export const TAG_REEL_LABELS = [tagName('boost'), tagName('heal'), tagName('reroll')];
