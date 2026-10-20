import { useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { kmText } from '@/lib/units';
import { demoBlocked } from '@/lib/demoGuard';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useGarage, type Bike, type MaintItem } from '@/features/garage';

/**
 * Done on a service due (the Console's vehicle card, a service reminder): asks
 * first whether the part really has been serviced or replaced, since yes
 * starts its count again from the odometer as it stands.
 */
export function ServiceDoneButton({ bike, item, odometerKm, onDone, className }: { bike: Bike; item: MaintItem; odometerKm: number; onDone?: () => void; className?: string }) {
  const { updateMaintItem } = useGarage();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptics.tick();
          setAsking(true);
        }}
        className={cn('pressable shrink-0 h-9 px-3 rounded-xl text-xs font-semibold bg-accent text-accent-foreground inline-flex items-center gap-1', className)}
      >
        <Check className="w-3.5 h-3.5" /> {tr("Done")}
      </button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Has {0} been serviced or replaced?", [item.name])}</AlertDialogTitle>
            <AlertDialogDescription>{tr("Yes starts its count again from {0} on {1}.", [kmText(odometerKm), bike.name])}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("No")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (demoBlocked()) return;
                updateMaintItem(bike.id, item.id, { lastServiceKm: odometerKm, lastServiceAt: Date.now() });
                toast.success(tr("{0} marked as done", [item.name]));
                onDone?.();
              }}
            >
              {tr("Yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
