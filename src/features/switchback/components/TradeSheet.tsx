import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DemoLockNote, useDemoLocked } from '@/components/DemoLock';
import { tr } from '@/lib/i18n';
import { SwapPanel } from './SwapPanel';

/**
 * Trading with another rider: a swap, card for card, each for one of the same
 * tier (`SwapPanel`). Cards used to be sold for RPM by code here too; that let
 * RPM move between accounts and is gone, on the server as well.
 */
export function TradeSheet({ open, onClose, locked }: { open: boolean; onClose: () => void; locked?: boolean }) {
  const demo = useDemoLocked();
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto safe-bottom">
        <div className="max-w-md mx-auto space-y-4">
          <SheetHeader className="text-left">
            <SheetTitle>{tr("Trade cards")}</SheetTitle>
            <SheetDescription>{tr("Swap cards with another rider: card for card, each for one of the same tier.")}</SheetDescription>
          </SheetHeader>
          {demo && <DemoLockNote />}
          {open && <SwapPanel demo={demo} locked={locked} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
