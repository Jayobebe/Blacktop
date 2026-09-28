import { useEffect, useState } from 'react';
import { Handshake, Loader2, Merge, Ban, X, Users, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatDistance, getDistanceLabel } from '@/lib/format';
import { useSettings } from '@/features/settings';
import { cn } from '@/lib/utils';
import type { ConvoyState } from '@/types/convoy';
import { blockRider, setProximityState, unblockRider, useProximityState } from '../lib/proximityStore';
import { MAX_MERGED_RIDERS, getProximityControls } from '../lib/controls';
import type { NearbyParty } from '../types';
import { tr } from '@/lib/i18n';

const INVITE_TTL_S = 45;
const M_TO_MI = 1 / 1609.344;

function secondsLeft(sentAt: number, now: number) {
  return Math.min(INVITE_TTL_S, Math.max(0, INVITE_TTL_S - Math.floor((now - sentAt) / 1000)));
}

/**
 * Nearby riders live behind one map button: tap for the list of riders and
 * convoys close by (Invite / Join / Merge on each). A sent request shows its
 * countdown on the button; a received one makes the button pulse and glow
 * with the same countdown, and tapping it opens the request to accept or
 * decline. Only rendered while Nearby Riders is on and the rider is riding.
 */
export function HandshakeButton({
  convoy,
  className,
  placement = 'up',
}: {
  convoy: ConvoyState;
  className?: string;
  /**
   * up: panel stacks above the button. down: panel drops below, positioned
   * against the nearest positioned ancestor (the map's top-left column) so it
   * never runs off-screen when the button sits mid-row.
   */
  placement?: 'up' | 'down';
}) {
  const st = useProximityState();
  const { settings } = useSettings();
  const [now, setNow] = useState(Date.now());

  const ticking = !!(st.incoming || st.outgoing);
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ticking]);

  if (!st.active) return null;

  const controls = getProximityControls();
  const inConvoy = !!convoy.id;
  const canAct = !inConvoy || convoy.isLeader;
  const myCount = inConvoy ? convoy.members.length : 1;

  const dist = (m: number) => {
    if (settings.distanceUnit === 'km') return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
    const mi = m * M_TO_MI;
    return mi < 0.1 ? `${Math.max(50, Math.round((m * 3.28084) / 50) * 50)} ft` : `${formatDistance(mi, 'miles')} ${getDistanceLabel('miles')}`;
  };

  const timerFrom = st.incoming?.sentAt ?? st.outgoing?.sentAt ?? null;
  const left = timerFrom !== null ? secondsLeft(timerFrom, now) : null;
  const progress = left !== null ? left / INVITE_TTL_S : 0;
  const receiving = !!st.incoming;

  const onButton = () => {
    if (st.incoming) setProximityState({ panel: st.panel === 'request' ? null : 'request' });
    else setProximityState({ panel: st.panel === 'list' ? null : 'list' });
  };

  // ── button ─────────────────────────────────────────────────────────────────
  const R = 21;
  const C = 2 * Math.PI * R;
  const button = (
    <button
      onClick={onButton}
      className={cn(
        'relative w-[42px] h-[42px] rounded-full flex items-center justify-center border shadow-lg backdrop-blur transition-colors',
        receiving
          ? 'bg-accent/25 border-accent text-accent animate-pulse shadow-[0_0_18px_hsl(var(--accent)/0.7)]'
          : st.outgoing
            ? 'bg-card/95 border-accent/60 text-accent'
            : 'bg-card/95 border-border text-foreground hover:bg-secondary',
      )}
      aria-label={
        receiving ? tr("Request from {0}, {1}s left", [st.incoming!.fromName, left]) : st.outgoing ? tr("Waiting for {0}", [st.outgoing.toName]) : tr("Nearby riders")
      }
    >
      {st.busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Handshake className="w-5 h-5" />}
      {left !== null && (
        <>
          <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 44 44" aria-hidden>
            <circle
              cx="22"
              cy="22"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold font-mono tabular-nums flex items-center justify-center">
            {left}
          </span>
        </>
      )}
      {left === null && !st.busy && st.parties.length > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
          {st.parties.length}
        </span>
      )}
    </button>
  );

  // ── panels ─────────────────────────────────────────────────────────────────
  let panel: React.ReactNode = null;

  if (st.panel === 'request' && st.incoming) {
    const inv = st.incoming;
    const title =
      inv.kind === 'pair'
        ? `${inv.fromName} wants to ride together`
        : inv.kind === 'merge'
          ? `${inv.fromName}'s convoy wants to merge`
          : inConvoy
            ? `${inv.fromName} wants to join your convoy`
            : `${inv.fromName} invites you to their convoy`;
    const detail =
      inv.kind === 'pair'
        ? "You'll both join a new convoy with voice."
        : inv.kind === 'merge'
          ? `${inv.fromMemberCount} + ${myCount} riders as one convoy. Either leader can unmerge any time.`
          : inConvoy
            ? 'They join your convoy and voice.'
            : `${inv.fromMemberCount} ${inv.fromMemberCount === 1 ? 'rider' : 'riders'}. You'll join their convoy and voice.`;
    panel = (
      <div className="w-72 rounded-2xl border border-accent/60 bg-card/95 shadow-2xl backdrop-blur p-4 animate-slide-up">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
            {inv.kind === 'merge' ? <Merge className="w-4 h-4 text-accent" /> : <Handshake className="w-4 h-4 text-accent" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
          </div>
          <span className="text-[11px] font-mono text-accent tabular-nums">{left}{tr("s")}</span>
        </div>
        <div className="flex gap-2 mt-3">
          <Button className="flex-1 h-10" onClick={() => controls?.accept()}>
            {tr("Accept")}
          </Button>
          <Button variant="secondary" className="flex-1 h-10" onClick={() => controls?.decline()}>
            {tr("Decline")}
          </Button>
        </div>
      </div>
    );
  } else if (st.panel === 'list') {
    const rows = st.parties;
    panel = (
      <div className="w-72 max-h-[50dvh] overflow-y-auto rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur animate-slide-up">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/60">
          <p className="text-sm font-semibold">{tr("Nearby riders")}</p>
          <button
            onClick={() => setProximityState({ panel: null })}
            className="p-1 rounded-lg text-muted-foreground hover:bg-muted"
            aria-label={tr("Close nearby riders")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {st.outgoing && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
            <p className="flex-1">{tr("Waiting for")}{" "}{st.outgoing.toName}… {left}{tr("s")}</p>
            <button onClick={() => controls?.cancelInvite()} className="font-medium text-muted-foreground hover:text-foreground">
              {tr("Cancel")}
            </button>
          </div>
        )}

        {!canAct && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/60">
            {tr("Only your convoy leader can send invites.")}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="px-4 py-5 text-xs text-muted-foreground text-center">
            {tr("No riders nearby yet. Riders with Nearby Riders on show up here when they're within a few km.")}
          </p>
        ) : (
          rows.map((p: NearbyParty) => {
            const isConvoy = p.kind === 'convoy';
            const isMerge = inConvoy && isConvoy;
            const full = myCount + p.memberCount > MAX_MERGED_RIDERS;
            const leaderMissing = isConvoy && !p.contact;
            const label = isMerge ? 'Merge' : isConvoy ? 'Join' : 'Invite';
            const disabledReason = !canAct ? null : leaderMissing ? 'Leader out of range' : full ? 'Too many riders' : null;
            return (
              <div key={p.key} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 last:border-0">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  {isConvoy ? <Users className="w-4 h-4 text-accent" /> : <User className="w-4 h-4 text-accent" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{isConvoy ? tr("{0}'s convoy", [p.contactName]) : p.contactName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dist(p.distanceM)}
                    {isConvoy ? tr(" · {0} riders", [p.memberCount]) : ''}
                    {disabledReason ? ` · ${disabledReason}` : ''}
                  </p>
                </div>
                {canAct && (
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={!!disabledReason || !!st.outgoing || !!st.busy}
                    onClick={() => controls?.invite(p)}
                  >
                    {label}
                  </Button>
                )}
                <button
                  onClick={() => {
                    blockRider(p.contactId);
                    toast(tr("{0} blocked", [p.contactName]), {
                      description: tr("You won't see them or get their requests."),
                      action: { label: tr("Undo"), onClick: () => unblockRider(p.contactId) },
                    });
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                  aria-label={tr("Block {0}", [p.contactName])}
                  title={tr("Block")}
                >
                  <Ban className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    );
  }

  if (placement === 'down') {
    return (
      <>
        <div className={className}>{button}</div>
        {panel && <div className="absolute top-full right-0 mt-2 z-40 max-w-full">{panel}</div>}
      </>
    );
  }
  return (
    <div className={cn('flex flex-col items-end gap-2', className)}>
      {panel}
      {button}
    </div>
  );
}
