import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';

/**
 * Wave and emoji reactions: tiny convoy-wide broadcasts (no database). Any
 * rider can see them; pillions send them from the passenger screen. One
 * listener per device (mounted by the ride / pillion screens).
 */

export const WAVE = '👋';
export const REACTIONS: { emoji: string; label: string }[] = [
  { emoji: '👍', label: tr("Thumbs up") },
  { emoji: '🔥', label: tr("Fire") },
  { emoji: '😂', label: tr("Laughing") },
  { emoji: '😱', label: tr("Whoa") },
  { emoji: '🛑', label: tr("Need a stop") },
  { emoji: '⛽', label: tr("Fuel") },
  { emoji: '☕', label: tr("Coffee") },
  { emoji: '📸', label: tr("Photo stop") },
];

const ALLOWED = new Set([WAVE, ...REACTIONS.map((r) => r.emoji)]);
const SEND_GAP_MS = 1500;

interface Reaction {
  fromId: string;
  fromName: string;
  emoji: string;
}

let channel: ReturnType<typeof supabase.channel> | null = null;
let lastSentAt = 0;

export async function sendReaction(fromId: string, fromName: string, emoji: string): Promise<boolean> {
  if (!channel || !ALLOWED.has(emoji)) return false;
  const now = Date.now();
  if (now - lastSentAt < SEND_GAP_MS) return false;
  lastSentAt = now;
  await channel.send({ type: 'broadcast', event: 'reaction', payload: { fromId, fromName, emoji } });
  haptics.tick();
  return true;
}

function describe(r: Reaction): string {
  const name = String(r.fromName || 'Rider').slice(0, 30);
  if (r.emoji === WAVE) return `${name} waved`;
  const label = REACTIONS.find((x) => x.emoji === r.emoji)?.label;
  return label === 'Need a stop' ? `${name} needs a stop` : name;
}

export function useReactionsListener(convoyId: string | null, userId: string | null) {
  useEffect(() => {
    if (!convoyId) return;
    const ch = supabase.channel(`reactions-${convoyId}`);
    ch.on('broadcast', { event: 'reaction' }, ({ payload }) => {
      const r = payload as Reaction;
      if (!r?.fromId || r.fromId === userId || !ALLOWED.has(r.emoji)) return;
      const urgent = r.emoji === '🛑';
      if (urgent) haptics.heavy();
      toast(`${r.emoji}  ${describe(r)}`, { duration: urgent ? 6000 : 2500 });
    }).subscribe();
    channel = ch;
    return () => {
      if (channel === ch) channel = null;
      supabase.removeChannel(ch);
    };
  }, [convoyId, userId]);
}
