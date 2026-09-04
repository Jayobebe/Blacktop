import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/features/profile';
import { useSettings } from '@/features/settings';
import { recordKickbacks } from '@/features/ride/lib/badgeWallet';

const SEEN_KEY = 'bt.card_kickback_seen.v1';

interface KickbackRow {
  id: string;
  collector_name: string;
  vehicle_name: string;
  tier: string;
  created_at: string;
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  try {
    // Keep the list bounded — only the newest 200 ids matter.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* storage full — not fatal */
  }
}

/**
 * Collection kickbacks — when another rider collects one of your dropped
 * cards, you earn a badge point. Polled while Blacktop World is on; the first
 * ever run seeds the seen-list silently so existing collections don't flood.
 */
export function useCardKickbacks() {
  const { user } = useProfile();
  const { settings } = useSettings();

  const { data } = useQuery({
    queryKey: ['card-kickbacks', user?.id],
    enabled: !!user?.id && settings.blacktopWorldEnabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_kickbacks');
      if (error) throw error;
      return (data ?? []) as KickbackRow[];
    },
  });

  useEffect(() => {
    if (!data) return;
    const seen = readSeen();
    const fresh = data.filter((k) => !seen.has(k.id));
    if (fresh.length === 0) return;

    const firstRun = seen.size === 0 && !localStorage.getItem(SEEN_KEY);
    fresh.forEach((k) => seen.add(k.id));
    writeSeen(seen);

    // Seed silently the first time so old collections don't toast-spam.
    if (firstRun) {
      if (fresh.length > 0) recordKickbacks(fresh.length);
      return;
    }

    recordKickbacks(fresh.length);
    const latest = fresh[0];
    toast.success('Your card was collected', {
      description:
        fresh.length === 1
          ? `${latest.collector_name} picked up your ${latest.vehicle_name} · +${fresh.length} badge pt`
          : `${latest.collector_name} and ${fresh.length - 1} more picked up your cards · +${fresh.length} badge pts`,
    });
  }, [data]);
}
