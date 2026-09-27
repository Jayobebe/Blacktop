import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import type { ConvoyState } from '@/types/convoy';
import { ALERT_RADIUS_M, DWELL_MS, VISIBLE_RADIUS_M, cellKey, cellOf, distanceM, neighbourhood } from '../lib/geo';
import { getProximityState, isBlocked, setProximityState } from '../lib/proximityStore';
import { MAX_MERGED_RIDERS, registerProximityControls, type ConvoyActions } from '../lib/controls';
import type { Invite, InviteKind, MergeRecord, NearbyParty, NearbyRider, RiderBeacon } from '../types';

const INVITE_TTL_MS = 45_000;
const GO_TIMEOUT_MS = 30_000;
const BEACON_STALE_MS = 60_000;
const RETRACK_MS = 15_000;
const RETRACK_MOVE_M = 40;

type Channel = ReturnType<typeof supabase.channel>;

type ProxMessage =
  | { type: 'invite'; to: string; invite: Invite }
  | { type: 'answer'; to: string; from: string; inviteId: string; accept: boolean }
  | { type: 'cancel'; to: string; from: string; inviteId: string }
  | {
      type: 'go';
      to: string;
      from: string;
      fromName: string;
      inviteId: string;
      kind: InviteKind;
      code: string;
      convoyId: string;
      mergeId?: string;
    };

interface Options {
  enabled: boolean;
  userId: string | null;
  name: string;
  position: { lat: number; lng: number } | null;
  speedMph: number;
  convoy: ConvoyState;
  actions: ConvoyActions;
}

function partyKeyOf(b: RiderBeacon): string {
  return b.convoyId ? b.convoyId : `solo:${b.userId}`;
}

/**
 * Nearby riders engine. While enabled (opted in + riding) it announces this
 * rider in its grid cell, watches the 3×3 cells around it, groups everyone
 * nearby into parties and runs the invite handshake:
 *
 *   invite → (accept | decline) → host sends "go" with a convoy code → guest joins.
 *
 * The host is whoever owns the convoy the other side ends up in: the inviter
 * for solo↔solo, the leader for solo↔convoy, the bigger convoy for a merge.
 * Crossed invites (both tapped at once) count as mutual acceptance.
 */
