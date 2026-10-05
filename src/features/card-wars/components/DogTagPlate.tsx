import type { ReactNode } from 'react';
import { Bike, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TAG_ICON, tagEffect, tagKindLine, tagName, tagTitle } from '../lib/tags';
import type { BattleCard, DogTag } from '../types';
import '../card-wars.css';

/**
 * A dog tag as a stamped steel plate: its power, what it's tied to and what it
 * does. `chip` is the small one in a battle (icon and two short lines), `row`
 * sits in lists, `big` is the one shown off after a spin, on its chain.
 */
export function DogTagPlate({
  tag,
  size = 'row',
  card,
  className,
  children,
}: {
  tag: DogTag;
  size?: 'chip' | 'row' | 'big';
  /** The card it would be played with: the effect shown includes the bonus for a match. */
  card?: BattleCard | null;
  className?: string;
  /** Extra stamped line (the "In use" mark in a list). */
  children?: ReactNode;
}) {
  const Icon = TAG_ICON[tag.power];
  const Kind = tag.vehicle === 'car' ? Car : tag.vehicle === 'bike' ? Bike : null;
  return (
    <span className={cn('cw-plate', `cw-plate-${size}`, className)}>
      {size === 'big' && <span className="cw-plate-chain" aria-hidden />}
      <span className="cw-plate-hole" aria-hidden />
      <Icon className="cw-plate-icon" aria-hidden />
      <span className="cw-plate-text">
        <b>{tagName(tag.power)}</b>
        {size !== 'chip' && <span className="cw-plate-title">{tagTitle(tag)}</span>}
        <span className="cw-plate-effect">
          {tagEffect(tag, card)}
          {size !== 'chip' && Kind && (
            <>
              {' · '}
              <Kind aria-hidden />
              {tagKindLine(tag)}
            </>
          )}
        </span>
        {children}
      </span>
    </span>
  );
}
