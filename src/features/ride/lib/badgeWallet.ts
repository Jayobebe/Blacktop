/**
 * Badge wallet — badges are a spendable currency.
 *
 * Every badge earned (convoy-relative or solo threshold) is banked here with
 * its point value from BADGE_INFO. Fallback subtracts a point. Ten net points
 * can be traded for a card copy, which feeds the drop economy ledger.
 *
 * Local-only, like every other ride stat in the app.
 */
import { BadgeType, BADGE_INFO, BADGE_ORDER } from '@/types/convoy';
import { RideSession } from '@/types/blacktop';
import { grantBadgeCopy, BADGES_PER_COPY } from '@/features/cards/lib/dropEconomy';

const WALLET_KEY = 'bt.badge_wallet.v1';

export { BADGES_PER_COPY };

interface WalletRecord {
  counts: Partial<Record<BadgeType, number>>;
  /** Points already traded for card copies. */
  spent: number;
}

const EMPTY: WalletRecord = { counts: {}, spent: 0 };

function read(): WalletRecord {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as WalletRecord;
    return { counts: parsed.counts || {}, spent: parsed.spent || 0 };
  } catch {
    return EMPTY;
  }
}

function write(rec: WalletRecord) {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(rec));
  } catch {
    /* storage full — not fatal */
  }
  window.dispatchEvent(new CustomEvent('blacktop-badges'));
}

export interface BadgeWallet {
  counts: Record<BadgeType, number>;
  /** Points earned (positive badges minus Fallback penalties), never negative. */
  earned: number;
  /** Points traded for card copies. */
  spent: number;
  /** Points available to spend. */
  balance: number;
  /** Points still needed for the next card copy. */
  toNextCopy: number;
}

export function badgeWallet(): BadgeWallet {
  const rec = read();
  const counts = BADGE_ORDER.reduce((acc, type) => {
    acc[type] = rec.counts[type] || 0;
    return acc;
  }, {} as Record<BadgeType, number>);

  const earned = Math.max(
    0,
    BADGE_ORDER.reduce((sum, type) => sum + counts[type] * BADGE_INFO[type].points, 0)
  );
  const balance = Math.max(0, earned - rec.spent);
  return {
    counts,
    earned,
    spent: rec.spent,
    balance,
    toNextCopy: Math.max(0, BADGES_PER_COPY - balance),
  };
}

/** Banks a set of earned badges. */
export function recordBadges(badges: BadgeType[]) {
  if (badges.length === 0) return;
  const rec = read();
  const counts = { ...rec.counts };
  badges.forEach(b => {
    counts[b] = (counts[b] || 0) + 1;
  });
  write({ ...rec, counts });
}

/** Spends BADGES_PER_COPY points for one card copy. Returns success. */
export function spendBadgesForCopy(): boolean {
  const wallet = badgeWallet();
  if (wallet.balance < BADGES_PER_COPY) return false;
  grantBadgeCopy();
  const rec = read();
  write({ ...rec, spent: rec.spent + BADGES_PER_COPY });
  return true;
}

/**
 * Solo-achievable, threshold-based badges for a finished ride — so riders who
 * never join a convoy can still earn currency.
 *
 * `ridesToday` counts rides already logged on the same calendar day
 * (including this one).
 */
export function soloBadgesForRide(ride: RideSession, ridesToday: number): BadgeType[] {
  const badges: BadgeType[] = [];
  const hour = new Date(ride.startedAt).getHours();
  if (hour >= 20 || hour < 5) badges.push('night-owl');
  if (ride.distance >= 150) badges.push('hard-ass');
  if (ridesToday >= 3) badges.push('always-out');
  return badges;
}
