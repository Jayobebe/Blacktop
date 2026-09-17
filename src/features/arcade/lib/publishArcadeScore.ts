import { supabase } from '@/integrations/supabase/client';
import { ownCrewCode } from '@/features/crew/useCrew';

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

    // Crew code / rider name come from local state (same source the board uses).
    let crewCode = ownCrewCode();
    try {
      const raw = localStorage.getItem('blacktop_crew');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.code) crewCode = parsed.code;
      }
    } catch { /* fall back to own crew */ }

    let displayName = 'Rider';
    try {
      const raw = localStorage.getItem('blacktop_profile');
      if (raw) displayName = JSON.parse(raw)?.name || 'Rider';
    } catch { /* keep default */ }

    const { data: existing } = await (supabase as any)
      .from('crew_scores')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const row = {
      ...(existing ?? {}),
      user_id: user.id,
      crew_code: crewCode,
      display_name: displayName,
      [column]: value,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabase as any).from('crew_scores').upsert(row);
    if (error) console.error('Failed to publish arcade score:', error);
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
