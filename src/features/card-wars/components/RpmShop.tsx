import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { tr } from '@/lib/i18n';
import { BANK_CARDS, BANK_INFO, SPECS } from '../lib/catalog';
import { buyCard, refreshShop, useShop } from '../lib/shop';
import { BattleCard } from './BattleCard';
import type { CardBank } from '../types';

const BANKS: CardBank[] = ['gtlm', 'f1', 'tt', 'motogp'];

export function RpmShop({ open, onClose, disabled }: { open: boolean; onClose: () => void; disabled?: boolean }) {
 const shop = useShop();
 const [bank, setBank] = useState<CardBank>('gtlm');
 const [busy, setBusy] = useState<string | null>(null);
 useEffect(() => { if (open) void refreshShop(); }, [open]);
 async function buy(id: string, name: string) {
  setBusy(id);
  const err = await buyCard(id);
  setBusy(null);
  if (!err) toast.success(tr('Added {0} to your vault', [name]));
  else if (err !== 'demo') toast.error(err.includes('RPM') ? tr('Not enough RPM') : tr('Could not buy this card'));
 }
 const cards = BANK_CARDS.filter(c => c.bank === bank);
 return <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
  <DialogContent className="cw-battle-menu rounded-lg max-h-[90dvh] flex flex-col" aria-describedby={undefined}>
   <DialogTitle className="flex justify-between items-center pr-8"><span>{tr('RPM shop')}</span><span className="font-mono text-accent">{shop.balance ?? '—'} RPM</span></DialogTitle>
   <div role="tablist" className="grid grid-cols-4 gap-1">
    {BANKS.map(b => <Button key={b} role="tab" aria-selected={bank === b} size="sm" variant={bank === b ? 'default' : 'outline'} className="text-xs px-1" onClick={() => setBank(b)}>{BANK_INFO[b].label}</Button>)}
   </div>
   <p className="text-xs text-muted-foreground">{tr('{0} RPM each · win RPM in player battles', [BANK_INFO[bank].price])}</p>
   <div className="grid grid-cols-2 gap-3 overflow-y-auto min-h-0 pb-2">
    {cards.map(c => {
     const owned = shop.owned.includes(c.id); const s = SPECS[c.id];
     return <div key={c.id} className="space-y-1">
      <BattleCard card={c} readOnly />
      <p className="text-[11px] text-muted-foreground font-mono">{s.year} · {s.hp} hp · {s.kg} kg · {s.vmaxKmh} km/h</p>
      <Button size="sm" className="w-full" disabled={owned || disabled || busy !== null || (shop.balance ?? 0) < (c.price ?? 0)} onClick={() => void buy(c.id, c.name)}>
       {owned ? tr('Owned') : tr('{0} RPM', [c.price ?? 0])}
      </Button>
     </div>;
    })}
   </div>
  </DialogContent>
 </Dialog>;
}
