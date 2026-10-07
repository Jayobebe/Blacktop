import { useState } from 'react';
import { Gauge, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DemoLockNote, useDemoLocked } from '@/components/DemoLock';
import { eventSound } from '@/lib/appSound';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { useServerCap } from '@/lib/serverCaps';
import { cn } from '@/lib/utils';
import { REDLINE, REDLINES, redlineById } from '../lib/redline';
import { redeemRedline, setWheel, useShop } from '../lib/shop';
import type { BattleCard as Card } from '../types';
import { CwCard } from './CwCard';

/**
 * Redline cards on the deck page: the five on the Wildcard's wheel, and a
 * sheet to look through every Redline, choose the five, and enter a build's
 * code. Before the Wildcard is won it says how it's won and how close the
 * certain one is. Nothing shows until the server has Redline.
 */
export function RedlineWheel({ frozen }: { frozen: boolean }) {
  const on = useServerCap('cardWarsRedline');
  const shop = useShop();
  const demo = useDemoLocked();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  if (!on) return null;

  const wheel = shop.wheel.map((id) => redlineById(id)).filter((c): c is Card => !!c);
  const changed = draft.join() !== shop.wheel.join();
  const canPick = shop.wildcard && !frozen;
  const left = REDLINE.wheel - draft.length;
  const toSpin = Math.max(1, REDLINE.pity - shop.wildPity);

  const show = () => {
    setDraft(shop.wheel);
    setOpen(true);
  };
  const toggle = (id: string) => {
    haptics.light();
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length < REDLINE.wheel ? [...d, id] : d));
  };
  const save = async () => {
    setBusy(true);
    const err = await setWheel(draft);
    setBusy(false);
    if (err) return void toast.error(/current battle/i.test(err) ? tr("Finish your current battle first.") : tr("Could not save your wheel"));
    eventSound('success');
    toast.success(tr("Wheel saved"));
    setOpen(false);
  };
  const redeem = async () => {
    const text = code.trim();
    if (!text) return;
    setBusy(true);
    const res = await redeemRedline(text);
    setBusy(false);
    if (typeof res === 'string') {
      if (res !== 'demo') toast.error(/too many/i.test(res) ? tr("Too many tries today. Back tomorrow.") : tr("Could not check that code"));
      return;
    }
    const card = redlineById(res.card);
    if (!card) return void toast.error(tr("That code doesn't match a Redline card."));
    setCode('');
    if (res.fresh) {
      eventSound('success');
      toast.success(tr("{0} {1} is yours", [card.manufacturer ?? '', card.name]));
    } else toast(tr("You already have that Redline card."));
  };

  return (
    <section className="cw-panel cw-panel-redline">
      <div className="flex items-start gap-3">
        <div className="cw-emblem cw-emblem-sm cw-emblem-redline">
          <Gauge />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{tr("Redline wheel")}</p>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
            {shop.wildcard
              ? tr("Arm your Wildcard and one of these five fights the round in your card's place.")
              : tr("Redline cards are one-off machines with a 100 and a 0. They never sit in a deck: the Wildcard dog tag brings one in for a round.")}
          </p>
        </div>
      </div>

      {shop.wildcard ? (
        <div className="cw-redline-row">
          {wheel.map((c) => (
            <CwCard key={c.id} card={c} size="thumb" onClick={show} />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs leading-snug">{tr("The Wildcard comes only from paid spins on the F1 and MotoGP shelves: {0}% a spin.", [REDLINE.odds])}</p>
          <Progress value={(shop.wildPity / REDLINE.pity) * 100} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground font-mono">{toSpin === 1 ? tr("Certain on your next paid spin") : tr("Certain within {0} more paid spins", [toSpin])}</p>
        </div>
      )}

      <Button variant="outline" className="w-full h-11 gap-2" onClick={show}>
        <Gauge className="w-4 h-4" />
        {shop.wildcard ? tr("Choose your five") : tr("See the Redline cards")}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[88dvh] overflow-y-auto safe-bottom">
          <div className="space-y-4 max-w-2xl mx-auto">
            <SheetHeader className="text-left">
              <SheetTitle>{tr("Redline cards")}</SheetTitle>
              <SheetDescription>
                {tr("Every Redline has the same {0} points across Speed, Corners, G-force and Distance, with a 100 and a 0. Yours for good: they can't be sold, swapped or traded up.", [REDLINE.budget])}
              </SheetDescription>
            </SheetHeader>
            <p className="text-xs font-mono text-muted-foreground">
              {tr("{0} of {1} collected", [shop.redlines.length, REDLINES.length])}
              {canPick && <> · {left === 0 ? tr("Five on the wheel") : left === 1 ? tr("Pick 1 more") : tr("Pick {0} more", [left])}</>}
            </p>
            <div className="cw-grid-2">
              {REDLINES.map((c) => {
                const mine = shop.redlines.includes(c.id);
                const picked = draft.includes(c.id);
                return (
                  <CwCard
                    key={c.id}
                    card={c}
                    selected={mine && picked}
                    disabled={!mine || !canPick || busy || (!picked && left === 0)}
                    onClick={mine && canPick ? () => toggle(c.id) : undefined}
                    className={cn(!mine && 'cw-redline-locked')}
                    badge={
                      mine ? (
                        picked ? (
                          tr("On wheel")
                        ) : undefined
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          {tr("Locked")}
                        </span>
                      )
                    }
                  />
                );
              })}
            </div>
            {shop.wildcard && (
              <Button className="w-full h-12" disabled={!canPick || busy || left !== 0 || !changed} onClick={() => void save()}>
                {frozen ? tr("Finish your current battle first.") : !changed && left === 0 ? tr("This is your wheel") : tr("Save wheel")}
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground leading-snug">
              {tr("Your first five come with the Wildcard. After that, winning the daily challenge is a one in {0} shot at another, and a builder's code unlocks their machine.", [REDLINE.dailyOneIn])}
            </p>
            <div className="rounded-2xl border border-border bg-card/50 p-3 space-y-2">
              <p className="text-sm font-semibold">{tr("Have a build code?")}</p>
              {demo && <DemoLockNote />}
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 24))}
                  placeholder={tr("Code")}
                  aria-label={tr("Build code")}
                  className="h-11 font-mono uppercase"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={demo || busy}
                />
                <Button className="h-11 px-5" disabled={demo || busy || !code.trim()} onClick={() => void redeem()}>
                  {tr("Redeem")}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
