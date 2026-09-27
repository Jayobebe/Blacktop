import { useEffect, useState } from 'react';
import { Users, UserPlus, Merge, Loader2, Ban, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatDistance, getDistanceLabel } from '@/lib/format';
import { useSettings } from '@/features/settings';
import type { ConvoyState } from '@/types/convoy';
import { DWELL_MS } from '../lib/geo';
import { blockRider, isSnoozed, snoozeParty, unblockRider, useProximityState } from '../lib/proximityStore';
import { MAX_MERGED_RIDERS, getProximityControls } from '../lib/controls';
import type { NearbyParty } from '../types';

const M_TO_MI = 1 / 1609.344;
const INVITE_TTL_S = 45;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto rounded-2xl border border-accent/50 bg-card/95 shadow-2xl backdrop-blur px-4 py-3 animate-slide-up">
      {children}
    </div>
  );
}

/**
 * Nearby-rider prompts, pinned to the top of the screen above the map:
 * a rider/convoy close by, an invite to answer, a pending invite, or a
 * handshake in progress. One at a time, never stacked.
 */
export function ProximityPrompts({ convoy }: { convoy: ConvoyState }) {
  const st = useProximityState();
  const { settings } = useSettings();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!st.active && !st.incoming && !st.busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [st.active, st.incoming, st.busy]);

  const controls = getProximityControls();
  // Riders this close are feet/metres apart, not tenths of a mile.
  const dist = (m: number) => {
    if (settings.distanceUnit === 'km') return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
    const mi = m * M_TO_MI;
    return mi < 0.1 ? `${Math.max(50, Math.round((m * 3.28084) / 50) * 50)} ft` : `${formatDistance(mi, 'miles')} ${getDistanceLabel('miles')}`;
  };
  const inConvoy = !!convoy.id;
  const canAct = !inConvoy || convoy.isLeader;
  const myCount = inConvoy ? convoy.members.length : 1;

  let content: React.ReactNode = null;

  if (st.busy) {
    content = (
      <Card>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          {st.busy}
        </p>
      </Card>
    );
  } else if (st.incoming) {
    const inv = st.incoming;
    const left = Math.min(INVITE_TTL_S, Math.max(0, INVITE_TTL_S - Math.floor((now - inv.sentAt) / 1000)));
    const title =
      inv.kind === 'pair'
        ? `${inv.fromName} wants to ride together`
        : inv.kind === 'merge'
          ? `${inv.fromName}'s convoy wants to merge`
          : inConvoy
            ? `${inv.fromName} wants to join your convoy`
            : `${inv.fromName} invites you to their convoy`;
    const sub =
      inv.kind === 'pair'
        ? "You'll both join a new convoy with voice."
        : inv.kind === 'merge'
          ? `${inv.fromMemberCount + myCount} riders as one convoy. Either leader can unmerge.`
          : inConvoy
            ? 'They ride with your convoy and join voice.'
            : `${inv.fromMemberCount} riders. You'll join their voice.`;
    content = (
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
            {inv.kind === 'merge' ? <Merge className="w-4 h-4 text-accent" /> : <Users className="w-4 h-4 text-accent" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{left}s</span>
        </div>
        <div className="flex gap-2 mt-3">
          <Button className="flex-1 h-10" onClick={() => controls?.accept()}>
            {inv.kind === 'merge' ? 'Merge' : 'Ride together'}
          </Button>
          <Button variant="secondary" className="h-10" onClick={() => controls?.decline()}>
            Not now
          </Button>
        </div>
      </Card>
    );
  } else if (st.outgoing) {
    content = (
      <Card>
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-accent flex-shrink-0" />
          <p className="flex-1 text-sm">Waiting for {st.outgoing.toName}…</p>
          <button
            onClick={() => controls?.cancelInvite()}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1"
          >
            Cancel
          </button>
        </div>
      </Card>
    );
  } else if (st.active && canAct) {
    const party = st.parties.find(
      (p: NearbyParty) =>
        p.closeSince !== null &&
        now - p.closeSince >= DWELL_MS &&
        !isSnoozed(p.key) &&
        (p.kind === 'solo' || p.contact) &&
        myCount + p.memberCount <= MAX_MERGED_RIDERS,
    );
    if (party) {
      const isMerge = inConvoy && party.kind === 'convoy';
      const title =
        party.kind === 'convoy'
          ? `${party.contactName}'s convoy is riding near you`
          : `${party.contactName} is riding near you`;
      const sub = `${dist(party.distanceM)} away${party.kind === 'convoy' ? ` · ${party.memberCount} riders` : ''}`;
      const cta = isMerge ? 'Merge convoys' : party.kind === 'convoy' ? 'Ask to join' : inConvoy ? 'Invite' : 'Ride together';
      content = (
        <Card>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
              {isMerge ? <Merge className="w-4 h-4 text-accent" /> : <UserPlus className="w-4 h-4 text-accent" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
            <button
              onClick={() => {
                blockRider(party.contactId);
                toast(`${party.contactName} blocked`, {
                  description: "You won't see or hear from them.",
                  action: {
                    label: 'Undo',
                    onClick: () => unblockRider(party.contactId),
                  },
                });
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label={`Block ${party.contactName}`}
              title="Block"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <Button className="flex-1 h-10" onClick={() => controls?.invite(party)}>
              {cta}
            </Button>
            <Button variant="secondary" className="h-10" onClick={() => snoozeParty(party.key)}>
              Not now
            </Button>
          </div>
        </Card>
      );
    }
  }

  if (!content) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[70] pointer-events-none flex justify-center px-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-md">{content}</div>
    </div>
  );
}

/** Small "merged" strip with Unmerge for either leader (info only for other riders). */
export function MergeBadge({ convoy, onUnmerge }: { convoy: ConvoyState; onUnmerge: () => void }) {
  const st = useProximityState();
  const record = st.merge;
  if (!record || convoy.id !== record.hostConvoyId) return null;
  const other = record.role === 'host' ? record.homeName : record.hostName;
  const canUnmerge = record.role === 'host' || record.role === 'guest-leader';
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/95 border border-accent/40 shadow-lg backdrop-blur text-xs">
      <Merge className="w-3.5 h-3.5 text-accent flex-shrink-0" />
      <p className="flex-1 truncate">Merged with {other}'s convoy</p>
      {canUnmerge && (
        <button
          onClick={onUnmerge}
          disabled={!!st.busy}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted hover:bg-secondary font-medium disabled:opacity-50"
        >
          <X className="w-3 h-3" />
          Unmerge
        </button>
      )}
    </div>
  );
}
