import { useState } from 'react';
import { Receipt, Wrench, Settings2, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SlidingPill } from '@/components/SlidingPill';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { useDemoMode } from '@/lib/demoMode';
import { useSettings } from '@/features/settings';
import type { Bike } from '@/features/garage';
import { compressImageFile } from '@/features/garage/lib/compressImage';
import {
  addCost, addPart, COST_CATEGORIES, costName, CURRENCIES, ledgerCurrency, ledgerSums, moneyText, PART_KINDS, partName, partWear,
  powerOf, setLedgerPrefs, updateVehicleLedger, useLedger, vehicleLedger, type CostCategory, type PartKind, type Power,
} from '@/features/garage/lib/ledger';
import { Page, PageButton, PageTitle, Row, fmtDate } from './BookPage';

type PageFn = (n: number, side: 'l' | 'r') => React.ReactNode;
const COSTS_PER_PAGE = 7;
const PARTS_PER_PAGE = 5;
const KM_PER_MI = 1.609344;
/** How far each kind of part is expected to last until the rider says otherwise, km. */
const DEFAULT_LIFE_KM: Record<PartKind, number | undefined> = { tyre_front: 9000, tyre_rear: 6000, chain: 25000, pads: 15000, battery: undefined, other: undefined };

/**
 * The ledger's pages in the logbook: running costs (cost per mile, spending by
 * kind), costs, and parts with how worn they are, each section ending in its
 * own "write in it" button, plus the forms they open. `start` is where each
 * section's first page sits among these, for the bookmarks. (The fuel log went,
 * 2026-10-26: pausing at a station now only asks its price, for the map.)
 */
