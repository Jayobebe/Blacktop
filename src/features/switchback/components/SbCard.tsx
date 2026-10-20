import { forwardRef, useEffect, type ReactNode } from 'react';
import { ensureRedlineFire } from '../lib/redlineFire';
import { ArrowDown, ArrowUp, Bike, Car, Check, Flame, Swords, Wrench } from 'lucide-react';
import { GARAGE_SHOP } from '@/lib/pictures';
import { TIER_LADDER, TIER_STYLES } from '@/features/cards/types';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { BANK_INFO, cardById } from '../lib/catalog';
import { CATEGORY_ICON, categoriesOf, categoryLabel, isBike, overall, tierOf } from '../lib/ratings';
import type { BattleCard, Category } from '../types';
import '../switchback.css';
import { useCardArt } from '@/hooks/useCardArt';
import { TierFx } from '@/components/TierFx';

/**
 * thumb: a hand in battle (picture, rating, name, health).
 * tile: decks, pickers, the shop, prizes, the card in the middle of a round
 *   (adds every rating as a number).
 * full: one card looked at properly (ratings as bars).
 */
export type CardSize = 'thumb' | 'tile' | 'full';

/** "Road", "Race", or the series a shop-only card races in. */
export function classLabel(card: BattleCard): string {
  if (card.redline) return tr("Redline");
  if (card.bank) return BANK_INFO[card.bank].label;
  return card.spec === 'race' ? tr("Race") : tr("Road");
}

const REDLINE_FRAME = { bg: 'sb-redline-frame', border: 'border-[hsl(var(--destructive))]', chip: 'bg-[hsl(var(--destructive))] text-white' };

/** Saved battles keep their cards, but pick up artwork supplied since. */
const artOf = (card: BattleCard) => (card.source === 'collection' ? card.image : cardById(card.id)?.image ?? card.image);

function Meter({ value, tone, label, text }: { value: number; tone: 'health' | 'low' | 'mid' | 'wear'; label: string; text: ReactNode }) {
  return (
    <div className="sb-meter">
      <div className="sb-meter-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('sb-meter-fill', `sb-meter-${tone}`)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="sb-meter-text font-mono">{text}</span>
    </div>
  );
}

/** Every rating a card shows, as labelled bars (inside a full card, or on their own beside one). */
export function StatBars({ card, highlight, compareTo, fresh, className }: { card: BattleCard; highlight?: Category | null; compareTo?: BattleCard; /** The same card unworn: a rating wear has cut shows both figures. */ fresh?: BattleCard; className?: string }) {
  return (
    <div className={cn('sb-stat-list', className)}>
      {categoriesOf(card).map((c) => {
        const Icon = CATEGORY_ICON[c];
        const other = compareTo && categoriesOf(compareTo).includes(c) ? compareTo.ratings[c] : null;
        const d = other === null ? 0 : card.ratings[c] - other;
        const was = fresh && fresh.ratings[c] > card.ratings[c] ? fresh.ratings[c] : null;
        return (
          <div key={c} className={cn('sb-stat-line', highlight === c && 'sb-stat-live', fresh && 'sb-stat-fresh', was !== null && 'sb-stat-worn')}>
            <Icon aria-hidden />
            <span className="sb-stat-label">{categoryLabel(c)}</span>
            <span className="sb-stat-bar" aria-hidden>
              {was !== null && <i className="sb-stat-ghost" style={{ width: `${was}%` }} />}
              <i style={{ width: `${card.ratings[c]}%` }} />
            </span>
            <b className="font-mono">
              {was !== null && <s aria-label={tr("{0} when repaired", [was])}>{was}</s>}
              {card.ratings[c]}
            </b>
            {d !== 0 && (d > 0 ? <ArrowUp className="sb-up" aria-label={tr("Higher")} /> : <ArrowDown className="sb-down" aria-label={tr("Lower")} />)}
          </div>
        );
      })}
    </div>
  );
}

export interface SbCardProps {
  card: BattleCard;
  size?: CardSize;
  /** Health in a battle, 0 to 100. A card at 0 is burnt out. */
  hp?: number;
  /** Show wear (cards outside a battle). */
  showCondition?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** The category being fought over: that rating lights up. */
  highlight?: Category | null;
  /** Arrows against this card (choosing a replacement). */
  compareTo?: BattleCard;
  /** The same card unworn: the full card shows each rating wear has cut beside what it was. */
  fresh?: BattleCard;
  faceDown?: boolean;
  /** The card has left its place (it's in the middle of the table): only its outline stays. */
  away?: boolean;
  onClick?: () => void;
  /** A note in the corner of the picture ("Owned"). */
  badge?: ReactNode;
  className?: string;
}