export function useProximity({ enabled, userId, name, position, speedMph, convoy, actions }: Options) {
  const channelsRef = useRef(new Map<string, Channel>());
  const trackedCellRef = useRef<string | null>(null);
  const lastTrackRef = useRef<{ at: number; lat: number; lng: number; convoyKey: string } | null>(null);
  const closeSinceRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // The only rider whose "go" this device will act on: the one it invited or
  // said yes to. Stops anyone nearby from pulling a rider into their convoy.
  const expectedHostRef = useRef<string | null>(null);

  // Latest props for callbacks fired from realtime handlers.
  const live = useRef({ userId, name, position, speedMph, convoy, actions });
  live.current = { userId, name, position, speedMph, convoy, actions };

  const cells = enabled && position ? neighbourhood(position.lat, position.lng) : [];
  const cellsKey = cells.join(',');
  const ownCell = enabled && position ? (() => { const c = cellOf(position.lat, position.lng); return cellKey(c.row, c.col); })() : null;

  // ── helpers ────────────────────────────────────────────────────────────────
  const setTimer = (key: string, ms: number, fn: () => void) => {
    const prev = timersRef.current.get(key);
    if (prev) clearTimeout(prev);
    timersRef.current.set(key, setTimeout(() => { timersRef.current.delete(key); fn(); }, ms));
  };
  const clearTimer = (key: string) => {
    const t = timersRef.current.get(key);
    if (t) clearTimeout(t);
    timersRef.current.delete(key);
  };

  const beacon = (): RiderBeacon | null => {
    const { userId: uid, name: n, position: pos, speedMph: spd, convoy: c } = live.current;
    if (!uid || !pos) return null;
    const leader = c.members.find((m) => m.isLeader);
    return {
      userId: uid,
      name: n || 'Rider',
      lat: pos.lat,
      lng: pos.lng,
      speedMph: Math.round(spd || 0),
      convoyId: c.id,
      convoyCode: c.code,
      convoyName: c.id ? `${leader?.name ?? 'Convoy'}'s convoy` : null,
      leaderId: c.id ? leader?.userId ?? null : null,
      isLeader: !!c.id && c.isLeader,
      memberCount: c.id ? Math.max(1, c.members.length) : 1,
      at: Date.now(),
    };
  };

  const send = (msg: ProxMessage) => {
    // Our own cell is in the listener's 3×3 block whenever we can see them.
    const ch = trackedCellRef.current ? channelsRef.current.get(trackedCellRef.current) : null;
    if (!ch) return false;
    void ch.send({ type: 'broadcast', event: 'prox', payload: msg });
    return true;
  };

  // ── rebuild nearby riders + parties from every watched channel ─────────────
  const rebuild = () => {
    const { userId: uid, position: pos, convoy: c } = live.current;
    if (!uid || !pos) return;
    const now = Date.now();
    const latest = new Map<string, RiderBeacon>();
    channelsRef.current.forEach((ch) => {
      const presence = ch.presenceState() as Record<string, RiderBeacon[]>;
      for (const metas of Object.values(presence)) {
        const b = metas[metas.length - 1];
        if (!b?.userId || b.userId === uid) continue;
        if (now - b.at > BEACON_STALE_MS) continue;
        if (c.id && b.convoyId === c.id) continue; // my own convoy
        if (isBlocked(b.userId)) continue;
        const prev = latest.get(b.userId);
        if (!prev || prev.at < b.at) latest.set(b.userId, b);
      }
    });

    const all: NearbyRider[] = [...latest.values()].map((b) => ({ ...b, distanceM: distanceM(pos, b) }));
    const byParty = new Map<string, NearbyRider[]>();
    for (const r of all) {
      const k = partyKeyOf(r);
      byParty.set(k, [...(byParty.get(k) ?? []), r]);
    }

    const parties: NearbyParty[] = [];
    const seenClose = new Set<string>();
    byParty.forEach((riders, key) => {
      const first = riders[0];
      const isConvoy = !!first.convoyId;
      const contactId = isConvoy ? first.leaderId ?? first.userId : first.userId;
      const contact = riders.find((r) => r.userId === contactId) ?? null;
      const dist = Math.min(...riders.map((r) => r.distanceM));
      let closeSince: number | null = null;
      if (dist <= ALERT_RADIUS_M) {
        closeSince = closeSinceRef.current.get(key) ?? now;
        closeSinceRef.current.set(key, closeSince);
        seenClose.add(key);
      }
      parties.push({
        key,
        kind: isConvoy ? 'convoy' : 'solo',
        contactId,
        contactName: contact?.name ?? (isConvoy ? first.convoyName ?? 'Convoy' : first.name),
        contact: isConvoy ? contact : first,
        riders,
        memberCount: Math.max(first.memberCount, riders.length),
        distanceM: dist,
        closeSince,
      });
    });
    // Leaving the radius resets the dwell timer.
    for (const k of [...closeSinceRef.current.keys()]) if (!seenClose.has(k)) closeSinceRef.current.delete(k);

    parties.sort((a, b) => a.distanceM - b.distanceM);
    setProximityState({
      riders: all.filter((r) => r.distanceM <= VISIBLE_RADIUS_M).sort((a, b) => a.distanceM - b.distanceM),
      parties,
    });
  };

  // ── carry out a handshake ─────────────────────────────────────────────────
  const finishJoin = async (code: string, withName: string) => {
    const { actions: a } = live.current;
    const ok = await a.joinConvoy(code);
    if (ok) {
      a.attachRide(a.getConvoyId());
      haptics.success();
      toast.success(`Riding with ${withName}`, { description: 'Voice and the convoy map are live.' });
    } else {
      toast.error(`Couldn't join ${withName}`);
    }
    return ok;
  };

  /** Host side: make sure there's a convoy, then tell the guest to join it. */
  const runHost = async (kind: InviteKind, inviteId: string, guestId: string, guestName: string) => {
    const { actions: a, convoy: c, name: myName } = live.current;
    setProximityState({ busy: `Setting up with ${guestName}…` });
    try {
      let code = c.code;
      let convoyId = c.id;
      if (kind === 'pair' || !convoyId || !code) {
        const created = await a.createConvoy();
        if (!created) throw new Error('create failed');
        code = created.code;
        convoyId = created.id;
        a.attachRide(convoyId);
      }

      let mergeId: string | undefined;
      if (kind === 'merge') {
        const guest = getProximityState().parties.find((p) => p.contactId === guestId)?.contact;
        if (!guest?.convoyId || !guest.convoyCode) throw new Error('guest convoy unknown');
        if (c.members.length + guest.memberCount > MAX_MERGED_RIDERS) {
          toast.error(`Too many riders to merge (${c.members.length + guest.memberCount}/${MAX_MERGED_RIDERS})`);
          send({ type: 'answer', to: guestId, from: live.current.userId!, inviteId, accept: false });
          return;
        }
        mergeId = crypto.randomUUID();
        const record: MergeRecord = {
          mergeId,
          role: 'host',
          hostConvoyId: convoyId,
          hostLeaderId: live.current.userId!,
          hostName: myName,
          homeConvoyId: guest.convoyId,
          homeCode: guest.convoyCode,
          homeLeaderId: guestId,
          homeName: guestName,
        };
        setProximityState({ merge: record });
      }

      send({ type: 'go', to: guestId, from: live.current.userId!, fromName: myName, inviteId, kind, code, convoyId, mergeId });
      toast.success(kind === 'merge' ? `Merging with ${guestName}'s convoy` : `${guestName} is joining you`);
    } catch (e) {
      console.warn('[Proximity] host failed', e);
      toast.error('Could not set up the convoy');
    } finally {
      setProximityState({ busy: null, outgoing: null, incoming: null });
    }
  };

  /** Guest side: waiting for the host's "go". */
  const awaitGo = (fromId: string, fromName: string) => {
    expectedHostRef.current = fromId;
    setProximityState({ busy: `Joining ${fromName}…`, incoming: null, outgoing: null });
    setTimer('go', GO_TIMEOUT_MS, () => {
      if (getProximityState().busy) {
        expectedHostRef.current = null;
        setProximityState({ busy: null });
        toast.error(`${fromName} didn't respond`);
      }
    });
  };

  /** Who hosts, from this device's point of view. */
  const iAmHost = (kind: InviteKind, otherId: string, otherCount: number, iInvited: boolean) => {
    const { userId: uid, convoy: c } = live.current;
    if (kind === 'pair') return iInvited;
    if (kind === 'join') return !!c.id && c.isLeader;
    const mine = c.members.length;
    if (mine !== otherCount) return mine > otherCount;
    return (uid ?? '') < otherId;
  };

  const handleMessage = async (msg: ProxMessage) => {
    const uid = live.current.userId;
    if (!uid || msg?.to !== uid) return;
    const st = getProximityState();

    if (msg.type === 'invite') {
      const inv = msg.invite;
      if (isBlocked(inv.fromId) || st.busy) return;
      // Crossed invites: both riders asked each other → treat as accepted.
      if (st.outgoing && st.outgoing.toId === inv.fromId) {
        clearTimer('outgoing');
        const crossedHostIsMe =
          inv.kind === 'pair' ? uid < inv.fromId : iAmHost(inv.kind, inv.fromId, inv.fromMemberCount, true);
        if (crossedHostIsMe) await runHost(inv.kind, st.outgoing.id, inv.fromId, inv.fromName);
        else awaitGo(inv.fromId, inv.fromName);
        return;
      }
      if (st.incoming) return; // one prompt at a time; they can ask again
      haptics.heavy();
      setProximityState({ incoming: inv });
      setTimer('incoming', INVITE_TTL_MS, () => {
        if (getProximityState().incoming?.id === inv.id) setProximityState({ incoming: null });
      });
      return;
    }

    if (msg.type === 'cancel') {
      if (st.incoming?.id === msg.inviteId) setProximityState({ incoming: null });
      return;
    }

    if (msg.type === 'answer') {
      if (!st.outgoing || st.outgoing.id !== msg.inviteId) return;
      clearTimer('outgoing');
      if (!msg.accept) {
        setProximityState({ outgoing: null });
        toast(`${st.outgoing.toName} said not now`);
        return;
      }
      // An accept only ever comes back to the host.
      await runHost(st.outgoing.kind, st.outgoing.id, st.outgoing.toId, st.outgoing.toName);
      return;
    }

    if (msg.type === 'go') {
      const expected = expectedHostRef.current === msg.from || st.outgoing?.toId === msg.from;
      if (!expected || isBlocked(msg.from)) return;
      expectedHostRef.current = null;
      clearTimer('go');
      clearTimer('outgoing');
      const { convoy: c, actions: a } = live.current;
      setProximityState({ busy: `Joining ${msg.fromName}…`, incoming: null, outgoing: null });
      try {
        if (msg.kind === 'merge') {
          if (!c.id || !c.code || !c.isLeader || !msg.mergeId) return;
          const record: MergeRecord = {
            mergeId: msg.mergeId,
            role: 'guest-leader',
            hostConvoyId: msg.convoyId,
            hostLeaderId: msg.from,
            hostName: msg.fromName,
            homeConvoyId: c.id,
            homeCode: c.code,
            homeLeaderId: uid,
            homeName: live.current.name,
          };
          setProximityState({ merge: record });
          // Bring my riders along first, while I'm still their leader.
          await a.announceMerge(record, msg.code);
          await a.leaveConvoy(true);
          await finishJoin(msg.code, `${msg.fromName}'s convoy`);
        } else {
          if (c.id) await a.leaveConvoy(false);
          await finishJoin(msg.code, msg.fromName);
        }
      } finally {
        setProximityState({ busy: null });
      }
    }
  };

  const handleRef = useRef(handleMessage);
  handleRef.current = handleMessage;
  const rebuildRef = useRef(rebuild);
  rebuildRef.current = rebuild;

  // ── channel lifecycle: keep the 3×3 block subscribed as the rider moves ────
  useEffect(() => {
    const wanted = new Set(cellsKey ? cellsKey.split(',') : []);
    const channels = channelsRef.current;

    channels.forEach((ch, key) => {
      if (!wanted.has(key)) {
        supabase.removeChannel(ch);
        channels.delete(key);
        if (trackedCellRef.current === key) trackedCellRef.current = null;
      }
    });

    wanted.forEach((key) => {
      if (channels.has(key)) return;
      const ch = supabase.channel(`prox:${key}`, { config: { presence: { key: live.current.userId ?? 'anon' } } });
      ch.on('presence', { event: 'sync' }, () => rebuildRef.current())
        .on('broadcast', { event: 'prox' }, ({ payload }) => void handleRef.current(payload as ProxMessage))
        .subscribe();
      channels.set(key, ch);
    });

    if (wanted.size === 0) {
      setProximityState({ riders: [], parties: [] });
      closeSinceRef.current.clear();
    }
  }, [cellsKey]);

  // Announce in my own cell; re-announce on move / convoy change / heartbeat.
  const ownCellRef = useRef(ownCell);
  ownCellRef.current = ownCell;
  const tick = () => {
    const cell = ownCellRef.current;
    const channels = channelsRef.current;
    const ch = cell ? channels.get(cell) : null;
    const b = beacon();
    if (!cell || !ch || !b) return;
    if (trackedCellRef.current && trackedCellRef.current !== cell) {
      void channels.get(trackedCellRef.current)?.untrack();
      trackedCellRef.current = null;
    }
    const convoyKey = `${b.convoyId}:${b.memberCount}:${b.isLeader}`;
    const last = lastTrackRef.current;
    const fresh =
      trackedCellRef.current === cell &&
      last &&
      last.convoyKey === convoyKey &&
      distanceM(last, b) < RETRACK_MOVE_M &&
      Date.now() - last.at < RETRACK_MS;
    if (fresh) return;
    void ch.track(b).then((res) => {
      if (res === 'ok') {
        trackedCellRef.current = cell;
        lastTrackRef.current = { at: b.at, lat: b.lat, lng: b.lng, convoyKey };
      }
    });
  };
  const tickRef = useRef(tick);
  tickRef.current = tick;

  // Heartbeat, independent of GPS updates so the dwell timer always advances.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      tickRef.current();
      rebuildRef.current();
    }, 5_000);
    return () => clearInterval(id);
  }, [enabled]);

  // React promptly to my own movement / convoy changes.
  useEffect(() => {
    if (!enabled) return;
    tickRef.current();
    rebuildRef.current();
  }, [enabled, ownCell, position?.lat, position?.lng, convoy.id, convoy.members.length, convoy.isLeader]);

  // Full teardown when disabled / unmounted.
  useEffect(() => {
    setProximityState({ active: enabled });
    if (enabled) return;
    const channels = channelsRef.current;
    channels.forEach((ch) => supabase.removeChannel(ch));
    channels.clear();
    trackedCellRef.current = null;
    lastTrackRef.current = null;
    setProximityState({ riders: [], parties: [], incoming: null, outgoing: null, busy: null });
  }, [enabled]);

  useEffect(() => {
    const channels = channelsRef.current;
    const timers = timersRef.current;
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
      channels.clear();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      setProximityState({ active: false, riders: [], parties: [], incoming: null, outgoing: null, busy: null });
    };
  }, []);

  // ── actions for the prompt UI ─────────────────────────────────────────────
  useEffect(() => {
    registerProximityControls({
      invite: (party: NearbyParty) => {
        const { userId: uid, name: myName, convoy: c } = live.current;
        const st = getProximityState();
        if (!uid || st.busy || st.outgoing) return;
        const inConvoy = !!c.id;
        if (inConvoy && !c.isLeader) return;
        if (party.kind === 'convoy' && !party.contact) {
          toast.error("Their leader isn't in range");
          return;
        }
        const kind: InviteKind = !inConvoy && party.kind === 'solo' ? 'pair' : inConvoy && party.kind === 'convoy' ? 'merge' : 'join';
        const total = (inConvoy ? c.members.length : 1) + party.memberCount;
        if (total > MAX_MERGED_RIDERS) {
          toast.error(`Too many riders to ride as one convoy (${total}/${MAX_MERGED_RIDERS})`);
          return;
        }
        // They already asked us: just accept.
        if (st.incoming?.fromId === party.contactId) {
          getControlsAccept();
          return;
        }
        const invite: Invite = {
          id: crypto.randomUUID(),
          kind,
          fromId: uid,
          fromName: myName || 'Rider',
          toId: party.contactId,
          fromConvoyId: c.id,
          fromMemberCount: inConvoy ? c.members.length : 1,
          sentAt: Date.now(),
        };
        if (!send({ type: 'invite', to: party.contactId, invite })) {
          toast.error('Still connecting to nearby riders');
          return;
        }
        setProximityState({ outgoing: { ...invite, toName: party.contactName } });
        setTimer('outgoing', INVITE_TTL_MS, () => {
          const out = getProximityState().outgoing;
          if (out?.id === invite.id) {
            setProximityState({ outgoing: null });
            toast(`No answer from ${party.contactName}`);
          }
        });
      },
      cancelInvite: () => {
        const out = getProximityState().outgoing;
        if (!out || !live.current.userId) return;
        clearTimer('outgoing');
        send({ type: 'cancel', to: out.toId, from: live.current.userId, inviteId: out.id });
        setProximityState({ outgoing: null });
      },
      accept: () => getControlsAccept(),
      decline: () => {
        const inv = getProximityState().incoming;
        if (!inv || !live.current.userId) return;
        clearTimer('incoming');
        send({ type: 'answer', to: inv.fromId, from: live.current.userId, inviteId: inv.id, accept: false });
        setProximityState({ incoming: null });
      },
    });

    function getControlsAccept() {
      const inv = getProximityState().incoming;
      const uid = live.current.userId;
      if (!inv || !uid) return;
      clearTimer('incoming');
      if (iAmHost(inv.kind, inv.fromId, inv.fromMemberCount, false)) {
        void runHost(inv.kind, inv.id, inv.fromId, inv.fromName);
      } else {
        send({ type: 'answer', to: inv.fromId, from: uid, inviteId: inv.id, accept: true });
        awaitGo(inv.fromId, inv.fromName);
      }
    }
  });
}
