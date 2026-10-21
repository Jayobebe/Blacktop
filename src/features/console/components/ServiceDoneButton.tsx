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
import { addCost, getLedger, ledgerCurrency } from '@/features/garage/lib/ledger';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Done on a service due (the Console's vehicle card, a service reminder): asks
 * first whether the part really has been serviced or replaced, since yes
 * starts its count again from the odometer as it stands. Yes then offers to
 * write what it cost into the logbook's ledger (skippable).
 */
export function ServiceDoneButton({ bike, item, odometerKm, onDone, className }: { bike: Bike; item: MaintItem; odometerKm: number; onDone?: () => void; className?: string }) {
  const { updateMaintItem } = useGarage();
  const [asking, setAsking] = useState(false);
  const [costing, setCosting] = useState(false);
  const [amount, setAmount] = useState('');
  const currency = ledgerCurrency(getLedger());
  const n = parseFloat(amount.replace(',', '.'));
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
                setAmount('');
                setCosting(true);
              }}
            >
              {tr("Yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={costing}
        onOpenChange={(o) => {
          if (o) return;
          setCosting(false);
          onDone?.();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("Add what it cost?")}</DialogTitle>
            <DialogDescription>{tr("It goes into {0}'s logbook, under costs.", [bike.name])}</DialogDescription>
          </DialogHeader>
          <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} inputMode="decimal" placeholder={tr("Amount ({0})", [currency])} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCosting(false);
                onDone?.();
              }}
              className="h-11 rounded-xl"
            >
              {tr("Skip")}
            </Button>
            <Button
              disabled={!(n > 0)}
              onClick={() => {
                if (addCost(bike.id, { at: Date.now(), category: 'service', amount: n, currency, note: item.name })) toast.success(tr("Written into the logbook"));
                setCosting(false);
                onDone?.();
              }}
              className="h-11 rounded-xl font-semibold"
            >
              {tr("Save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
