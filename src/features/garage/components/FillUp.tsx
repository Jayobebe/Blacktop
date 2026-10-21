import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Fuel, PlugZap, MapPin, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { useDemoMode } from '@/lib/demoMode';
import { useServerCap } from '@/lib/serverCaps';
import { priceableStation, reportFuelPrice, type PricedFuel } from '@/lib/fuelPrices';
import { searchNearbyPOIs } from '@/features/map/lib/placeSearch';
import { useSettings } from '@/features/settings';
import { useGarage } from '../hooks/useGarage';
import { useBikeStats } from '../hooks/useBikeStats';
import {
  addFill, CHARGES, economyText, FUELS, fuelName, ledgerCurrency, ledgerSums, litresFrom, moneyText, phoneRegion, powerOf,
  getLedger, setLedgerPrefs, useLedger, vehicleLedger, volumeUnit, type Fill, type FuelType, type Station,
} from '../lib/ledger';
import { PixelLoader } from '@/components/PixelLoader';

/** Close enough to a station's mapped point to be at it. */
const AT_STATION_KM = 0.08;
/** Ask again only after this much riding since the last fill-up (or none yet). */
const ASK_AFTER_KM = 40;

/**
 * One fill-up, fuel or charge: the type (remembered per vehicle), how much and
 * what it cost, full or not, at the station the rider is standing on (looked
 * up once, when the form opens). With the server's price sharing in place, the
 * "Help map fuel prices" switch sits right by Save until the rider opts in.
 */
export function FillUpForm({
  bikeId,
  odometerKm,
  at,
  pausedSince,
  manual,
  onSaved,
  onCancel,
}: {
  bikeId: string;
  odometerKm: number;
  at: { lat: number; lng: number } | null;
  pausedSince?: number;
  manual?: boolean;
  onSaved: (f: Fill) => void;
  onCancel: () => void;
}) {
  const ledger = useLedger();
  const v = vehicleLedger(ledger, bikeId);
  const power = powerOf(v);
  const currency = ledgerCurrency(ledger);
  const sharing = useServerCap('fuelPrices');
  const { enabled: demo } = useDemoMode();
  const kinds = power === 'electric' ? CHARGES : FUELS;
  const [fuel, setFuel] = useState<FuelType | null>(v.lastFuel && kinds.includes(v.lastFuel) ? v.lastFuel : null);
  const [amount, setAmount] = useState('');
  const [paid, setPaid] = useState('');
  const { settings } = useSettings();
  const miles = settings.distanceUnit !== 'km';
  // The odometer as the rider reads it (miles or km), kept in km.
  const [odo, setOdo] = useState(String(Math.round(miles ? odometerKm / 1.609344 : odometerKm)));
  const [full, setFull] = useState(true);
  const [station, setStation] = useState<Station | null>(null);
  const [looking, setLooking] = useState(false);
  const [optIn, setOptIn] = useState(false);

  // The station under the rider, if any: one look, when the form opens.
  useEffect(() => {
    if (!at) return;
    let live = true;
    setLooking(true);
    searchNearbyPOIs(power === 'electric' ? 'charging_station' : 'fuel', at, null, { max: 3 })
      .then((list) => {
        const hit = list.find((p) => (p.distance ?? 99) <= AT_STATION_KM);
        if (live && hit) setStation({ id: priceableStation(hit.id) ? hit.id : undefined, name: hit.name, lat: hit.lat, lng: hit.lng });
      })
      .catch(() => {})
      .finally(() => live && setLooking(false));
    return () => {
      live = false;
    };
  }, [at?.lat, at?.lng, power]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const amountN = num(amount);
  const paidN = num(paid);
  const units = power === 'electric' ? amountN : litresFrom(amountN);
  const ok = !!fuel && units > 0 && paidN >= 0 && !Number.isNaN(paidN);
  const canShare = sharing && !!station?.id && !!fuel && fuel !== 'home';

  const save = () => {
    if (!ok || !fuel) return;
    if (demo) {
      toast(tr("Not saved in demo mode"));
      onCancel();
      return;
    }
    const share = canShare && (ledger.share || optIn);
    if (optIn && !ledger.share) setLedgerPrefs({ share: true });
    const fill = addFill(bikeId, {
      at: Date.now(),
      odometerKm: manual && num(odo) > 0 ? (miles ? num(odo) * 1.609344 : num(odo)) : odometerKm,
      fuel,
      amount: units,
      paid: paidN,
      currency,
      full,
      station: station ?? (at ? { name: tr("Where you stopped"), lat: at.lat, lng: at.lng } : undefined),
      minutes: pausedSince && power === 'electric' ? Math.round((Date.now() - pausedSince) / 60000) : undefined,
      shared: share || undefined,
    });
    if (!fill) return;
    if (share && station?.id) void reportFuelPrice(station.id, fuel as PricedFuel, paidN / units, currency, phoneRegion());
    haptics.success();
    onSaved(fill);
  };

  const input = 'w-full h-14 rounded-2xl bg-background/70 border border-border px-4 text-2xl font-mono outline-none focus:ring-2 focus:ring-accent/60';
  return (
    <div className="space-y-3">
      {/* Fuel or charge type: big tiles, the last one picked already lit. */}
      <div className="grid grid-cols-3 gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={fuel === k}
            onClick={() => {
              haptics.tick();
              setFuel(k);
            }}
            className={cn('min-h-14 rounded-2xl border px-2 py-2 text-[13px] font-semibold leading-tight', fuel === k ? 'bg-accent text-accent-foreground border-accent' : 'frost-accent bg-card/60 border-border/60')}
          >
            {fuelName(k)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{power === 'electric' ? tr("kWh") : volumeUnit()}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, '').slice(0, 7))} inputMode="decimal" placeholder="0.0" className={input} />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{tr("Paid ({0})", [currency])}</span>
          <input value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d.,]/g, '').slice(0, 8))} inputMode="decimal" placeholder="0.00" className={input} />
        </label>
      </div>
      {manual && (
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{miles ? tr("Odometer (miles)") : tr("Odometer (km)")}</span>
          <input value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^\d]/g, '').slice(0, 7))} inputMode="numeric" className={cn(input, 'h-12 text-lg')} />
        </label>
      )}
      <label className="flex items-center gap-3 rounded-2xl frost border border-border/60 px-4 py-3">
        <span className="flex-1 text-sm font-medium">{power === 'electric' ? tr("Charged to full") : tr("Full tank")}</span>
        <Switch checked={full} onCheckedChange={setFull} />
      </label>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground min-h-5">
        {looking ? <PixelLoader className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5 text-accent" />}
        {looking ? tr("Finding the station…") : station ? station.name : at ? tr("Not at a mapped station") : ''}
        {ok && <span className="ml-auto font-mono">{moneyText(paidN / units, currency, 3)} / {power === 'electric' ? tr("kWh") : tr("L")}</span>}
      </p>
      {/* Price sharing, right by Save until the rider has said yes once. */}
      {canShare && !ledger.share && (
        <label className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">{tr("Help map fuel prices")}</span>
            <span className="block text-[11px] text-muted-foreground">{tr("Share the price per litre you paid here, so everyone's map shows real local prices. Nothing else about you or your ride is sent.")}</span>
          </span>
          <Switch checked={optIn} onCheckedChange={setOptIn} aria-label={tr("Help map fuel prices")} />
        </label>
      )}
      {canShare && ledger.share && <p className="text-[11px] text-muted-foreground">{tr("The price goes to the map's fuel prices (you opted in).")}</p>}
      <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} className="h-14 rounded-2xl">
          {tr("Cancel")}
        </Button>
        <Button onClick={save} disabled={!ok} className="h-14 rounded-2xl text-base font-semibold">
          <Check className="w-5 h-5 mr-1.5" /> {tr("Save")}
        </Button>
      </div>
    </div>
  );
}

