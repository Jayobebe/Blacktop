import { FileText, Settings2, Video, Mountain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import type { PostRace } from '../lib/postRace';

/** Comma list of what's picked ("Results, 3D flyover"), or "Nothing". */
export function postRaceSummary(p: PostRace): string {
  const on = [p.results && tr("Results"), p.flyover && tr("3D flyover"), p.overlay && tr("Overlay video")].filter(Boolean);
  return on.length ? on.join(' · ') : tr("Nothing");
}

/** The pit crew's choice of post-race telemetry, before timing starts. */
export function PostRaceDialog({
  open,
  trackName,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  trackName?: string;
  value: PostRace;
  onChange: (p: PostRace) => void;
  onClose: () => void;
}) {
  const rows: { key: keyof PostRace; icon: React.ElementType; label: string; text: string; disabled?: boolean }[] = [
    { key: 'results', icon: FileText, label: tr("Results"), text: tr("The whole session comes to your phone at the end: laps, sectors, pit stops, traces and racing lines.") },
    { key: 'flyover', icon: Mountain, label: tr("3D flyover"), text: tr("A 3D pass round the laps plays as soon as the results open, on both phones."), disabled: !value.results },
    { key: 'overlay', icon: Video, label: tr("Overlay video"), text: tr("The racer's phone records a 1080p stats overlay for the session and offers to share it at the end. Uses more battery.") },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("After the session")}</DialogTitle>
          <DialogDescription>
            {trackName ? tr("What do you want from {0}? It's sent to the racer before timing starts.", [trackName]) : tr("What do you want after the session? It's sent to the racer before timing starts.")}
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border/30">
          {rows.map(({ key, icon: Icon, label, text, disabled }) => (
            <label key={key} className={cn('flex items-center gap-3 py-3', disabled ? 'opacity-50' : 'cursor-pointer')}>
              <Icon className="w-5 h-5 text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{text}</p>
              </div>
              <Switch
                checked={value[key] && !disabled}
                disabled={disabled}
                onCheckedChange={(v) => onChange({ ...value, [key]: v, ...(key === 'results' && !v ? { flyover: false } : {}) })}
              />
            </label>
          ))}
        </div>
        <Button className="h-12" onClick={onClose}>{tr("Done")}</Button>
      </DialogContent>
    </Dialog>
  );
}

/** A line showing the choice, tap to change. */
export function PostRaceLine({ value, onClick, className }: { value: PostRace; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('w-full flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3 min-h-12 text-left', className)}>
      <Settings2 className="w-4 h-4 text-accent shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">{tr("After the session")}</span>
        <span className="block text-sm truncate">{postRaceSummary(value)}</span>
      </span>
      <span className="text-xs text-accent">{tr("Change")}</span>
    </button>
  );
}
