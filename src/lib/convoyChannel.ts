import { supabase } from '@/integrations/supabase/client';

type ChannelConfig = NonNullable<Parameters<typeof supabase.channel>[1]>['config'];

/**
 * A convoy's live channel (`convoy-control:`, `voice:`, `map-presence:`, `rescue-`,
 * `route-request-`, `regroup-`, `reactions-`, `prox-convoy:` + the convoy id), opened as a
 * private channel so only the convoy's members can join, read or send: the rule on
 * realtime.messages (`is_convoy_member` through `convoy_id_from_topic`, migration
 * 20261102000000_private_convoy_channels.sql) only applies to private channels, and opened as
 * public, anyone signed in who knew the convoy's id could end the ride for everyone or join its
 * voice. A new convoy channel goes through here and gets its prefix added to that function.
 * Spectating stays public (`spectate:`): it's for the crew, who aren't members.
 */
export function convoyChannel(topic: string, config: ChannelConfig = {}) {
  return supabase.channel(topic, { config: { ...config, private: true } });
}
