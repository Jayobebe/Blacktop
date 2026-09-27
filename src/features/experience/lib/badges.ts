import type { BadgeType } from '@/types/convoy';

export interface BadgeVisibility {
  speed: boolean;
  lean: boolean;
  g: boolean;
}

/** Badges measure specific data — hide the ones built on data the rider opted out of. */
export function badgeVisible(type: BadgeType, v: BadgeVisibility): boolean {
  switch (type) {
    case 'speed-demon':
      return v.speed;
    case 'lean-fiend':
      return v.lean;
    case 'g-lock':
      return v.g;
    case 'corner-carver':
      return v.lean || v.g;
    default:
      return true;
  }
}
