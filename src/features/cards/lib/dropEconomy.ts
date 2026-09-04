/**
 * Card copy economy.
 *
 * Your card always keeps one copy locked in Stats — it can never be dropped.
 * Copies are earned:
 *   • every card tier milestone reached (Bronze, Silver, Gold, …) on any bike
 *   • every weekly crew challenge you complete
 *   • every 4 unique card drops you collect from other riders
 *   • every 3-day ride streak
 *
 * Your own card is always in your vault by default; every earned copy from copy 2
 * onward is droppable.
 *
 * Economy cap: at most 9 granted copies per calendar month (across challenge,
 * collection and streak triggers). Earning the 9th grants a 10th bonus copy.
 * Tier-milestone copies are derived from ride history and are not capped.
 */
import { TIER_LADDER } from '../types';

const CHALLENGE_KEY = 'bt.card_challenge_copies.v1';
const COLLECT_KEY = 'bt.card_collect_copies.v1';
const STREAK_KEY = 'bt.card_streak_copies.v1';
const MONTH_KEY = 'bt.card_copy_month.v1';
const BADGE_COPY_KEY = 'bt.card_badge_copies.v1';

/** Max granted copies per calendar month, across all grant triggers. */
export const MONTHLY_COPY_CAP = 9;
/** Badge points traded for one card copy. */
export const BADGES_PER_COPY = 10;
/** Every N collected cards earns a copy. */
export const COLLECT_COPY_EVERY = 4;

export type GrantResult = 'granted' | 'already' | 'capped';

// ── persistence helpers ─────────────────────────────────────────────────────

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage full — grant is lost, not fatal */
  }
}

function notify() {
  window.dispatchEvent(new CustomEvent('blacktop-card-copies'));
}

// ── monthly budget ──────────────────────────────────────────────────────────

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface MonthRecord {
  month: string;
  count: number;
  /** Set when the 9th grant lands — a 10th bonus copy is awarded. */
  bonus?: boolean;
}

function readMonth(): MonthRecord | null {
  try {
    const raw = localStorage.getItem(MONTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MonthRecord;
    return parsed.month === monthKey() ? parsed : null;
  } catch {
    return null;
  }
}

/** Grants used in the current calendar month. */
export function monthlyGrantsUsed(): number {
  return readMonth()?.count ?? 0;
}

/** Bonus copies earned this month (1 once all 9 grants are used). */
export function monthlyBonusCopies(): number {
  return readMonth()?.bonus ? 1 : 0;
}

export function monthlyGrantsRemaining(): number {
  return Math.max(0, MONTHLY_COPY_CAP - monthlyGrantsUsed());
}

function spendMonthlyGrant(): boolean {
  const rec = readMonth();
  const used = rec?.count ?? 0;
  if (used >= MONTHLY_COPY_CAP) return false;
  const next: MonthRecord = { month: monthKey(), count: used + 1 };
  // Hitting the cap unlocks one bonus copy.
  if (next.count >= MONTHLY_COPY_CAP) next.bonus = true;
  try {
    localStorage.setItem(MONTH_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

// ── tier milestones (derived, uncapped) ─────────────────────────────────────

/** Milestone copies earned across every vehicle in the garage. */
export function tierCopiesEarned(ridesPerBike: number[]): number {
  let earned = 0;
  for (const rides of ridesPerBike) {
    for (const t of TIER_LADDER) {
      if (t.id !== 'locked' && rides >= t.minRides) earned += 1;
    }
  }
  return earned;
}

// ── crew challenges ─────────────────────────────────────────────────────────

export function claimedChallengeWeeks(): string[] {
  return readList(CHALLENGE_KEY);
}

/** Records a completed crew challenge as a card copy (idempotent per week). */
export function grantChallengeCopy(week: string): GrantResult {
  const weeks = claimedChallengeWeeks();
  if (weeks.includes(week)) return 'already';
  if (!spendMonthlyGrant()) return 'capped';
  writeList(CHALLENGE_KEY, [...weeks, week]);
  notify();
  return 'granted';
}

// ── card collecting ─────────────────────────────────────────────────────────

/** Collect milestones already claimed (5, 10, 15, …). */
export function claimedCollectMilestones(): number[] {
  return readList(COLLECT_KEY).map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Given the rider's total collected-card count, claims a copy for every
 * 4-collect threshold newly crossed. Returns the grant outcome.
 */
export function grantCollectCopy(collectedCount: number): GrantResult {
  const claimed = claimedCollectMilestones();
  const due = Math.floor(collectedCount / COLLECT_COPY_EVERY) * COLLECT_COPY_EVERY;
  // Next multiple of 4 strictly above the highest claimed milestone, so
  // milestones recorded under an older interval realign cleanly.
  const next = claimed.length
    ? (Math.floor(Math.max(...claimed) / COLLECT_COPY_EVERY) + 1) * COLLECT_COPY_EVERY
    : COLLECT_COPY_EVERY;
  if (due < next) return 'already';
  if (!spendMonthlyGrant()) return 'capped';
  writeList(COLLECT_KEY, [...claimed.map(String), String(next)]);
  notify();
  return 'granted';
}

// ── ride streaks ────────────────────────────────────────────────────────────

/** Streak runs already rewarded, keyed by the streak's start date (YYYY-MM-DD). */
export function claimedStreaks(): string[] {
  return readList(STREAK_KEY);
}

/** Records a completed 3-day streak (idempotent per streak run). */
export function grantStreakCopy(streakStartDay: string): GrantResult {
  const streaks = claimedStreaks();
  if (streaks.includes(streakStartDay)) return 'already';
  if (!spendMonthlyGrant()) return 'capped';
  writeList(STREAK_KEY, [...streaks, streakStartDay]);
  notify();
  return 'granted';
}

// ── badge trades (uncapped) ─────────────────────────────────────────────────

/** Copies bought with badge points. */
export function badgeCopiesEarned(): number {
  try {
    return Number(localStorage.getItem(BADGE_COPY_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

/** Records one copy bought with badge points. Never counts against the cap. */
export function grantBadgeCopy() {
  try {
    localStorage.setItem(BADGE_COPY_KEY, String(badgeCopiesEarned() + 1));
  } catch {
    /* storage full — not fatal */
  }
  notify();
}

// ── ledger ──────────────────────────────────────────────────────────────────

export interface CopyLedger {
  /** Total copies in existence, including the one locked in Stats. */
  total: number;
  /** Copies that may be planted on the map (total − the copy locked in Stats). */
  droppable: number;
  /** Copies currently planted. */
  placed: number;
  /** Copies still in hand, ready to drop. */
  available: number;
  /** Granted copies used this calendar month (cap: MONTHLY_COPY_CAP). */
  monthlyUsed: number;
  /** Bonus copies earned this month by hitting the cap. */
  monthlyBonus: number;
}

export function copyLedger(ridesPerBike: number[], placed: number): CopyLedger {
  const total =
    1 +
    tierCopiesEarned(ridesPerBike) +
    claimedChallengeWeeks().length +
    claimedCollectMilestones().length +
    claimedStreaks().length +
    badgeCopiesEarned() +
    monthlyBonusCopies();
  const droppable = Math.max(0, total - 1);
  return {
    total,
    droppable,
    placed,
    available: Math.max(0, droppable - placed),
    monthlyUsed: monthlyGrantsUsed(),
    monthlyBonus: monthlyBonusCopies(),
  };
}