export function useLedgerBook(bike: Bike, odometerKm: number): { pages: PageFn[]; start: { ledger: number }; dialogs: React.ReactNode } {
  const ledger = useLedger();
  const { settings } = useSettings();
  const { enabled: demo } = useDemoMode();
  const v = vehicleLedger(ledger, bike.id);
  const power = powerOf(v);
  const currency = ledgerCurrency(ledger);
  const sums = ledgerSums(v, currency);
  const miles = settings.distanceUnit !== 'km';
  const distText = (km: number) => (miles ? tr("{0} mi", [Math.round(km / KM_PER_MI).toLocaleString()]) : tr("{0} km", [Math.round(km).toLocaleString()]));
  const money = (n: number) => moneyText(n, currency);
  const [open, setOpen] = useState<null | 'cost' | 'part' | 'prefs'>(null);
  const [partKind, setPartKind] = useState<PartKind>('tyre_rear');
  const blockedInDemo = () => {
    if (!demo) return false;
    toast(tr("The ledger is read-only in demo mode"));
    return true;
  };
  const openForm = (f: 'cost' | 'part' | 'prefs') => {
    if (f !== 'prefs' && blockedInDemo()) return;
    haptics.tick();
    setOpen(f);
  };

  const pages: PageFn[] = [];

  // Running costs.
  pages.push((n, side) => (
    <Page n={n} side={side}>
      <PageTitle>{tr("Running costs")}</PageTitle>
      <Row label={tr("This month")} value={money(sums.monthSpent)} />
      <Row label={tr("Total spent")} value={money(sums.costSpent)} />
      {sums.byCategory.map((c) => (
        <Row key={c.key} label={costName(c.key)} value={money(c.amount)} />
      ))}
      <PageButton onClick={() => openForm('prefs')}>
        <Settings2 className="w-3 h-3" /> {tr("Ledger settings")}
      </PageButton>
    </Page>
  ));

  // Costs.
  const costs = [...v.costs].reverse();
  const costPages = Math.max(1, Math.ceil(costs.length / COSTS_PER_PAGE));
  for (let i = 0; i < costPages; i++) {
    const slice = costs.slice(i * COSTS_PER_PAGE, (i + 1) * COSTS_PER_PAGE);
    const last = i === costPages - 1;
    pages.push((n, side) => (
      <Page n={n} side={side}>
        <PageTitle>{tr("Costs")}{i > 0 ? ` (${i + 1})` : ''}</PageTitle>
        {slice.length === 0 && <p className="text-[9px] italic text-[#2b2118]/60">{tr("Services, parts, insurance, tax, kit: what it costs beyond fuel.")}</p>}
        <div className="space-y-[3px]">
          {slice.map((c) => (
            <div key={c.id} className="text-[9px] leading-[11px] border-b border-dashed border-[#2b2118]/20 pb-[3px]">
              <div className="flex justify-between gap-1">
                <span className="font-bold truncate">{c.note || costName(c.category)}</span>
                <span className="font-mono">{moneyText(c.amount, c.currency)}</span>
              </div>
              <div className="flex justify-between gap-1 font-mono text-[8px] text-[#2b2118]/65">
                <span>{fmtDate(c.at)} · {costName(c.category)}</span>
                {c.photo && <span>{tr("receipt")}</span>}
              </div>
            </div>
          ))}
        </div>
        {last && (
          <PageButton onClick={() => openForm('cost')}>
            <Receipt className="w-3 h-3" /> {tr("Add a cost")}
          </PageButton>
        )}
      </Page>
    ));
  }

  // Parts: what's fitted (with its wear), then what was replaced.
  const fitted = v.parts.filter((p) => !p.replacedAt);
  const replaced = v.parts.filter((p) => p.replacedAt).sort((a, b) => (b.replacedAt ?? 0) - (a.replacedAt ?? 0));
  const partRows = [...fitted.map((p) => ({ p, old: false })), ...replaced.map((p) => ({ p, old: true }))];
  const partPages = Math.max(1, Math.ceil(partRows.length / PARTS_PER_PAGE));
  for (let i = 0; i < partPages; i++) {
    const slice = partRows.slice(i * PARTS_PER_PAGE, (i + 1) * PARTS_PER_PAGE);
    const last = i === partPages - 1;
    pages.push((n, side) => (
      <Page n={n} side={side}>
        <PageTitle>{tr("Parts")}{i > 0 ? ` (${i + 1})` : ''}</PageTitle>
        {slice.length === 0 && <p className="text-[9px] italic text-[#2b2118]/60">{tr("Tyres, chain, pads, battery: fit them here and see how worn they are.")}</p>}
        <div className="space-y-1.5">
          {slice.map(({ p, old }) => {
            const wear = old ? null : partWear(p, odometerKm);
            return (
              <div key={p.id} className={cn('text-[9px] leading-tight', old && 'opacity-60')}>
                <div className="flex justify-between gap-1">
                  <span className="font-bold truncate">{partName(p.kind)}</span>
                  {!old ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (blockedInDemo()) return;
                        updateVehicleLedger(bike.id, (vl) => ({ ...vl, parts: vl.parts.map((x) => (x.id === p.id ? { ...x, replacedAt: Date.now(), replacedKm: odometerKm } : x)) }));
                        setPartKind(p.kind);
                        toast.success(tr("{0} marked as replaced", [partName(p.kind)]), { action: { label: tr("Fit the new one"), onClick: () => setOpen('part') } });
                      }}
                      className="px-1 rounded-sm border border-[#2b2118]/50 text-[7.5px] font-black uppercase tracking-wider"
                    >
                      {tr("Replace")}
                    </button>
                  ) : (
                    <span className="font-mono text-[8px]">{tr("lasted {0}", [distText((p.replacedKm ?? p.fittedKm) - p.fittedKm)])}</span>
                  )}
                </div>
                <p className="font-mono text-[8px] text-[#2b2118]/65 truncate">{p.name} · {fmtDate(p.fittedAt)}</p>
                {wear !== null && (
                  <div className="mt-0.5 h-1.5 rounded-sm bg-[#2b2118]/15 overflow-hidden" title={`${Math.round(wear * 100)}%`}>
                    <div className={cn('h-full', wear >= 0.9 ? 'bg-[#a3261b]' : wear >= 0.7 ? 'bg-[#a86a12]' : 'bg-[#2f6b2f]')} style={{ width: `${Math.min(100, wear * 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {last && (
          <PageButton onClick={() => openForm('part')}>
            <Wrench className="w-3 h-3" /> {tr("Fit a part")}
          </PageButton>
        )}
      </Page>
    ));
  }

  const dialogs = (
    <>
      {open === 'cost' && <CostDialog bikeId={bike.id} currency={currency} onClose={() => setOpen(null)} />}
      {open === 'part' && <PartDialog bikeId={bike.id} odometerKm={odometerKm} miles={miles} initialKind={partKind} onClose={() => setOpen(null)} />}
      <Dialog open={open === 'prefs'} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("Ledger settings")}</DialogTitle>
            <DialogDescription>{bike.name}</DialogDescription>
          </DialogHeader>
          <PrefsForm bikeId={bike.id} power={power} currency={currency} />
        </DialogContent>
      </Dialog>
    </>
  );

  return { pages, start: { ledger: 0 }, dialogs };
}

function PrefsForm({ bikeId, power, currency }: { bikeId: string; power: Power; currency: string }) {
  const label = 'block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1';
  const write = (fn: () => boolean) => {
    if (!fn()) toast(tr("The ledger is read-only in demo mode"));
  };
  return (
    <div className="space-y-4">
      <div>
        <span className={label}>{tr("Runs on")}</span>
        <div role="radiogroup" className="relative grid grid-cols-3 rounded-xl border border-accent/40 bg-background/60 p-0.5 text-xs">
          <SlidingPill />
          {(['fuel', 'electric', 'none'] as Power[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={power === p}
              onClick={() => write(() => updateVehicleLedger(bikeId, (v) => ({ ...v, power: p })))}
              className={cn('relative z-[1] rounded-lg py-2 font-semibold transition-colors duration-300', power === p ? 'text-accent-foreground' : 'text-accent/80')}
            >
              {p === 'fuel' ? tr("Fuel") : p === 'electric' ? tr("Electric") : tr("Pedals")}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className={label}>{tr("Currency")}</span>
        <select
          value={currency}
          onChange={(e) => write(() => setLedgerPrefs({ currency: e.target.value }))}
          className="w-full h-10 rounded-md bg-background border border-input px-3 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CostDialog({ bikeId, currency, onClose }: { bikeId: string; currency: string; onClose: () => void }) {
  const [category, setCategory] = useState<CostCategory>('service');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const n = parseFloat(amount.replace(',', '.'));
  const save = () => {
    if (!(n > 0)) return;
    const at = new Date(`${date}T12:00:00`).getTime() || Date.now();
    if (addCost(bikeId, { at, category, amount: n, currency, note: note.trim() || undefined, photo })) {
      haptics.success();
      toast.success(tr("Written into the logbook"));
    }
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("Add a cost")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {COST_CATEGORIES.map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={cn('min-h-11 rounded-xl border text-xs font-semibold', category === c ? 'bg-accent text-accent-foreground border-accent' : 'frost-accent bg-card/60 border-border/60')}>
                {costName(c)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} inputMode="decimal" placeholder={tr("Amount ({0})", [currency])} />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 60))} placeholder={tr("What was it? (optional)")} />
          <label className="flex items-center gap-2 text-xs text-accent font-semibold cursor-pointer">
            <PenLine className="w-4 h-4" /> {photo ? tr("Receipt photo added") : tr("Add a photo of the receipt")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(await compressImageFile(f, 900, 0.7).catch(() => undefined));
              }}
            />
          </label>
          <Button onClick={save} disabled={!(n > 0)} className="w-full h-12 rounded-2xl font-semibold">
            {tr("Save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PartDialog({ bikeId, odometerKm, miles, initialKind, onClose }: { bikeId: string; odometerKm: number; miles: boolean; initialKind: PartKind; onClose: () => void }) {
  const [kind, setKind] = useState<PartKind>(initialKind);
  const [name, setName] = useState('');
  const toUser = (km: number) => Math.round(miles ? km / KM_PER_MI : km);
  const [life, setLife] = useState(() => (DEFAULT_LIFE_KM[initialKind] ? String(toUser(DEFAULT_LIFE_KM[initialKind]!)) : ''));
  const save = () => {
    const l = parseFloat(life);
    if (addPart(bikeId, { kind, name: name.trim() || partName(kind), fittedAt: Date.now(), fittedKm: odometerKm, lifeKm: l > 0 ? (miles ? l * KM_PER_MI : l) : undefined })) {
      haptics.success();
      toast.success(tr("Written into the logbook"));
    }
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("Fit a part")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {PART_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  setLife(DEFAULT_LIFE_KM[k] ? String(toUser(DEFAULT_LIFE_KM[k]!)) : '');
                }}
                className={cn('min-h-11 rounded-xl border px-1 text-xs font-semibold leading-tight', kind === k ? 'bg-accent text-accent-foreground border-accent' : 'frost-accent bg-card/60 border-border/60')}
              >
                {partName(k)}
              </button>
            ))}
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} placeholder={tr("Brand and model (optional)")} />
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{miles ? tr("Expect it to last (miles)") : tr("Expect it to last (km)")}</span>
            <Input value={life} onChange={(e) => setLife(e.target.value.replace(/[^\d]/g, '').slice(0, 6))} inputMode="numeric" placeholder={tr("Optional")} />
          </label>
          <p className="text-[11px] text-muted-foreground">{tr("Fitted today, at the odometer as it stands. You're told when it's 90 % worn.")}</p>
          <Button onClick={save} className="w-full h-12 rounded-2xl font-semibold">
            {tr("Save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
