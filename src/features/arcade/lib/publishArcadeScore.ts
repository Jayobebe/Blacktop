import { supabase } from '@/integrations/supabase/client';
import { nudgePush } from '@/features/notifications';
import { getCrews } from '@/features/crew/useCrew';

/**
 * Push an arcade high score straight to the crew board so crew mates see it
 * without the rider having to open the leaderboard page first.
 * Only the arcade columns are touched; ride stats are left as they are.
 */
export async function publishArcadeScore(
  column: 'hit_heavy' | 'petrol_head',
  value: number,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let displayName = 'Rider';
    try {
      const raw = localStorage.getItem('blacktop_profile');
      if (raw) displayName = JSON.parse(raw)?.name || 'Rider';
    } catch { /* keep default */ }

    // Onto every crew this rider is in (one board row per crew). Only the
    // columns sent are updated, so ride stats on an existing row stay as they are.
    const updated_at = new Date().toISOString();
    const rows = getCrews().map((c) => ({ user_id: user.id, crew_code: c.code, display_name: displayName, [column]: value, updated_at }));
    const { error } = await (supabase as any).from('crew_scores').upsert(rows, { onConflict: 'user_id,crew_code' });
    if (error) console.error('Failed to publish arcade score:', error);
    else nudgePush(); // crew mates passed on the board hear about it
  } catch (e) {
    console.error('Failed to publish arcade score:', e);
  }
}

/**
 * Push whatever bests are already stored on this device up to the crew board.
 * Called when the arcade opens so scores set before the board existed (or
 * before a failed sync) still appear for crew mates.
 */
export async function syncExistingArcadeScores(): Promise<void> {
  const hh = Number(localStorage.getItem('blacktop_arcade_hit_heavy_hs') ?? 0);
  const ph = Number(localStorage.getItem('blacktop_arcade_petrol_head_hs') ?? 0);
  if (hh > 0) await publishArcadeScore('hit_heavy', hh);
  if (ph > 0) await publishArcadeScore('petrol_head', Math.round(ph));
}
