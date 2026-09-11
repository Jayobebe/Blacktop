import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrew } from '@/features/crew/useCrew';
import type {
  TankCurrency,
  TankPledgeRow,
  TankPlace,
  TankRequestRow,
  TankSummaryRow,
} from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as any).rpc(name, args);

/**
 * Blacktank is a pledge ledger, not a wallet. Blacktop never holds anyone's
 * money - it records what each rider has chipped in, runs the unanimous vote
 * on withdrawals, then hands each payer off to Nimiq Pay to settle their share
 * directly with the requester.
 */
export function useBlacktank() {
  const crew = useCrew();
  const crewCode = crew.code;
  const qc = useQueryClient();

  const membership = useQuery({
    queryKey: ['blacktank', 'membership', crewCode],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data, error } = await (supabase as any)
        .from('blacktank_members')
        .select('id')
        .eq('crew_code', crewCode.toUpperCase())
        .eq('user_id', uid)
        .maybeSingle();
      if (error) return false;
      return Boolean(data);
    },
  });

  const isMember = membership.data === true;

  const summary = useQuery({
    queryKey: ['blacktank', 'summary', crewCode],
    enabled: isMember,
    queryFn: async () => {
      const { data, error } = await rpc('blacktank_summary', { _crew_code: crewCode });
      if (error) throw error;
      return (data ?? []) as TankSummaryRow[];
    },
  });

  const pledges = useQuery({
    queryKey: ['blacktank', 'pledges', crewCode],
    enabled: isMember,
    queryFn: async () => {
      const { data, error } = await rpc('blacktank_list_pledges', { _crew_code: crewCode });
      if (error) throw error;
      return (data ?? []) as TankPledgeRow[];
    },
  });

  const requests = useQuery({
    queryKey: ['blacktank', 'requests', crewCode],
    enabled: isMember,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await rpc('blacktank_list_requests', { _crew_code: crewCode });
      if (error) throw error;
      return (data ?? []) as TankRequestRow[];
    },
  });

  const place = useQuery({
    queryKey: ['blacktank', 'place', crewCode],
    enabled: isMember,
    queryFn: async () => {
      const { data, error } = await rpc('blacktank_get_place', { _crew_code: crewCode });
      if (error) throw error;
      const rows = (data ?? []) as TankPlace[];
      return rows[0] ?? null;
    },
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['blacktank'] });
  }, [qc]);

  const join = useMutation({
    mutationFn: async (wallet: { nim?: string; usdt?: string }) => {
      const { error } = await rpc('blacktank_join', {
        _crew_code: crewCode,
        _nim_address: wallet.nim || null,
        _usdt_address: wallet.usdt || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const pledge = useMutation({
    mutationFn: async (input: { currency: TankCurrency; amount: number; note?: string }) => {
      const { error } = await rpc('blacktank_pledge', {
        _crew_code: crewCode,
        _currency: input.currency,
        _amount: input.amount,
        _note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const request = useMutation({
    mutationFn: async (input: {
      currency: TankCurrency;
      amount: number;
      reason: string;
      payoutAddress: string;
      expiresMinutes?: number;
    }) => {
      const { error } = await rpc('blacktank_request', {
        _crew_code: crewCode,
        _currency: input.currency,
        _amount: input.amount,
        _reason: input.reason,
        _payout_address: input.payoutAddress,
        _expires_minutes: input.expiresMinutes ?? 720,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const vote = useMutation({
    mutationFn: async (input: { requestId: string; approve: boolean }) => {
      const { data, error } = await rpc('blacktank_vote', {
        _request_id: input.requestId,
        _approve: input.approve,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  const cancelRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await rpc('blacktank_cancel_request', { _request_id: requestId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const settle = useMutation({
    mutationFn: async (input: { requestId: string; amount: number; txRef?: string }) => {
      const { error } = await rpc('blacktank_settle', {
        _request_id: input.requestId,
        _amount: input.amount,
        _tx_ref: input.txRef || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setPlace = useMutation({
    mutationFn: async (input: { lat: number; lng: number; label?: string }) => {
      const { error } = await rpc('blacktank_set_place', {
        _crew_code: crewCode,
        _lat: input.lat,
        _lng: input.lng,
        _label: input.label || 'Blacktank',
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    crewCode,
    isMember,
    loadingMembership: membership.isLoading,
    summary: summary.data ?? [],
    pledges: pledges.data ?? [],
    requests: requests.data ?? [],
    place: place.data ?? null,
    isLoading: summary.isLoading || requests.isLoading,
    join,
    pledge,
    request,
    vote,
    cancelRequest,
    settle,
    setPlace,
    refresh: invalidate,
  };
}

/**
 * Lightweight read used by the map so the landmark can render without pulling
 * in the full tank state.
 */
export function useBlacktankPlace() {
  const crew = useCrew();
  return useQuery({
    queryKey: ['blacktank', 'place', crew.code],
    queryFn: async () => {
      const { data, error } = await rpc('blacktank_get_place', { _crew_code: crew.code });
      if (error) return null;
      const rows = (data ?? []) as TankPlace[];
      return rows[0] ?? null;
    },
    staleTime: 60000,
  });
}
