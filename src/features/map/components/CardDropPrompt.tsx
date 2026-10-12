import { createPortal } from 'react-dom';
import { IdCard, Loader2 } from 'lucide-react';
import { TierFx } from '@/components/TierFx';
import { TIER_STYLES } from '@/features/cards/types';
import type { VehicleCardData } from '@/features/cards/hooks/useVehicleCards';
import { useCardArt } from '@/hooks/useCardArt';
import garageShopAsset from '@/assets/garage-shop.png.asset.json';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * "Drop this card here?", in the middle of the screen and above everything on
 * the map (it used to be a small box under the toolbar, which the toolbar
 * covered). Shows the card that will be dropped (the vehicle chosen in the
 * garage) and how many copies the rider has to drop, with a big Yes and No.
 * Portaled to body: the map's own layers can't sit over it.
 */
export function CardDropPrompt({ card, left, ready, onYes, onNo }: { card: VehicleCardData; left: number; ready: boolean; onYes: () => void; onNo: () => void }) {
  const style = TIER_STYLES[card.tier] ?? TIER_STYLES.bronze;
  const art = useCardArt(card.bike.photos?.hero || undefined);
  return createPortal(
    <div className="fixed inset-0 z-[9000] safe-frame flex overflow-y-auto overscroll-contain bg-black/70" role="dialog" aria-modal="true" aria-label={tr("Drop this card here?")} data-no-pull onClick={onNo}>
      <div className="m-auto w-full max-w-sm short:max-w-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-3xl bg-card border border-accent/50 p-5 flex flex-col short:flex-row short:items-center gap-4 short:gap-5">
          {/* The card that's going down. */}
          <div className={cn('relative isolate shrink-0 mx-auto w-40 short:w-36 rounded-2xl border overflow-hidden', style.bg, style.border)}>
            <TierFx tier={card.tier} seed={card.bike.id} />
            <div className="relative px-2.5 pt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-white truncate">{card.bike.name}</span>
              <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider', style.chip)}>{card.tierLabel}</span>
            </div>
            <div className="relative m-2 rounded-xl overflow-hidden aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: `url(${garageShopAsset.url})` }}>
              {art ? (
                <img src={art} alt="" className="absolute inset-0 w-full h-full object-contain p-1" draggable={false} />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-white/50">
                  <IdCard className="w-8 h-8" />
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 text-center short:text-left">
            <p className="text-2xl font-bold tracking-tight leading-tight">{tr("Drop this card here?")}</p>
            <p className="text-sm text-muted-foreground mt-1.5">
              {tr("It lands where you're standing, and riders nearby can scan it.")}
            </p>
            <p className="text-sm font-semibold mt-2">{left === 1 ? tr("1 copy left to drop") : tr("{0} copies left to drop", [left])}</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button type="button" onClick={onYes} disabled={!ready} className="pressable h-16 rounded-2xl bg-accent text-accent-foreground text-xl font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                {!ready && <Loader2 className="w-5 h-5 animate-spin" />}
                {tr("Yes")}
              </button>
              <button type="button" onClick={onNo} className="pressable h-16 rounded-2xl bg-secondary text-xl font-bold">
                {tr("No")}
              </button>
            </div>
            {!ready && <p className="text-xs text-muted-foreground mt-2">{tr("Finding your spot…")}</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
