import { forwardRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Bike, Car, Check, Flame, Swords, Wrench } from 'lucide-react';
import garageShopAsset from '@/assets/garage-shop.png.asset.json';
import { TIER_LADDER, TIER_STYLES } from '@/features/cards/types';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { BANK_INFO, cardById } from '../lib/catalog';
import { CATEGORY_ICON, categoriesOf, categoryLabel, isBike, overall, tierOf } from '../lib/ratings';
import type { BattleCard, Category } from '../types';
import '../card-wars.css';

/**
 * thumb: a hand in battle (picture, rating, name, health).
 * tile: decks, pickers, the shop, prizes, the card in the middle of a round
 *   (adds every rating as a number).
 * full: one card looked at properly (ratings as bars).
 */
export type CardSize = 'thumb' | 'tile' | 'full';

/** "Road", "Race", or the series a shop-only card races in. */
export function classLabel(card: BattleCard): string {
  if (card.bank) return BANK_INFO[card.bank].label;
  return card.spec === 'race' ? tr("Race") : tr("Road");
}

/** Saved battles keep their cards, but pick up artwork supplied since. */
const artOf = (card: BattleCard) => (card.source === 'collection' ? card.image : cardById(card.id)?.image ?? card.image);

function Meter({ value, tone, label, text }: { value: number; tone: 'health' | 'low' | 'mid' | 'wear'; label: string; text: ReactNode }) {
  return (
    <div className="cw-meter">
      <div className="cw-meter-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('cw-meter-fill', `cw-meter-${tone}`)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="cw-meter-text font-mono">{text}</span>
    </div>
  );
}

/** Every rating a card shows, as labelled bars (inside a full card, or on their own beside one). */
export function StatBars({ card, highlight, compareTo, className }: { card: BattleCard; highlight?: Category | null; compareTo?: BattleCard; className?: string }) {
  return (
    <div className={cn('cw-stat-list', className)}>
      {categoriesOf(card).map((c) => {
        const Icon = CATEGORY_ICON[c];
        const other = compareTo && categoriesOf(compareTo).includes(c) ? compareTo.ratings[c] : null;
        const d = other === null ? 0 : card.ratings[c] - other;
        return (
          <div key={c} className={cn('cw-stat-line', highlight === c && 'cw-stat-live')}>
            <Icon aria-hidden />
            <span className="cw-stat-label">{categoryLabel(c)}</span>
            <span className="cw-stat-bar" aria-hidden>
              <i style={{ width: `${card.ratings[c]}%` }} />
            </span>
            <b className="font-mono">{card.ratings[c]}</b>
            {d !== 0 && (d > 0 ? <ArrowUp className="cw-up" aria-label={tr("Higher")} /> : <ArrowDown className="cw-down" aria-label={tr("Lower")} />)}
          </div>
        );
      })}
    </div>
  );
}

export interface CwCardProps {
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
  faceDown?: boolean;
  /** The card has left its place (it's in the middle of the table): only its outline stays. */
  away?: boolean;
  onClick?: () => void;
  /** A note in the corner of the picture ("Owned"). */
  badge?: ReactNode;
  className?: string;
}

export const CwCard = forwardRef<HTMLElement, CwCardProps>(function CwCard(
  { card, size = 'tile', hp, showCondition = false, selected = false, disabled = false, highlight, compareTo, faceDown = false, away = false, onClick, badge, className },
  ref,
) {
  const tier = tierOf(card);
  const style = TIER_STYLES[tier];
  const out = hp === 0;
  const shell = cn('cw-card no-frost', `cw-card-${size}`, `cw-tier-${tier}`, style.bg, style.border, selected && 'cw-card-selected', out && 'cw-card-out', away && 'cw-card-away', className);
  const name = `${card.manufacturer || ''} ${card.name}`.trim();

  if (faceDown) {
    const back = (
      <div className="cw-card-back">
        <span className="cw-back-frame" aria-hidden />
        <span className="cw-back-word">BLACKTOP</span>
        <span className="cw-back-emblem">
          <Swords strokeWidth={1.5} aria-hidden />
        </span>
        <span className="cw-back-word">{tr("Card Wars")}</span>
      </div>
    );
    const cls = cn('cw-card no-frost cw-card-facedown', `cw-card-${size}`, className);
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
  const image = artOf(card);
  const rating = overall(card);
  const delta = compareTo ? rating - overall(compareTo) : 0;
  const Vehicle = isBike(card) ? Bike : Car;
  const condition = showCondition ? card.condition : undefined;

  const body = (
    <div className="cw-card-in">
      {size !== 'thumb' && (
        <div className="cw-card-head">
          <div className="min-w-0">
            <p className="cw-card-maker">{card.manufacturer || tr("Your garage")}</p>
            <p className="cw-card-name">{card.name}</p>
          </div>
          {size === 'full' && (
            <span className={cn('cw-card-tier', style.chip)}>
              {classLabel(card)} · {TIER_LADDER.find((t) => t.id === tier)?.label}
            </span>
          )}
        </div>
      )}

      <div className="cw-photo" style={{ backgroundImage: `url(${garageShopAsset.url})` }}>
        <span className="cw-photo-floor" aria-hidden />
        {image ? <img src={image} alt="" className="cw-art" draggable={false} /> : <Vehicle className="cw-art-missing" strokeWidth={1} aria-hidden />}
        <span className="cw-rating font-mono" title={tr("Battle rating")}>
          {rating}
          {compareTo && delta !== 0 && (delta > 0 ? <ArrowUp className="cw-up" aria-label={tr("Higher")} /> : <ArrowDown className="cw-down" aria-label={tr("Lower")} />)}
        </span>
        {size !== 'thumb' && <span className="cw-class">{classLabel(card)}</span>}
        {badge && <span className="cw-photo-badge">{badge}</span>}
        {out && (
          <span className="cw-out-stamp">
            <Flame aria-hidden />
            {tr("OUT")}
          </span>
        )}
        {selected && <Check className="cw-card-check" aria-hidden />}
      </div>

      {size === 'thumb' && <p className="cw-card-name">{card.name}</p>}

      {size === 'tile' && (
        <div className="cw-stat-row">
          {cats.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <span key={c} className={cn('cw-stat-chip', highlight === c && 'cw-stat-live')} title={categoryLabel(c)}>
                <Icon aria-hidden />
                <b className="font-mono">{card.ratings[c]}</b>
              </span>
            );
          })}
        </div>
      )}

      {size === 'full' && <StatBars card={card} highlight={highlight} compareTo={compareTo} />}

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
