import { useState } from 'react';
import { Plus, Wrench, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Bike, DEFAULT_MAINT_TEMPLATES, MaintItem } from '../types';
import { useGarage } from '../hooks/useGarage';
import { cn } from '@/lib/utils';

interface Props {
  bike: Bike;
  odometerKm: number;
}

function statusFor(item: MaintItem, odoKm: number) {
  const dueAt = item.lastServiceKm + item.intervalKm;
  const dueIn = dueAt - odoKm;
  const pct = Math.max(0, Math.min(100, ((item.intervalKm - dueIn) / item.intervalKm) * 100));
  let tone: 'ok' | 'warn' | 'over' = 'ok';
  if (dueIn <= 0) tone = 'over';
  else if (dueIn <= 200) tone = 'warn';
  return { dueIn, dueAt, pct, tone };
}

export function MaintenanceList({ bike, odometerKm }: Props) {
  const { addMaintItem, updateMaintItem, deleteMaintItem } = useGarage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [interval, setInterval] = useState<number>(5000);

  const presetClick = (tplName: string, km: number) => {
    setName(tplName);
    setInterval(km);
  };

  const submit = () => {
    if (!name.trim() || !interval) return;
    addMaintItem(bike.id, {
      name: name.trim(),
      intervalKm: interval,
      lastServiceKm: Math.round(odometerKm),
    });
    setName('');
    setInterval(5000);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
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
                <label className="text-xs text-muted-foreground">Service interval (km)</label>
                <Input
                  type="number"
                  min={50}
                  step={50}
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Starts counting from your current odometer ({Math.round(odometerKm)} km).
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
            const { dueIn, pct, tone } = statusFor(item, odometerKm);
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
                      {dueIn > 0 ? `Due in ${Math.round(dueIn)} km` : `Overdue by ${Math.round(-dueIn)} km`}
                      <span className="text-muted-foreground"> · every {item.intervalKm} km</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs gap-1"
                      onClick={() =>
                        updateMaintItem(bike.id, item.id, { lastServiceKm: Math.round(odometerKm) })
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
