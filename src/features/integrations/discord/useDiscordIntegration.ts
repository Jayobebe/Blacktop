import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DiscordIntegration {
  webhook_url: string;
  server_name: string | null;
  role_to_ping: string | null;
  auto_announce: boolean;
}

export function useDiscordIntegration() {
  const [integration, setIntegration] = useState<DiscordIntegration | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIntegration(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('discord_integrations' as any)
      .select('webhook_url, server_name, role_to_ping, auto_announce')
      .eq('user_id', user.id)
      .maybeSingle();
    setIntegration((data as unknown as DiscordIntegration | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (payload: Partial<DiscordIntegration> & { webhook_url: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Anonymous sign in if needed
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        toast.error('Could not connect to backend');
        return false;
      }
    }
    const { data: { user: u2 } } = await supabase.auth.getUser();
    if (!u2) return false;

    const row = {
      user_id: u2.id,
      webhook_url: payload.webhook_url,
      server_name: payload.server_name ?? null,
      role_to_ping: payload.role_to_ping ?? null,
      auto_announce: payload.auto_announce ?? true,
    };
    const { error } = await supabase
      .from('discord_integrations' as any)
      .upsert(row, { onConflict: 'user_id' });
    if (error) {
      toast.error('Failed to save Discord integration');
      return false;
    }
    await refresh();
    toast.success('Discord server connected');
    return true;
  }, [refresh]);

  const disconnect = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('discord_integrations' as any)
      .delete()
      .eq('user_id', user.id);
    if (error) {
      toast.error('Failed to disconnect');
      return;
    }
    setIntegration(null);
    toast.success('Discord disconnected');
  }, []);

  return { integration, loading, save, disconnect, refresh };
}

export async function announceConvoyToDiscord(args: {
  convoyCode: string;
  convoyName?: string;
  joinUrl?: string;
  leaderName?: string;
}) {
  try {
    const { error } = await supabase.functions.invoke('discord-announce-convoy', { body: args });
    if (error) {
      console.warn('[Discord] announce convoy failed', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Discord] announce convoy error', e);
    return false;
  }
}

export async function announceRescueToDiscord(args: {
  convoyId: string;
  riderName: string;
  lat: number;
  lng: number;
}) {
  try {
    const { error } = await supabase.functions.invoke('discord-announce-rescue', { body: args });
    if (error) {
      console.warn('[Discord] announce rescue failed', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Discord] announce rescue error', e);
    return false;
  }
}
