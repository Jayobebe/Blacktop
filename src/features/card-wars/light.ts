/**
 * The small pieces of Card Wars other screens use (the Arcade page, the other
 * arcade games, the vault): imported from here, not the feature's index, so
 * those screens don't carry the whole game.
 */
import { toast } from 'sonner';
import { tr } from '@/lib/i18n';
import { arcadeReward } from './lib/shop';
import { showRpm } from './lib/rules';

export { CardWarsArcadePanel } from './components/ArcadePanel';
export { SpectreTagBack } from './components/SpectreTagBack';

/** A finished game of Hit Heavy or Petrol Head: pays RPM for Card Wars (the server caps the day) and says so. */
export async function payArcadeGame(game: 'hit-heavy' | 'petrol-head', best: boolean) {
  const rpm = await arcadeReward(game, best).catch(() => null);
  if (rpm) toast.success(tr("+{0} RPM for Card Wars", [showRpm(rpm)]));
}