/**
 * On the ride screen: pausing on a vehicle that takes fuel or charge asks
 * "Filling up?" (once a pause, and only after some riding since the last
 * fill-up). No is just the pause; Yes is the form, filled in from the ride: the
 * odometer, the time, the station, how long it stood charging.
 */
export function FillUpPrompt({ paused, rideMi, at }: { paused: boolean; rideMi: number; at: { lat: number; lng: number } | null }) {
  const { settings } = useSettings();
  const { activeBike } = useGarage();
  const stats = useBikeStats(activeBike ?? null);
  const ledger = useLedger();
  const [step, setStep] = useState<'ask' | 'form' | null>(null);
  const pausedAt = useRef<number | null>(null);
  const atRef = useRef(at);
  atRef.current = at;
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null);

  const v = activeBike ? vehicleLedger(ledger, activeBike.id) : null;
  const power = v ? powerOf(v) : 'none';
  const odometerKm = stats.odometerKm + rideMi * 1.609344;

  useEffect(() => {
    if (!paused) {
      pausedAt.current = null;
      setStep(null);
      return;
    }
    if (pausedAt.current) return;
    pausedAt.current = Date.now();
    if (!activeBike || !v || power === 'none' || !settings.garageEnabled || settings.fillUpPromptEnabled === false) return;
    const last = v.fills[v.fills.length - 1];
    if (last && odometerKm - last.odometerKm < ASK_AFTER_KM) return;
    setSpot(atRef.current);
    setStep('ask');
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step || !activeBike) return null;
  const electric = power === 'electric';
  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 safe-bottom safe-frame-x animate-slide-up" data-no-pull>
      <div className="mx-auto max-w-md short:max-w-2xl max-h-[85dvh] overflow-y-auto rounded-3xl frost-accent bg-card/95 border border-accent/40 shadow-2xl p-4">
        {step === 'ask' ? (
          <div className="flex items-center gap-3 short:gap-4">
            <span className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
              {electric ? <PlugZap className="w-6 h-6" /> : <Fuel className="w-6 h-6" />}
            </span>
            <p className="flex-1 text-lg font-semibold">{electric ? tr("Charging?") : tr("Filling up?")}</p>
            <Button variant="outline" onClick={() => setStep(null)} className="h-14 px-5 rounded-2xl">
              {tr("No")}
            </Button>
            <Button onClick={() => setStep('form')} className="h-14 px-6 rounded-2xl text-base font-semibold">
              {tr("Yes")}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-lg font-semibold mb-3 flex items-center gap-2">
              {electric ? <PlugZap className="w-5 h-5 text-accent" /> : <Fuel className="w-5 h-5 text-accent" />}
              {electric ? tr("Charging {0}", [activeBike.name]) : tr("Filling up {0}", [activeBike.name])}
            </p>
            <FillUpForm
              bikeId={activeBike.id}
              odometerKm={odometerKm}
              at={spot}
              pausedSince={pausedAt.current ?? undefined}
              onCancel={() => setStep(null)}
              onSaved={(f) => {
                setStep(null);
                const sums = ledgerSums(vehicleLedger(getLedger(), activeBike.id), f.odometerKm, f.currency);
                toast.success(tr("Saved to {0}'s logbook", [activeBike.name]), {
                  description: sums.economy ? tr("Economy since your last full tank: {0}", [economyText(sums.economy, power, settings.distanceUnit !== 'km')]) : undefined,
                });
              }}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
