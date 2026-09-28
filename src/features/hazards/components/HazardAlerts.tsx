import { useEffect, useRef, useState } from 'react';
import { ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useSettings } from '@/features/settings';
import { subscribeRawFixes, useRideSpeed } from '@/features/ride';
import { speak, useMapOverlay } from '@/features/map';
import { HAZARD_BY_KIND, hazardColor, type Hazard } from '../types';
import { boundsAround, fetchHazards, getHazards, voteHazard, HazardError } from '../lib/hazardStore';
import { onHazardFix, setLastHazardPosition, type HazardFix } from '../lib/position';
import { setHazardWarning, useHazardWarning, type HazardWarning } from '../lib/bannerStore';

/**
 * Hazard warnings, app-wide (mounted once in App): as the rider moves, any
 * report ahead within ~20 s of riding shows a banner and (with the setting on)
 * is spoken. Once they've ridden past, "Still there?" asks them to confirm or
 * clear it. Runs on ride GPS, or the map's GPS when riding without a ride.
 */

const FETCH_RADIUS_M = 5_000;
const REFETCH_AFTER_M = 2_000;
const REFETCH_AFTER_MS = 2 * 60_000;
const AHEAD_DEG = 32;
const PASSED_M = 35;
const PROMPT_AFTER_M = 70;
const MOVING_MPS = 3;

const toRad = (d: number) => (d * Math.PI) / 180;
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const x = toRad(b.lng - a.lng) * Math.cos(toRad((a.lat + b.lat) / 2));
  const y = toRad(b.lat - a.lat);
  return Math.hypot(x, y) * 6_371_000;
}
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}
const angleGap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

function spokenDistance(m: number, unit: 'miles' | 'km') {
  if (unit === 'km') return m >= 1000 ? `${(m / 1000).toFixed(1)} kilometres` : `${Math.max(50, Math.round(m / 50) * 50)} metres`;
  const yards = m * 1.09361;
  return yards >= 440 ? `${(m / 1609.34).toFixed(1)} miles` : `${Math.max(50, Math.round(yards / 50) * 50)} yards`;
}
function shownDistance(m: number, unit: 'miles' | 'km') {
  if (unit === 'km') return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
  const yards = m * 1.09361;
  return yards >= 440 ? `${(m / 1609.34).toFixed(1)} mi` : `${Math.round(yards / 10) * 10} yd`;
}

