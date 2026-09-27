import { Merge, X } from 'lucide-react';
import type { ConvoyState } from '@/types/convoy';
import { useProximityState } from '../lib/proximityStore';

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
