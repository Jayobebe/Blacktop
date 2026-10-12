import { useState } from 'react';
import { Bike, Car, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DemoLockNote, useDemoLocked } from '@/components/DemoLock';
import { eventSound } from '@/lib/appSound';
import { tr } from '@/lib/i18n';
import { useServerCap } from '@/lib/serverCaps';
import { WILD, parseWildTag, wildTag } from '../lib/redline';
import { pickWildVersion, useShop } from '../lib/shop';
import { comboDescription, tagLabel } from '../lib/tags';
import { DogTagPlate } from './DogTagPlate';

/**
 * Combo Wildcards on the deck page: the run of wins towards the next one, the
 * ones held, and (when a run has just unlocked one) the choice of its car or
 * bike version. Nothing shows until the server has the combo rules.
 */
export function WildCombos() {
  const on = useServerCap('cardWarsCombos');
  const shop = useShop();
  const demo = useDemoLocked();
  const [busy, setBusy] = useState(false);
  if (!on || !shop.wildcard) return null;

  const held = shop.wildTags.flatMap((t) => parseWildTag(t) ?? []);
  const pending = shop.wildPending;
  const all = held.length >= 8;
  const pick = async (vehicle: 'car' | 'bike') => {
    if (!pending) return;
    setBusy(true);
    const ok = await pickWildVersion(vehicle);
    setBusy(false);
    if (!ok) return void toast.error(tr("Could not unlock it. Try again."));
    eventSound('success');
    toast.success(tr("Unlocked: {0}", [tagLabel(wildTag(pending, vehicle))]));
  };

  return (
    <section className="cw-panel cw-panel-redline">
      <div className="flex items-start gap-3">
        <div className="cw-emblem cw-emblem-sm cw-emblem-redline">
          <Sparkles />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{tr("Combo Wildcards")}</p>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
            {all
              ? tr("You hold every combo Wildcard.")
              : tr("Win {0} battles in a row with a Wildcard in your deck to unlock one. Hard battles against the computer and player battles count; a loss starts the run again.", [WILD.streak])}
          </p>
        </div>
      </div>

      {pending ? (
        <div className="rounded-2xl border border-accent/50 bg-card/50 p-3 space-y-2">
          <p className="text-sm font-semibold">{tr("Unlocked: {0}", [tagLabel(wildTag(pending, 'car'))])}</p>
          <p className="text-xs text-muted-foreground leading-snug">{comboDescription(pending)}</p>
          <p className="text-xs leading-snug">{tr("Choose its version. The combo works with that kind of card.")}</p>
          {demo && <DemoLockNote />}
          <div className="grid grid-cols-2 gap-2">
            {(['car', 'bike'] as const).map((v) => (
              <Button key={v} className="h-12 gap-2" disabled={busy || demo || shop.wildTags.includes(`${pending}.${v}`)} onClick={() => void pick(v)}>
                {v === 'car' ? <Car className="w-4 h-4" /> : <Bike className="w-4 h-4" />}
                {v === 'car' ? tr("Car") : tr("Bike")}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        !all && (
          <div className="space-y-1.5">
            <Progress value={(Math.min(shop.wildStreak, WILD.streak) / WILD.streak) * 100} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground font-mono">{tr("{0} of {1} wins in a row", [Math.min(shop.wildStreak, WILD.streak), WILD.streak])}</p>
          </div>
        )
      )}

      {held.length > 0 && (
        <div className="grid gap-1.5">
          {held.map((t) => (
            <DogTagPlate key={t.id} tag={t} />
          ))}
        </div>
      )}
    </section>
  );
}
