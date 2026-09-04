import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCrew } from '@/features/crew/useCrew';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import type { VehicleCardData } from './useVehicleCards';
import type { SharedCardPayload } from '../lib/cardCodec';
import { grantCollectCopy } from '../lib/dropEconomy';
import { TIER_LADDER, type CardTier } from '../types';
import type { ChallengePoint, ChallengeResult } from '@/lib/challengeRun';
import { compactRoute } from '../lib/challenge';
import { DEFAULT_BIKE_PLACEMENT } from '@/features/garage/types';

/** A card planted on the Blacktop map. */
export interface CardDrop {
  id: string;
  lat: number;
  lng: number;
  ownerName: string;
  vehicleName: string;
  makeModel: string | null;
  tier: CardTier;
  photoPath: string | null;
  placement: { xPct: number; yPct: number; scalePct: number };
  cardZoom: number;
  stats: {
    totalRides: number;
    totalDistanceMi: number;
    totalDurationSec: number;
    topSpeedMph: number;
    maxLean: number;
    maxGForce: number;
  };
  /** Already scanned by this rider (green tick + border). */
  collected: boolean;
  /** Planted by this rider. */
  isOwn: boolean;
  /** Time-attack challenge attached to this drop, if the owner set one. */
  challenge: {
    route: ChallengePoint[];
    timeSec: number;
    distanceMi: number;
    finish: ChallengePoint;
  } | null;
}

/** Server-side proximity gate for collecting a card, in metres. */
export const COLLECT_RADIUS_M = 120;
/** Viewport radius used when listing nearby drops. */
const LIST_RADIUS_KM = 60;

type DropRow = {
  id: string;
  lat: number;
  lng: number;
  owner_name: string;
  vehicle_name: string;
  make_model: string | null;
  tier: string;
  photo_path: string | null;
  placement_x: number;
  placement_y: number;
  placement_scale: number;
  card_zoom: number;
  total_rides: number;
  total_distance_mi: number;
  total_duration_sec: number;
  top_speed_mph: number;
  max_lean: number;
  max_g_force: number;
  collected?: boolean;
  is_own?: boolean;
  challenge_route?: ChallengePoint[] | null;
  challenge_time_sec?: number | null;
  challenge_distance_mi?: number | null;
  challenge_finish_lat?: number | null;
  challenge_finish_lng?: number | null;
};

function toDrop(r: DropRow): CardDrop {
  return {
    id: r.id,
    lat: Number(r.lat),
    lng: Number(r.lng),
    ownerName: r.owner_name || 'Rider',
    vehicleName: r.vehicle_name,
    makeModel: r.make_model,
    tier: (r.tier as CardTier) || 'locked',
    photoPath: r.photo_path,
    placement: {
      xPct: Number(r.placement_x) || DEFAULT_BIKE_PLACEMENT.xPct,
      yPct: Number(r.placement_y) || DEFAULT_BIKE_PLACEMENT.yPct,
      scalePct: Number(r.placement_scale) || DEFAULT_BIKE_PLACEMENT.scalePct,
    },
    cardZoom: Number(r.card_zoom) || 1,
    stats: {
      totalRides: Number(r.total_rides) || 0,
      totalDistanceMi: Number(r.total_distance_mi) || 0,
      totalDurationSec: Number(r.total_duration_sec) || 0,
      topSpeedMph: Number(r.top_speed_mph) || 0,
      maxLean: Number(r.max_lean) || 0,
      maxGForce: Number(r.max_g_force) || 0,
    },
    collected: !!r.collected,
    isOwn: !!r.is_own,
    challenge:
      r.challenge_route && r.challenge_time_sec != null && r.challenge_finish_lat != null && r.challenge_finish_lng != null
        ? {
            route: r.challenge_route as ChallengePoint[],
            timeSec: Number(r.challenge_time_sec),
            distanceMi: Number(r.challenge_distance_mi) || 0,
            finish: { lat: Number(r.challenge_finish_lat), lng: Number(r.challenge_finish_lng) },
          }
        : null,
  };
}

/** Converts a drop into the vault payload shape used by QR scans. */
export function dropToPayload(drop: CardDrop): SharedCardPayload {
  return {
    v: 1,
    i: drop.id.replace(/-/g, ''),
    n: drop.vehicleName,
    m: drop.makeModel || undefined,
    o: drop.ownerName,
    t: drop.tier,
    tl: TIER_LADDER.find((t) => t.id === drop.tier)?.label ?? 'Locked',
    s: drop.stats,
    ts: Date.now(),
    p: drop.photoPath || undefined,
    pl: drop.placement,
    z: drop.cardZoom,
  };
}

/**
 * Card drops near a point. Only fetched when the rider has opted into
 * Blacktop World — cards are a World feature.
 */
