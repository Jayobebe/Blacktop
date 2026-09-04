import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ACCENT_COLORS } from '@/features/settings';
import type { DerezArena, DerezLobby, DerezPlayer, DerezState } from '../types';

const LS_LOBBY_KEY = 'blacktop_derez_lobby_id';

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function mapLobby(row: any): DerezLobby {
  return {
    id: row.id,
    code: row.code,
    leaderId: row.leader_id,
    lives: row.lives,
    arena: (row.arena as DerezArena | null) ?? null,
    state: (row.state as DerezState) ?? 'lobby',
    winnerId: row.winner_id ?? null,
    winnerName: row.winner_name ?? null,
    startedAt: row.started_at ?? null,
    roundSeq: row.round_seq ?? 0,
  };
}

function mapPlayer(row: any): DerezPlayer {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    accentColor: row.accent_color,
    isReady: row.is_ready,
    livesLeft: row.lives_left,
    isAlive: row.is_alive,
    joinedAt: row.joined_at,
  };
}

export function useDerezLobby() {
  const [lobby, setLobby] = useState<DerezLobby | null>(null);
  const [players, setPlayers] = useState<DerezPlayer[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lobbyIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const refresh = useCallback(async (id: string) => {
    const [{ data: l }, { data: p }] = await Promise.all([
      supabase.from('derez_lobbies').select('*').eq('id', id).maybeSingle(),
      supabase.from('derez_players').select('*').eq('lobby_id', id).order('joined_at'),
    ]);
    if (l) setLobby(mapLobby(l)); else { setLobby(null); localStorage.removeItem(LS_LOBBY_KEY); }
    setPlayers((p ?? []).map(mapPlayer));
  }, []);

  // Restore an active lobby on reload
  useEffect(() => {
    const saved = localStorage.getItem(LS_LOBBY_KEY);
    if (saved) { lobbyIdRef.current = saved; refresh(saved); }
  }, [refresh]);

  // Realtime sync of lobby + players
  useEffect(() => {
    const id = lobby?.id;
    if (!id) return;
    lobbyIdRef.current = id;
    localStorage.setItem(LS_LOBBY_KEY, id);

    const channel = supabase
      .channel(`derez-db-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'derez_lobbies', filter: `id=eq.${id}` }, () => refresh(id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'derez_players', filter: `lobby_id=eq.${id}` }, () => refresh(id))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lobby?.id, refresh]);

  const takenColors = players.map(p => p.accentColor);

  const pickColor = useCallback((preferred: string, taken: string[]) => {
    if (!taken.includes(preferred)) return preferred;
    const free = ACCENT_COLORS.find(c => !taken.includes(c.id));
    return free?.id ?? preferred;
  }, []);

  const createLobby = useCallback(async (displayName: string, accentColor: string) => {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Not signed in');

      const { data: l, error } = await supabase
        .from('derez_lobbies')
        .insert({ code: randomCode(), leader_id: uid, lives: 3 })
        .select()
        .single();
      if (error) throw error;

      const { error: pErr } = await supabase.from('derez_players').insert({
        lobby_id: l.id, user_id: uid, display_name: displayName || 'Rider',
        accent_color: accentColor, lives_left: 3,
      });
      if (pErr) throw pErr;

      setLobby(mapLobby(l));
      await refresh(l.id);
      return mapLobby(l);
    } catch (e: any) {
      toast.error('Could not create lobby', { description: e.message });
      return null;
    } finally { setBusy(false); }
  }, [refresh]);

  const joinLobby = useCallback(async (code: string, displayName: string, accentColor: string) => {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Not signed in');

      const { data: found, error } = await supabase.rpc('lookup_derez_by_code', { _code: code.toUpperCase().trim() });
      if (error) throw error;
      const row: any = Array.isArray(found) ? found[0] : found;
      if (!row) { toast.error('Lobby not found', { description: 'Check the code and try again.' }); return null; }

      const { data: existing } = await supabase.from('derez_players').select('accent_color').eq('lobby_id', row.id);
      const taken = (existing ?? []).map((p: any) => p.accent_color);
      const color = pickColor(accentColor, taken);

      const { error: pErr } = await supabase.from('derez_players').upsert({
        lobby_id: row.id, user_id: uid, display_name: displayName || 'Rider',
        accent_color: color, lives_left: row.lives, is_alive: true, is_ready: false,
      }, { onConflict: 'lobby_id,user_id' });
      if (pErr) throw pErr;

      const mapped = mapLobby(row);
      setLobby(mapped);
      await refresh(row.id);
      if (color !== accentColor) toast.info('Colour reassigned', { description: 'Someone already had yours.' });
      return mapped;
    } catch (e: any) {
      toast.error('Could not join lobby', { description: e.message });
      return null;
    } finally { setBusy(false); }
  }, [pickColor, refresh]);

  const leaveLobby = useCallback(async () => {
    const id = lobbyIdRef.current;
    localStorage.removeItem(LS_LOBBY_KEY);
    if (id && userId) {
      await supabase.from('derez_players').delete().eq('lobby_id', id).eq('user_id', userId);
      // Promote the longest-present remaining player if the leader left.
      if (lobby?.leaderId === userId) {
        const { data: rest } = await supabase.from('derez_players').select('user_id').eq('lobby_id', id).order('joined_at').limit(1);
        if (rest?.length) await supabase.from('derez_lobbies').update({ leader_id: rest[0].user_id }).eq('id', id);
        else await supabase.from('derez_lobbies').delete().eq('id', id);
      }
    }
    lobbyIdRef.current = null;
    setLobby(null);
    setPlayers([]);
  }, [lobby?.leaderId, userId]);

  const setReady = useCallback(async (ready: boolean) => {
    const id = lobbyIdRef.current;
    if (!id || !userId) return;
    await supabase.from('derez_players').update({ is_ready: ready }).eq('lobby_id', id).eq('user_id', userId);
  }, [userId]);

  const setLives = useCallback(async (lives: number) => {
    const id = lobbyIdRef.current;
    if (!id) return;
    await supabase.from('derez_lobbies').update({ lives }).eq('id', id);
    await supabase.from('derez_players').update({ is_ready: false, lives_left: lives }).eq('lobby_id', id);
  }, []);

  const setArena = useCallback(async (arena: DerezArena) => {
    const id = lobbyIdRef.current;
    if (!id) return;
    await supabase.from('derez_lobbies').update({ arena: arena as any }).eq('id', id);
    await supabase.from('derez_players').update({ is_ready: false }).eq('lobby_id', id);
  }, []);

  const startCountdown = useCallback(async () => {
    const id = lobbyIdRef.current;
    if (!id || !lobby) return;
    const startAt = new Date(Date.now() + 5000).toISOString();
    await supabase.from('derez_players').update({
      is_alive: true, lives_left: lobby.lives,
    }).eq('lobby_id', id);
    await supabase.from('derez_lobbies').update({
      state: 'countdown', started_at: startAt, winner_id: null, winner_name: null,
      round_seq: (lobby.roundSeq ?? 0) + 1,
    }).eq('id', id);
  }, [lobby]);

  const goLive = useCallback(async () => {
    const id = lobbyIdRef.current;
    if (!id) return;
    await supabase.from('derez_lobbies').update({ state: 'live' }).eq('id', id);
  }, []);

  const finishRound = useCallback(async (winner: DerezPlayer | null) => {
    const id = lobbyIdRef.current;
    if (!id) return;
    await supabase.from('derez_lobbies').update({
      state: 'finished', winner_id: winner?.userId ?? null, winner_name: winner?.displayName ?? null,
    }).eq('id', id);
  }, []);

  const resetToLobby = useCallback(async () => {
    const id = lobbyIdRef.current;
    if (!id || !lobby) return;
    await supabase.from('derez_players').update({
      is_ready: false, is_alive: true, lives_left: lobby.lives,
    }).eq('lobby_id', id);
    await supabase.from('derez_lobbies').update({
      state: 'lobby', winner_id: null, winner_name: null, started_at: null,
    }).eq('id', id);
  }, [lobby]);

  /** Self-reported death: burn a life, and go out when there are none left. */
  const reportDeath = useCallback(async () => {
    const id = lobbyIdRef.current;
    if (!id || !userId) return;
    const me = players.find(p => p.userId === userId);
    if (!me) return;
    const left = Math.max(0, me.livesLeft - 1);
    await supabase.from('derez_players').update({ lives_left: left, is_alive: left > 0 })
      .eq('lobby_id', id).eq('user_id', userId);
  }, [players, userId]);

  const me = players.find(p => p.userId === userId) ?? null;
  const isLeader = !!lobby && !!userId && lobby.leaderId === userId;

  return {
    lobby, players, me, userId, isLeader, busy, takenColors,
    createLobby, joinLobby, leaveLobby, setReady, setLives, setArena,
    startCountdown, goLive, finishRound, resetToLobby, reportDeath, refresh,
  };
}
