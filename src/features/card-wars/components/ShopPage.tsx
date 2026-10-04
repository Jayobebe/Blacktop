import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Dices } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';
import { CATALOG, SHOP_CATEGORIES, SPECS, categoryOf, spinCost, type ShopCategory } from '../lib/catalog';
import { buyCard, refreshShop, spin, useShop, type SpinResult } from '../lib/shop';
import { BattleCard } from './BattleCard';
import { SpinReel } from './SpinReel';

export function spinLabel(r: SpinResult): string {
 if (r.kind === 'card') return CATALOG.find(c => c.id === r.card)?.name ?? tr('New card');
 if (r.kind === 'duplicate') return tr('Duplicate · +{0} RPM', [r.rpm]);
 if (r.kind === 'rpm') return tr('+{0} RPM', [r.rpm]);
 return r.spins === 1 ? tr('+1 spin') : tr('+{0} spins', [r.spins]);
}
export const REEL_LABELS = [tr('Card'), tr('RPM'), tr('+1 spin'), tr('RPM'), tr('Card')];

/** Full-screen shop: pick a category, buy a card outright or spin the wheel for it. */
export function ShopPage({ onBack, disabled }: { onBack: () => void; disabled?: boolean }) {
 const shop = useShop();
 const [cat, setCat] = useState<ShopCategory | null>(null);
 const [busy, setBusy] = useState(false);
 const [result, setResult] = useState<SpinResult | null>(null);
 useEffect(() => { void refreshShop(); }, []);
 const info = SHOP_CATEGORIES.find(c => c.id === cat);
 const bonus = cat ? shop.spins[cat] ?? 0 : 0;
 const done = useCallback(() => {
  setBusy(false);
  setResult(r => { if (r) toast.success(spinLabel(r)); return r; });
 }, []);
 async function doSpin() {
  if (!cat || busy) return;
  setBusy(true); setResult(null);
  const r = await spin(cat);
  if (typeof r === 'string') { setBusy(false); if (r !== 'demo') toast.error(r.includes('RPM') ? tr('Not enough RPM') : tr('Spin failed')); return; }
  setResult(r);
 }
 async function buy(id: string, name: string) {
  setBusy(true);
  const err = await buyCard(id);
  setBusy(false);
  if (!err) toast.success(tr('Added {0} to your vault', [name]));
  else if (err !== 'demo') toast.error(err.includes('RPM') ? tr('Not enough RPM') : tr('Could not buy this card'));
 }
 return <div className="flex flex-col min-h-0 h-full gap-3">
  <div className="flex items-center gap-2">
   <Button variant="outline" size="icon" aria-label={tr('Back')} disabled={busy} onClick={() => cat ? (setCat(null), setResult(null)) : onBack()}><ArrowLeft className="w-4 h-4" /></Button>
   <h2 className="text-xl font-semibold flex-1">{cat ? tr(info!.label) : tr('Shop')}</h2>
   <span className="font-mono text-accent">{shop.balance ?? '—'} RPM</span>
  </div>
  {!cat && <>
   <p className="text-sm text-muted-foreground">{tr('Earn RPM in battles. Player wins pay the most.')}</p>
   <div className="grid grid-cols-2 gap-3">
    {SHOP_CATEGORIES.map(c => <Button key={c.id} variant="outline" className="h-auto py-4 flex-col items-start gap-1" onClick={() => setCat(c.id)}>
     <span className="font-semibold">{tr(c.label)}</span>
     <span className="text-xs text-muted-foreground">{tr('Cards {0} RPM · spin {1} RPM', [c.price, spinCost(c.price)])}</span>
     {(shop.spins[c.id] ?? 0) > 0 && <span className="text-xs text-accent">{tr('{0} bonus spins', [shop.spins[c.id]!])}</span>}
    </Button>)}
   </div>
  </>}
  {cat && info && <>
   <div className="rounded-lg border border-border p-3 space-y-2 bg-card">
    <p className="text-sm">{tr('Wheel spin · win a card, RPM or more spins')}</p>
    {result || busy ? <SpinReel key={result ? JSON.stringify(result) : 'wait'} result={result ? spinLabel(result) : '…'} labels={REEL_LABELS} onDone={result ? done : () => undefined} /> : null}
    <Button className="w-full" disabled={busy || disabled || (bonus === 0 && (shop.balance ?? 0) < spinCost(info.price))} onClick={() => void doSpin()}>
     <Dices className="w-4 h-4 mr-2" />{bonus > 0 ? tr('Spin · {0} bonus left', [bonus]) : tr('Spin · {0} RPM', [spinCost(info.price)])}
    </Button>
   </div>
   <div className="grid grid-cols-2 gap-3 overflow-y-auto min-h-0 pb-4">
    {CATALOG.filter(c => categoryOf(c) === cat).map(c => {
     const owned = shop.owned.includes(c.id); const s = SPECS[c.id];
     return <div key={c.id} className="space-y-1">
      <BattleCard card={c} readOnly />
      <p className="text-[11px] text-muted-foreground font-mono">{s.year} · {s.hp} hp · {s.kg} kg · {s.vmaxKmh} km/h</p>
      <Button size="sm" className="w-full" disabled={owned || disabled || busy || (shop.balance ?? 0) < info.price} onClick={() => void buy(c.id, c.name)}>
       {owned ? tr('Owned') : tr('{0} RPM', [info.price])}
      </Button>
     </div>;
    })}
   </div>
  </>}
 </div>;
}
