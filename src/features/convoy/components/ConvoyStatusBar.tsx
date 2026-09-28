import { useEffect, useMemo, useState } from 'react';
import { Users, Gauge, Flag, AlertTriangle, Send, X } from 'lucide-react';
import type { ConvoyMemberInfo } from '@/types/convoy';
import { formatSpeed, getSpeedLabel } from '@/lib/format';
import type { SpeedUnit } from '@/features/settings';
import { cn } from '@/lib/utils';
import { computeConvoyStatus } from '../lib/convoyStatus';
import { describeRegroup, sendRegroup } from '../lib/regroup';
import { tr } from '@/lib/i18n';

interface ConvoyStatusBarProps {
  members: ConvoyMemberInfo[];
  myUserId: string | null;
  myName: string;
  isLeader: boolean;
  myLocation: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  /** This rider's routed time to the destination, in seconds. */
  routeSeconds: number | null;
  speedUnit: SpeedUnit;
}

function formatClock(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Always-on convoy strip for the map: rider count, group average speed, group
 * ETA (when the last rider arrives) and a warning when riders drop back. The
 * leader also gets a regroup card with a one-tap "Send to convoy".
 */
export function ConvoyStatusBar({
  members,
  myUserId,
  myName,
  isLeader,
  myLocation,
  destination,
  routeSeconds,
  speedUnit,
}: ConvoyStatusBarProps) {
  const status = useMemo(
    () => computeConvoyStatus(members, { myUserId, myLocation, destination, routeSeconds }),
    [members, myUserId, myLocation, destination, routeSeconds],
  );

  const behindCount = status.behind.length;
  const behindNames = status.behind.map((m) => m.name);

  // The regroup card hides once dismissed and comes back only if more riders
  // drop behind than when it was dismissed.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  useEffect(() => {
    if (behindCount === 0) setDismissedAt(null);
  }, [behindCount]);
  const showRegroup = isLeader && behindCount > 0 && (dismissedAt === null || behindCount > dismissedAt);

  return (
    <div className="space-y-1.5 animate-slide-up">
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-xl whitespace-nowrap overflow-hidden bg-card/95 border border-border shadow-lg backdrop-blur text-xs"
        role="status"
        aria-label={tr("Convoy status")}
      >
        <span className="flex items-center gap-1.5 font-semibold">
          <Users className="w-3.5 h-3.5 text-accent" aria-hidden />
          {status.riderCount}
        </span>
        <span className="flex items-center gap-1.5 font-mono tabular-nums">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          {formatSpeed(status.averageSpeedMph, speedUnit)}
          <span className="text-muted-foreground font-sans">{getSpeedLabel(speedUnit)}</span>
        </span>
        {status.groupEtaSeconds != null && (
          <span className="flex items-center gap-1.5 font-mono tabular-nums">
            <Flag className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground font-sans">{tr("ETA")}</span>
            {formatClock(status.groupEtaSeconds)}
          </span>
        )}
        {behindCount > 0 && (
          <span className="ml-auto flex items-center gap-1 font-semibold text-warning whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5" />
            {behindCount} {behindCount === 1 ? 'rider' : 'riders'}{" "}{tr("behind")}
          </span>
        )}
      </div>

      {showRegroup && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card/95 border border-warning/50 shadow-xl backdrop-blur">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{tr("Regroup?")}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{describeRegroup(behindNames, false)}</p>
          </div>
          <button
            onClick={async () => {
              if (!myUserId) return;
              const sent = await sendRegroup({ fromUserId: myUserId, fromName: myName, behindNames });
              if (sent) setDismissedAt(behindCount);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0',
              'bg-warning/15 text-warning hover:bg-warning/25 transition-colors',
            )}
          >
            <Send className="w-3.5 h-3.5" />
            {tr("Send to convoy")}
          </button>
          <button
            onClick={() => setDismissedAt(behindCount)}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors flex-shrink-0"
            aria-label={tr("Dismiss regroup suggestion")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
