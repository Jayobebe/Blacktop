import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Fuel, PlugZap, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { useDemoMode } from '@/lib/demoMode';
import { useServerCap } from '@/lib/serverCaps';
import { priceableStation, reportFuelPrice, type PricedFuel } from '@/lib/fuelPrices';
import { searchNearbyPOIs } from '@/features/map/lib/placeSearch';
import { useSettings } from '@/features/settings';
import { useGarage } from '../hooks/useGarage';
import { CHARGES, FUELS, fuelName, ledgerCurrency, phoneRegion, powerOf, updateVehicleLedger, useLedger, usesGallons, vehicleLedger, type FuelType } from '../lib/ledger';

/** Close enough to a station's mapped point to be at it. */
const AT_STATION_KM = 0.08;
/** A station asked about isn't asked about again this launch. */
const asked = new Set<string>();
const US_GAL = 3.785411784;

/**
 * On the ride screen: pausing at a mapped fuel or charging station asks for
 * today's price there, for the map's fuel prices (lib/fuelPrices) and nothing
 * else: the fuel (remembered per vehicle, which also ranks prices in fuel
 * searches) and the price per litre (per gallon in the US, per kWh charging).
 * Send is the rider's say-so each time; nothing goes into the logbook. Once a
 * pause, only at a station the search can price, only with the server's price
 * sharing in place and the garage on.
 */
export function FillUpPrompt({ paused, at }: { paused: boolean; rideMi?: number; at: { lat: number; lng: number } | null }) {
  const { settings } = useSettings();
  const { activeBike } = useGarage();
  const ledger = useLedger();
  const sharing = useServerCap('fuelPrices');
  const { enabled: demo } = useDemoMode();
  const [station, setStation] = useState<{ id: string; name: string } | null>(null);
  const pausedAt = useRef<number | null>(null);
  const atRef = useRef(at);
  atRef.current = at;

  const v = activeBike ? vehicleLedger(ledger, activeBike.id) : null;
  const power = v ? powerOf(v) : 'none';
  const electric = power === 'electric';
  const kinds = electric ? CHARGES.filter((k) => k !== 'home') : FUELS;
  const [fuel, setFuel] = useState<FuelType | null>(null);
  const [price, setPrice] = useState('');
  const [step, setStep] = useState<'fuel' | 'price'>('fuel');

  useEffect(() => {
    if (!paused) {
      pausedAt.current = null;
      setStation(null);
      return;
    }
    if (pausedAt.current) return;
    pausedAt.current = Date.now();
    const spot = atRef.current;
    if (!spot || !activeBike || !v || power === 'none' || !sharing || !settings.garageEnabled || settings.fillUpPromptEnabled === false) return;
    let live = true;
    searchNearbyPOIs(electric ? 'charging_station' : 'fuel', spot, null, { max: 3 })
      .then((list) => {
        const hit = list.find((p) => (p.distance ?? 99) <= AT_STATION_KM && priceableStation(p.id));
        if (!live || !hit || asked.has(hit.id)) return;
        asked.add(hit.id);
        setFuel(v.lastFuel && kinds.includes(v.lastFuel) ? v.lastFuel : null);
        setPrice('');
        setStep('fuel');
        setStation({ id: hit.id, name: hit.name });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!station || !activeBike) return null;
  const currency = ledgerCurrency(ledger);
  const perGallon = !electric && usesGallons();
  const n = parseFloat(price.replace(',', '.'));
  const ok = !!fuel && n > 0;
  const send = () => {
    if (!ok || !fuel) return;
    if (demo) {
      toast(tr("Not sent in demo mode"));
      setStation(null);
      return;
    }
    updateVehicleLedger(activeBike.id, (vl) => ({ ...vl, lastFuel: fuel }));
    const id = station.id;
    setStation(null);
    void reportFuelPrice(id, fuel as PricedFuel, perGallon ? n / US_GAL : n, currency, phoneRegion()).then((sent) => {
      if (sent) {
        haptics.success();
        toast.success(tr("Thanks: that price is on the map for every rider"));
      } else {
        toast.error(tr("Couldn't send the price just now"));
      }
    });
  };

  const label = electric ? tr("Price per kWh ({0})", [currency]) : perGallon ? tr("Price per gallon ({0})", [currency]) : tr("Price per litre ({0})", [currency]);
  const close = () => setStation(null);
  const title = (
    <div className="flex items-center gap-3">
      <span className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
        {electric ? <PlugZap className="w-6 h-6" /> : <Fuel className="w-6 h-6" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xl font-bold tracking-tight leading-tight">{tr("Help map fuel prices")}</span>
        <span className="block text-sm text-muted-foreground truncate">{tr("What's the price at {0}?", [station.name])}</span>
      </span>
    </div>
  );
  // In the middle of the screen over a dark backdrop, like the card drop's question: first the
  // fuel (big tiles), then the price, then Send.
  return createPortal(
    <div className="fixed inset-0 z-[9000] safe-frame flex overflow-y-auto overscroll-contain bg-black/75" role="dialog" aria-modal="true" aria-label={tr("Help map fuel prices")} data-no-pull onClick={close}>
      <div className="m-auto w-full max-w-sm short:max-w-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="no-frost rounded-3xl bg-card border border-accent/50 shadow-2xl p-5 space-y-4">
          {title}
          {step === 'fuel' ? (
            <>
              <div className={cn('grid gap-3', kinds.length === 2 ? 'grid-cols-2' : 'grid-cols-2 short:grid-cols-3')}>
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={fuel === k}
                    onClick={() => {
                      haptics.tick();
                      setFuel(k);
                      setStep('price');
                    }}
                    className={cn('pressable min-h-16 rounded-2xl border px-3 py-3 text-base font-bold leading-tight', fuel === k ? 'bg-accent text-accent-foreground border-accent' : 'bg-secondary border-border')}
                  >
                    {fuelName(k)}
                  </button>
                ))}
              </div>
              <button type="button" onClick={close} className="pressable w-full h-14 rounded-2xl bg-secondary text-lg font-bold">
                {tr("Not now")}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setStep('fuel')} className="flex items-center gap-1 text-sm font-semibold text-accent min-h-11">
                <ChevronLeft className="w-4 h-4" /> {fuel ? fuelName(fuel) : ''}
              </button>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, '').slice(0, 7))}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  inputMode="decimal"
                  autoFocus
                  placeholder="0.000"
                  className="w-full h-16 rounded-2xl bg-background border border-border px-4 text-3xl font-mono outline-none focus:ring-2 focus:ring-accent/60"
                />
              </label>
              <p className="text-xs text-muted-foreground">{tr("Only the station, the fuel and the price are sent, so everyone's map shows real local prices. Nothing about you or your ride.")}</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={send} disabled={!ok} className="pressable h-16 rounded-2xl bg-accent text-accent-foreground text-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  <Send className="w-5 h-5" /> {tr("Send")}
                </button>
                <button type="button" onClick={close} className="pressable h-16 rounded-2xl bg-secondary text-xl font-bold">
                  {tr("Not now")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
