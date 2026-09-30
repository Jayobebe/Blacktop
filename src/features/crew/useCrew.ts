import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { tr } from '@/lib/i18n';

/**
 * Crew membership. Every rider owns a crew code (generated once, on device).
 * Scanning another rider's crew QR adds their crew, putting both riders in it.
 * A rider can be in up to MAX_CREWS crews (their own included), each with a
 * name they choose (only on this phone, and on crew notifications). One is
 * active: the crew screens (convoys, boards, challenges, Blacktank, card drops)
 * show that one. The codes are the only thing shared; nothing else is published
 * unless the rider unlocks a convoy or opens the crew screens.
 */
export const MAX_CREWS = 4;

export interface CrewEntry {
  code: string;
  /** The rider's own name for it ("Crew ABC123" until renamed). */
  name: string;
  /** True once the rider has named it (only chosen names are saved and sent). */
  custom: boolean;
  /** The rider's own crew: can be renamed, never left. */
  own: boolean;
  joinedAt: number | null;
}

export interface CrewState {
  /** The active crew. Never null once initialised. */
  code: string;
  name: string;
  /** True when the active crew is the rider's own. */
  isOwn: boolean;
  joinedAt: number | null;
  /** Every crew this rider is in, own first (at most MAX_CREWS). */
  crews: CrewEntry[];
}

const LS_KEY = 'blacktop_crews';
const LS_ACTIVE_KEY = 'blacktop_crew_active';
/** Before several crews: the one joined crew (read once to carry it over). */
const LS_LEGACY_KEY = 'blacktop_crew';
const LS_OWN_KEY = 'blacktop_crew_own';
const listeners = new Set<() => void>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function ownCrewCode(): string {
  try {
    let own = localStorage.getItem(LS_OWN_KEY);
    if (!own) {
      own = generateCode();
      localStorage.setItem(LS_OWN_KEY, own);
    }
    return own;
  } catch {
    return 'BLKTOP';
  }
}

/** In the app's language, worked out each time (never saved, so it follows a language change). */
export const defaultCrewName = (code: string) => tr("Crew {0}", [code]);

type Stored = { code: string; name?: string; joinedAt?: number | null };

function readList(): CrewEntry[] {
  const own = ownCrewCode();
  let stored: Stored[] = [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) stored = (JSON.parse(raw) as Stored[]).filter((c) => c && typeof c.code === 'string');
    else {
      // Carry over the single joined crew from before.
      const legacy = localStorage.getItem(LS_LEGACY_KEY);
      if (legacy) {
        const p = JSON.parse(legacy) as Stored;
        if (p?.code && p.code !== own) stored = [{ code: p.code, name: p.name, joinedAt: p.joinedAt ?? null }];
      }
    }
  } catch {
    /* start fresh */
  }
  const ownEntry = stored.find((c) => c.code === own);
  const others = stored.filter((c) => c.code !== own).slice(0, MAX_CREWS - 1);
  const entry = (c: Stored | undefined, code: string, own: boolean): CrewEntry => {
    // Before names were optional, the default was saved as "Crew CODE": that's not a chosen name.
    const chosen = c?.name?.trim() && c.name.trim() !== `Crew ${code}` ? c.name.trim() : '';
    return { code, name: chosen || defaultCrewName(code), custom: !!chosen, own, joinedAt: own ? null : c?.joinedAt ?? null };
  };
  return [entry(ownEntry, own, true), ...others.map((c) => entry(c, c.code, false))];
}

function readActive(list: CrewEntry[]): CrewEntry {
  let active: string | null = null;
  try {
    active = localStorage.getItem(LS_ACTIVE_KEY);
    // Before several crews, the joined crew was the active one.
    if (!active && !localStorage.getItem(LS_KEY)) active = list[1]?.code ?? null;
  } catch {
    /* own */
  }
  return list.find((c) => c.code === active) ?? list[0];
}

function read(): CrewState {
  const crews = readList();
  const a = readActive(crews);
  return { code: a.code, name: a.name, isOwn: a.own, joinedAt: a.joinedAt, crews };
}

let snapshot: CrewState = read();

function save(crews: CrewEntry[], active: string) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(crews.map(({ code, name, custom, joinedAt }) => ({ code, ...(custom ? { name } : {}), joinedAt }))));
    localStorage.setItem(LS_ACTIVE_KEY, active);
    localStorage.removeItem(LS_LEGACY_KEY);
  } catch {
    /* in-memory only this session */
  }
  emit();
}

function emit() {
  snapshot = read();
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Crew QR payload written into / read from the crew QR code. */
export const CREW_QR_PREFIX = 'blacktop:crew:';

export function parseCrewQr(text: string): string | null {
  const trimmed = text.trim();
  const raw = trimmed.toLowerCase().startsWith(CREW_QR_PREFIX)
    ? trimmed.slice(CREW_QR_PREFIX.length)
    : trimmed;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 10 ? code : null;
}

/**
 * Adds a crew and makes it active ('joined'), or just makes it active if this
 * rider is already in it ('already'). 'full' when all crew slots are taken.
 */
export function joinCrew(code: string, name?: string): 'joined' | 'already' | 'full' {
  const clean = code.trim().toUpperCase();
  const crews = snapshot.crews;
  if (crews.some((c) => c.code === clean)) {
    save(crews, clean);
    return 'already';
  }
  if (crews.length >= MAX_CREWS) return 'full';
  const chosen = name?.trim().slice(0, 30) ?? '';
  save([...crews, { code: clean, name: chosen || defaultCrewName(clean), custom: !!chosen, own: false, joinedAt: Date.now() }], clean);
  return 'joined';
}

/**
 * Leaves a crew (never the rider's own). If it was active, the rider's own
 * crew becomes active. Their rows on that crew's boards go too.
 */
export function leaveCrew(code: string) {
  const crews = snapshot.crews;
  const leaving = crews.find((c) => c.code === code);
  if (!leaving || leaving.own) return;
  const rest = crews.filter((c) => c.code !== code);
  save(rest, snapshot.code === code ? rest[0].code : snapshot.code);
  void removeFromCrewBoards(code);
}

/** Renames a crew on this phone (empty goes back to "Crew CODE"). */
export function renameCrew(code: string, name: string) {
  const clean = name.trim().slice(0, 30);
  save(
    snapshot.crews.map((c) => (c.code === code ? { ...c, name: clean || defaultCrewName(c.code), custom: !!clean } : c)),
    snapshot.code,
  );
}

/** Makes one of the rider's crews the active one. */
export function setActiveCrew(code: string) {
  if (snapshot.crews.some((c) => c.code === code)) save(snapshot.crews, code);
}

/** Leaving a crew takes this rider off its boards (their own rows only; best effort). */
async function removeFromCrewBoards(code: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    await Promise.all([
      db.from('crew_scores').delete().eq('user_id', user.id).eq('crew_code', code),
      db.from('crew_weekly_scores').delete().eq('user_id', user.id).eq('crew_code', code),
    ]);
  } catch {
    /* offline: they drop off when the crew next refreshes without them */
  }
}

/** Active crew code without subscribing (non-React callers). */
export function getCrewCode(): string {
  return snapshot.code;
}

/** Every crew this rider is in, own first (non-React callers). */
export function getCrews(): CrewEntry[] {
  return snapshot.crews;
}

/** Called whenever the rider joins, leaves, renames or switches crew. */
export function subscribeCrew(cb: () => void) {
  return subscribe(cb);
}

export function useCrew() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
