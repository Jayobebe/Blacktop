import { useState } from 'react';
import { Check, LogOut, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { leaveCrew, MAX_CREWS, renameCrew, setActiveCrew, useCrew, type CrewEntry } from './useCrew';

/**
 * The rider's crews (up to MAX_CREWS, their own first), on Crew QR in
 * Blacktop World: tap one to make it active (the crew screens and this QR
 * follow it), rename any (the name is theirs, shown on crew notifications),
 * leave any but their own.
 */
export function CrewList() {
  const crew = useCrew();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [leaving, setLeaving] = useState<CrewEntry | null>(null);
  const full = crew.crews.length >= MAX_CREWS;

  const startEdit = (c: CrewEntry) => {
    setEditing(c.code);
    setDraft(c.name);
  };
  const saveEdit = () => {
    if (editing) renameCrew(editing, draft);
    setEditing(null);
  };

  return (
    <div className="text-left">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{tr("Your crews")}</p>
        <p className="text-[10px] tabular-nums text-muted-foreground">{tr("{0} of {1} crew slots used", [crew.crews.length, MAX_CREWS])}</p>
      </div>
      <ul className="space-y-1.5">
        {crew.crews.map((c) => {
          const active = c.code === crew.code;
          return (
            <li
              key={c.code}
              className={cn('flex items-center gap-2 rounded-xl border px-3 py-2', active ? 'border-accent bg-accent/10' : 'border-border/40 bg-background/40')}
            >
              {editing === c.code ? (
                <form
                  className="flex-1 flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit();
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    maxLength={30}
                    onChange={(e) => setDraft(e.target.value)}
                    className="flex-1 min-w-0 h-9 rounded-lg bg-background border border-border px-2 text-sm"
                    aria-label={tr("Crew name")}
                  />
                  <button type="submit" className="glove-hit w-9 h-9 rounded-lg flex items-center justify-center text-accent" aria-label={tr("Save name")}>
                    <Check className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="glove-hit w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground" aria-label={tr("Cancel")}>
                    <X className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (active) return;
                      haptics.tick();
                      setActiveCrew(c.code);
                      toast.success(tr("Switched to {0}", [c.name]));
                    }}
                    className="flex-1 min-w-0 text-left min-h-[44px] flex flex-col justify-center"
                    aria-pressed={active}
                  >
                    <span className="text-sm font-semibold truncate">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {c.code}
                      {c.own ? ` · ${tr("Your own crew")}` : ''}
                      {active ? ` · ${tr("Active")}` : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="glove-hit w-9 h-9 rounded-lg flex items-center justify-center text-accent hover:bg-accent/10"
                    aria-label={tr("Rename {0}", [c.name])}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {!c.own && (
                    <button
                      type="button"
                      onClick={() => setLeaving(c)}
                      className="glove-hit w-9 h-9 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10"
                      aria-label={tr("Leave {0}", [c.name])}
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {full && <p className="mt-2 text-[11px] text-warning">{tr("All crew slots full. Leave a crew to join another.")}</p>}

      <AlertDialog open={!!leaving} onOpenChange={(open) => !open && setLeaving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Leave {0}?", [leaving?.name ?? ''])}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("You'll come off its boards and stop getting its notifications. You can join again by scanning its QR.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!leaving) return;
                leaveCrew(leaving.code);
                toast.success(tr("Left {0}", [leaving.name]));
                setLeaving(null);
              }}
            >
              {tr("Leave crew")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