export function useCardDrops(center: { lat: number; lng: number } | null) {
  const { settings } = useSettings();
  const crew = useCrew();
  const queryClient = useQueryClient();
  const { user, profile } = useProfile();

  const enabled = !!center && settings.blacktopWorldEnabled;
  // Round the centre so panning around a town reuses one cached result.
  const key = center ? `${center.lat.toFixed(2)},${center.lng.toFixed(2)}` : 'none';

  const { data: drops = [], refetch } = useQuery({
    queryKey: ['card-drops', key, crew.code],
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_card_drops', {
        _lat: center!.lat,
        _lng: center!.lng,
        _radius_km: LIST_RADIUS_KM,
        _crew_code: crew.code,
      });
      if (error) throw error;
      return ((data ?? []) as DropRow[]).map(toDrop);
    },
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['card-drops'] });
  }, [queryClient]);

  /** My own planted copies (any location). */
  const { data: myDrops = [] } = useQuery({
    queryKey: ['my-card-drops', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_drops')
        .select('*')
        .eq('owner_id', user!.id)
        .eq('is_active', true);
      if (error) throw error;
      return ((data ?? []) as DropRow[]).map((r) => toDrop({ ...r, is_own: true }));
    },
  });

  const placeDrop = useMutation({
    mutationFn: async (args: {
      card: VehicleCardData;
      lat: number;
      lng: number;
      copyIndex: number;
      photoPath?: string | null;
      cardZoom?: number;
    }) => {
      if (!user?.id) throw new Error('Not signed in');
      const pl = args.card.bike.placement ?? DEFAULT_BIKE_PLACEMENT;
      const s = args.card.stats;
      const { data, error } = await supabase.from('card_drops').insert({
        owner_id: user.id,
        owner_name: profile?.name || 'Rider',
        copy_index: args.copyIndex,
        crew_code: crew.code,
        visibility: settings.cardDropVisibility,
        vehicle_name: args.card.bike.name,
        make_model: args.card.bike.makeModel || null,
        tier: args.card.tier,
        photo_path: args.photoPath ?? null,
        placement_x: pl.xPct,
        placement_y: pl.yPct,
        placement_scale: pl.scalePct,
        card_zoom: args.cardZoom ?? 1,
        total_rides: s.totalRides,
        total_distance_mi: s.totalDistanceMi,
        total_duration_sec: s.totalDurationSec,
        top_speed_mph: s.topSpeedMph,
        max_lean: s.maxLean,
        max_g_force: s.maxGForce,
        lat: args.lat,
        lng: args.lng,
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  /** Attach (or clear) a time-attack challenge on one of my own drops. */
  const setChallenge = useMutation({
    mutationFn: async (args: {
      dropId: string;
      route: ChallengePoint[];
      timeSec: number;
      distanceMi: number;
      finish: ChallengePoint;
    }) => {
      const { error } = await supabase
        .from('card_drops')
        .update({
          challenge_route: compactRoute(args.route),
          challenge_time_sec: Math.max(1, Math.round(args.timeSec)),
          challenge_distance_mi: args.distanceMi,
          challenge_finish_lat: args.finish.lat,
          challenge_finish_lng: args.finish.lng,
          challenge_set_at: new Date().toISOString(),
        })
        .eq('id', args.dropId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Log a challenge attempt so the card owner can see who raced it. */
  const recordAttempt = useMutation({
    mutationFn: async (args: { dropId: string; timeSec: number; result: ChallengeResult }) => {
      if (!user?.id) return;
      const { error } = await supabase.from('card_challenge_attempts').insert({
        drop_id: args.dropId,
        challenger_id: user.id,
        challenger_name: profile?.name || 'Rider',
        time_sec: Math.max(0, Math.round(args.timeSec)),
        result: args.result,
      });
      if (error) throw error;
    },
  });

  const pickUpDrop = useMutation({
    mutationFn: async (dropId: string) => {
      const { error } = await supabase.from('card_drops').delete().eq('id', dropId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const collectDrop = useMutation({
    mutationFn: async (args: { dropId: string; lat: number; lng: number }) => {
      const { data, error } = await supabase.rpc('collect_card_drop', {
        _drop_id: args.dropId,
        _lat: args.lat,
        _lng: args.lng,
      });
      if (error) throw error;
      const row = ((data ?? []) as DropRow[])[0];
      if (!row) throw new Error('too_far');
      return toDrop({ ...row, collected: true });
    },
    onSuccess: async () => {
      invalidate();
      // Every 5 unique cards collected earns a copy of your own card.
      const { data: count } = await supabase.rpc('my_card_collection_count');
      const result = grantCollectCopy(Number(count ?? 0));
      if (result === 'granted') {
        toast.success("Collector's bonus", { description: 'Card copy earned — drop it on the map.' });
      } else if (result === 'capped') {
        toast('Copy bank full', { description: '9/month max. Resets on the 1st. Earn all 9 for a 10th bonus copy.' });
      }
    },
  });

  const uncollected = useMemo(() => drops.filter((d) => !d.collected && !d.isOwn), [drops]);

  return { drops, uncollected, myDrops, refetch, placeDrop, pickUpDrop, collectDrop, setChallenge, recordAttempt };
}