export const SbCard = forwardRef<HTMLElement, SbCardProps>(function SbCard(
  { card, size = 'tile', hp, showCondition = false, selected = false, disabled = false, highlight, compareTo, fresh, faceDown = false, away = false, onClick, badge, className },
  ref,
) {
  const tier = tierOf(card);
  // A Redline card's frame is its own: the Burn button's pixel fire, darkened at the edges.
  useEffect(() => {
    if (card.redline) ensureRedlineFire();
  }, [card.redline]);
  const style = card.redline ? REDLINE_FRAME : TIER_STYLES[tier];
  const out = hp === 0;
  const shell = cn('sb-card no-frost', `sb-card-${size}`, `sb-tier-${card.redline ? 'redline' : tier}`, style.bg, style.border, selected && 'sb-card-selected', out && 'sb-card-out', away && 'sb-card-away', card.redline && 'sb-card-redline', className);
  const name = `${card.manufacturer || ''} ${card.name}`.trim();

  // A rider's own or scanned card carries a photo: drawn as it is, or in the set's look (the catalogue's art has it already).
  const image = useCardArt(faceDown ? undefined : artOf(card));
  if (faceDown) {
    const back = (
      <div className="sb-card-back">
        <span className="sb-back-frame" aria-hidden />
        <span className="sb-back-word">BLACKTOP</span>
        <span className="sb-back-emblem">
          <Swords strokeWidth={1.5} aria-hidden />
        </span>
        <span className="sb-back-word">{tr("SwitchBack")}</span>
      </div>
    );
    const cls = cn('sb-card no-frost sb-card-facedown', `sb-card-${size}`, className);
    return onClick ? (
      <button ref={ref as React.Ref<HTMLButtonElement>} type="button" className={cls} disabled={disabled} onClick={onClick} aria-label={tr("Choose face-down card")}>
        {back}
      </button>
    ) : (
      <div ref={ref as React.Ref<HTMLDivElement>} className={cls}>
        {back}
      </div>
    );
  }

  const cats = categoriesOf(card);
  const rating = overall(card);
  const delta = compareTo ? rating - overall(compareTo) : 0;
  const Vehicle = isBike(card) ? Bike : Car;
  const condition = showCondition ? card.condition : undefined;

  const body = (
    <>
      {/* The frame's finish, under everything printed on the card (a Redline's fire is its own). Still on a hand-sized card. */}
      {!card.redline && <TierFx tier={tier} still={size === 'thumb'} seed={card.id} />}
      <div className="sb-card-in">
      {size !== 'thumb' && (
        <div className="sb-card-head">
          <div className="min-w-0">
            <p className="sb-card-maker">{card.manufacturer || tr("Your garage")}</p>
            <p className="sb-card-name">{card.name}</p>
          </div>
          {size === 'full' && (
            <span className={cn('sb-card-tier', style.chip)}>
              {card.redline ? classLabel(card) : <>{classLabel(card)} · {TIER_LADDER.find((t) => t.id === tier)?.label}</>}
            </span>
          )}
        </div>
      )}

      <div className="sb-photo" style={{ backgroundImage: `url(${GARAGE_SHOP})` }}>
        <span className="sb-photo-floor" aria-hidden />
        {image ? <img src={image} alt="" className="sb-art" draggable={false} /> : <Vehicle className="sb-art-missing" strokeWidth={1} aria-hidden />}
        <span className="sb-rating font-mono" title={tr("Battle rating")}>
          {rating}
          {compareTo && delta !== 0 && (delta > 0 ? <ArrowUp className="sb-up" aria-label={tr("Higher")} /> : <ArrowDown className="sb-down" aria-label={tr("Lower")} />)}
        </span>
        {size !== 'thumb' && <span className="sb-class">{classLabel(card)}</span>}
        {badge && <span className="sb-photo-badge">{badge}</span>}
        {out && (
          <span className="sb-out-stamp">
            <Flame aria-hidden />
            {tr("OUT")}
          </span>
        )}
        {selected && <Check className="sb-card-check" aria-hidden />}
      </div>

      {size === 'thumb' && <p className="sb-card-name">{card.name}</p>}

      {size === 'tile' && (
        <div className="sb-stat-row">
          {cats.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <span key={c} className={cn('sb-stat-chip', highlight === c && 'sb-stat-live')} title={categoryLabel(c)}>
                <Icon aria-hidden />
                <b className="font-mono">{card.ratings[c]}</b>
              </span>
            );
          })}
        </div>
      )}

      {size === 'full' && <StatBars card={card} highlight={highlight} compareTo={compareTo} fresh={fresh} />}

      {hp !== undefined && (
        <Meter value={hp} tone={hp <= 25 ? 'low' : hp <= 50 ? 'mid' : 'health'} label={tr("{0} health", [card.name])} text={size === 'thumb' ? hp : tr("{0} HP", [hp])} />
      )}
      {hp === undefined && condition !== undefined && condition < 100 && (
        <Meter
          value={condition}
          tone={condition < 50 ? 'low' : 'wear'}
          label={tr("{0} condition", [card.name])}
          text={
            <>
              <Wrench aria-hidden />
              {condition}%
            </>
          }
        />
      )}
      </div>
    </>
  );

  return onClick ? (
    <button ref={ref as React.Ref<HTMLButtonElement>} type="button" className={shell} disabled={disabled} onClick={onClick} aria-pressed={selected} aria-label={name}>
      {body}
    </button>
  ) : (
    <div ref={ref as React.Ref<HTMLDivElement>} className={shell} aria-label={name}>
      {body}
    </div>
  );
});