export function HazardAlerts() {
  const { settings } = useSettings();
  const ride = useRideSpeed();
  const { isOpen: mapOpen } = useMapOverlay();
  const banner = useHazardWarning();
  const [prompt, setPrompt] = useState<Hazard | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let prev: HazardFix | null = null;
    let heading: number | null = null;
    let lastFetch: { at: number; lat: number; lng: number } | null = null;
    const alerted = new Set<string>();
    const passed = new Set<string>();
    const prompted = new Set<string>();

    const onFix = (fix: HazardFix) => {
      if (prev && metres(prev, fix) >= 8) {
        heading = bearing(prev, fix) % 360;
        prev = fix;
      } else if (!prev) prev = fix;
      setLastHazardPosition({ ...fix, heading });

      if (!lastFetch || Date.now() - lastFetch.at > REFETCH_AFTER_MS || metres(lastFetch, fix) > REFETCH_AFTER_M) {
        lastFetch = { at: Date.now(), lat: fix.lat, lng: fix.lng };
        void fetchHazards(boundsAround(fix, FETCH_RADIUS_M));
      }

      const speed = fix.speed ?? 0;
      if (speed < MOVING_MPS || heading === null) return;
      const lookAhead = Math.min(800, Math.max(250, speed * 20));
      const unit = settingsRef.current.distanceUnit;

      for (const h of getHazards()) {
        const d = metres(fix, h);
        if (d > 1_000) continue;
        if (!alerted.has(h.id) && d <= lookAhead && angleGap(heading, bearing(fix, h) % 360) <= AHEAD_DEG) {
          alerted.add(h.id);
          const type = HAZARD_BY_KIND[h.kind];
          setHazardWarning({ hazard: h, distance: d });
          haptics.medium();
          if (settingsRef.current.hazardVoiceEnabled) speak(`${type.spoken} ahead, ${spokenDistance(d, unit)}.`, { interrupt: true });
        }
        if (alerted.has(h.id) && d <= PASSED_M) passed.add(h.id);
        if (passed.has(h.id) && d >= PROMPT_AFTER_M && !prompted.has(h.id)) {
          prompted.add(h.id);
          setHazardWarning((b) => (b?.hazard.id === h.id ? null : b));
          if (!h.mine && h.myVote === null) setPrompt(h);
        }
      }
    };

    const offRide = subscribeRawFixes((f) => onFix({ lat: f.lat, lng: f.lng, speed: f.speed, t: f.t }));
    const offMap = onHazardFix(onFix);
    return () => {
      offRide();
      offMap();
    };
  }, []);

  // Banners and prompts time out on their own.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setHazardWarning(null), 8_000);
    return () => clearTimeout(t);
  }, [banner]);
  useEffect(() => {
    if (!prompt) return;
    const t = setTimeout(() => setPrompt(null), 12_000);
    return () => clearTimeout(t);
  }, [prompt]);
  // Ride over: nothing left hanging.
  useEffect(() => {
    if (!ride.isActive) setPrompt(null);
  }, [ride.isActive]);

  const vote = async (h: Hazard, stillThere: boolean) => {
    setPrompt(null);
    haptics.light();
    try {
      await voteHazard(h.id, stillThere);
      toast(stillThere ? 'Thanks, others will be warned' : 'Thanks, noted as gone', { duration: 2000 });
    } catch (e) {
      if (e instanceof HazardError && e.reason === 'rate-limited') toast('Slow down on the votes a little');
    }
  };

  const promptType = prompt ? HAZARD_BY_KIND[prompt.kind] : null;

  return (
    <>
      {/* With the map open, BlacktopMap shows the warning in the search bar's slot. */}
      {banner && !mapOpen && (
        <div className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+4.75rem)] z-[1300] w-[min(24rem,calc(100%-1.5rem))]">
          <HazardBanner warning={banner} />
        </div>
      )}

      {prompt && promptType && (
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-[1300] mx-auto max-w-sm animate-slide-up">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur p-3 shadow-2xl">
            <p className="text-sm font-semibold text-center">{promptType.label}: still there?</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button
                onClick={() => vote(prompt, true)}
                className={cn('h-14 rounded-xl flex items-center justify-center gap-2 font-bold text-base bg-accent text-accent-foreground active:scale-95 transition-transform')}
              >
                <ThumbsUp className="w-5 h-5" /> Yes
              </button>
              <button
                onClick={() => vote(prompt, false)}
                className="h-14 rounded-xl flex items-center justify-center gap-2 font-bold text-base border-2 border-border active:scale-95 transition-transform"
              >
                <ThumbsDown className="w-5 h-5" /> Gone
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The warning card: what's ahead and how far. Dismissable. */
export function HazardBanner({ warning, className }: { warning: HazardWarning; className?: string }) {
  const { settings } = useSettings();
  const type = HAZARD_BY_KIND[warning.hazard.kind];
  const color = hazardColor(warning.hazard.kind);
  return (
    <div role="alert" className={cn('animate-slide-up', className)}>
      <div className="flex items-center gap-3 rounded-2xl border-2 bg-card/95 backdrop-blur px-3 py-2.5 shadow-2xl" style={{ borderColor: color }}>
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: color }}>
          <type.icon className="w-5 h-5 text-white" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-tight truncate">{type.label}</span>
          <span className="block text-xs text-muted-foreground">{shownDistance(warning.distance, settings.distanceUnit)} ahead</span>
        </span>
        <button onClick={() => setHazardWarning(null)} className="p-1.5 text-muted-foreground" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
