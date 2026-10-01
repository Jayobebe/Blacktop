/**
 * What the pit crew wants after the session, picked on their phone before
 * timing starts and sent to the racer over the link:
 * - results: the whole session comes to the crew's phone at the end;
 * - flyover: the 3D flyover plays when the results open (both phones);
 * - overlay: the racer's phone records the 1080p stats overlay video for the
 *   session and offers to share it at the end.
 * Without a crew choice the racer gets their own default (overlay follows
 * their overlay video setting).
 */
export interface PostRace {
  results: boolean;
  flyover: boolean;
  overlay: boolean;
}

export const CREW_DEFAULT_POST_RACE: PostRace = { results: true, flyover: true, overlay: false };

const KEY = 'bt.track_post_race';

export function cleanPostRace(v: unknown): PostRace | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.results !== 'boolean' || typeof o.flyover !== 'boolean' || typeof o.overlay !== 'boolean') return null;
  // The flyover is part of the results.
  return { results: o.results, flyover: o.results && o.flyover, overlay: o.overlay };
}

/** The crew's last choice on this phone. */
export function loadPostRace(): PostRace {
  try {
    return cleanPostRace(JSON.parse(localStorage.getItem(KEY) || 'null')) ?? CREW_DEFAULT_POST_RACE;
  } catch {
    return CREW_DEFAULT_POST_RACE;
  }
}

export function savePostRace(p: PostRace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: it just isn't remembered */
  }
}

export const samePostRace = (a: PostRace | null | undefined, b: PostRace | null | undefined) =>
  !!a && !!b && a.results === b.results && a.flyover === b.flyover && a.overlay === b.overlay;
