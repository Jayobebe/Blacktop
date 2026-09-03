import { useState } from 'react';
import { Plus, Wrench, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Bike, DEFAULT_MAINT_TEMPLATES } from '../types';
import { dueItems, serviceStatus } from '../lib/serviceReminders';
import { useGarage } from '../hooks/useGarage';
import { useSettings } from '@/features/settings';
import { getDistanceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  bike: Bike;
  odometerKm: number;
}

const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.60934;

export function MaintenanceList({ bike, odometerKm }: Props) {
  const { addMaintItem, updateMaintItem, deleteMaintItem } = useGarage();
  const { settings } = useSettings();
  const isMiles = settings.distanceUnit === 'miles';
  const unitLabel = getDistanceLabel(settings.distanceUnit);

  const toDisplay = (km: number) => (isMiles ? km * KM_TO_MI : km);
  const toKm = (display: number) => (isMiles ? display * MI_TO_KM : display);
  const fmt = (km: number) => {
    const v = toDisplay(km);
    return v < 10 ? v.toFixed(1) : Math.round(v).toString();
  };

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  // interval stored in the user's display unit while editing
  const [interval, setInterval] = useState<number>(Math.round(toDisplay(5000)));
  const [months, setMonths] = useState<number>(0);

  const presetClick = (tplName: string, km: number) => {
    setName(tplName);
    setInterval(Math.round(toDisplay(km)));
  };

  const submit = () => {
    if (!name.trim() || !interval) return;
    addMaintItem(bike.id, {
      name: name.trim(),
      intervalKm: toKm(interval),
      lastServiceKm: odometerKm,
      intervalMonths: months > 0 ? months : undefined,
      lastServiceAt: Date.now(),
    });
    setName('');
    setInterval(Math.round(toDisplay(5000)));
    setMonths(0);
    setOpen(false);
  };

  const due = dueItems(bike.maintenance, odometerKm);

  return (
    <div className="space-y-2">
      {due.length > 0 && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-xl border px-3 py-2',
            due[0].status.tone === 'over'
              ? 'border-destructive/40 bg-destructive/10'
              : 'border-warning/40 bg-warning/10',
          )}
        >
          <Wrench className={cn('w-4 h-4 mt-0.5 flex-shrink-0', due[0].status.tone === 'over' ? 'text-destructive' : 'text-warning')} />
          <p className="text-xs">
            <span className="font-semibold">
              {due.length === 1 ? `${due[0].item.name} ` : `${due.length} services `}
            </span>
            {due[0].status.tone === 'over' ? 'overdue' : 'due soon'}
            <span className="text-muted-foreground"> · {due.map((d) => d.item.name).slice(0, 3).join(', ')}</span>
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Maintenance</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add maintenance item</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_MAINT_TEMPLATES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => presetClick(t.name, t.intervalKm)}
                    className="pill hover:bg-accent/10 hover:border-accent/30"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Part name (e.g. Chain)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div>
                <label className="text-xs text-muted-foreground">Service interval ({unitLabel})</label>
                <Input
                  type="number"
                  min={isMiles ? 30 : 50}
                  step={isMiles ? 50 : 50}
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Or every … months (optional — whichever comes first)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={months || ''}
                  placeholder="e.g. 12"
                  onChange={(e) => setMonths(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Starts counting from your current odometer ({fmt(odometerKm)} {unitLabel}).
              </p>
              <Button onClick={submit} disabled={!name.trim() || !interval} className="w-full">
                Add item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {bike.maintenance.length === 0 ? (
        <div className="bg-card/40 border border-dashed border-border/40 rounded-2xl p-6 text-center text-sm text-muted-foreground">
          <Wrench className="w-5 h-5 mx-auto mb-2 opacity-60" />
          No parts tracked yet. Add chain, oil, tyres…
        </div>
      ) : (
        <ul className="space-y-2">
          {bike.maintenance.map((item) => {
            const { dueInKm, dueInDays, pct, tone, reason } = serviceStatus(item, odometerKm);
            return (
              <li key={item.id} className="bg-card/60 border border-border/30 rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{item.name}</p>
                    <p className={cn(
                      'text-xs',
                      tone === 'ok' && 'text-muted-foreground',
                      tone === 'warn' && 'text-warning',
                      tone === 'over' && 'text-destructive',
                    )}>
                      {reason === 'time' && dueInDays !== null
                        ? dueInDays > 0
                          ? `Due in ${dueInDays} day${dueInDays === 1 ? '' : 's'}`
                          : `Overdue by ${-dueInDays} day${dueInDays === -1 ? '' : 's'}`
                        : dueInKm > 0
                          ? `Due in ${fmt(dueInKm)} ${unitLabel}`
                          : `Overdue by ${fmt(-dueInKm)} ${unitLabel}`}
                      <span className="text-muted-foreground">
                        {' '}· every {fmt(item.intervalKm)} {unitLabel}
                        {item.intervalMonths ? ` / ${item.intervalMonths} mo` : ''}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs gap-1"
                      onClick={() =>
                        updateMaintItem(bike.id, item.id, {
                          lastServiceKm: odometerKm,
                          lastServiceAt: Date.now(),
                        })
                      }
                    >
                      <Check className="w-3.5 h-3.5" /> Serviced
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMaintItem(bike.id, item.id)}
                      aria-label="Delete part"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      tone === 'ok' && 'bg-accent',
                      tone === 'warn' && 'bg-warning',
                      tone === 'over' && 'bg-destructive',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
