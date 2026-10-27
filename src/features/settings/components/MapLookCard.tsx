import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Moon, Palette } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SlidingPill } from '@/components/SlidingPill';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { MAP_LOOKS, type MapLookId } from '@/lib/mapTint';
import { useSettings } from '../hooks/useSettings';

/**
 * Settings → Navigation → Map look and Night map (map/lib/mapLook). The map
 * look is one of five; the night map (on by default: after sunset, dimmed)
 * goes on top of it. A preview of the real map (stills taken from the app,
 * `public/img/map-look/<look>-<day|dim|ember>.webp`) compares two halves
 * across a divider the rider drags: the look by day and at night, or, with
 * the night map off, the normal map and the look.
 */
const shot = (look: MapLookId, time: 'day' | 'dim' | 'ember') => `/img/map-look/${look}-${time}.webp`;

const LOOK_LABEL: Record<MapLookId, () => string> = {
  normal: () => tr("Normal"),
  infrared: () => tr("Infrared"),
  nightvision: () => tr("Night vision"),
  crt: () => tr("CRT"),
  noir: () => tr("Noir"),
};

export function MapLookCard() {
  const { settings, updateSetting } = useSettings();
  const look = settings.mapLook;
  const nightOn = settings.nightMapEnabled;
  const night = settings.nightMapStyle;
  const [split, setSplit] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Day and night of the chosen look; with the night map off, the normal map against the look.
  const left = nightOn ? shot(look, 'day') : shot('normal', 'day');
  const right = nightOn ? shot(look, night) : shot(look, 'day');
  const leftLabel = nightOn ? tr("Day") : LOOK_LABEL.normal();
  const rightLabel = nightOn ? tr("Night") : LOOK_LABEL[look]();
  const showPreview = nightOn || look !== 'normal';

  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setSplit(Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 20 : 5;
    if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0, s - step));
    else if (e.key === 'ArrowRight') setSplit((s) => Math.min(100, s + step));
    else return;
    e.preventDefault();
  };

  return (
    <div className="mt-4 pt-3 border-t border-border/30 space-y-3" data-tip="settings-night-map">
      <div>
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-accent" />
          {tr("Map look")}
        </p>
        <p className="text-[10px] text-muted-foreground mb-2">
          {tr("How the Blacktop map is drawn. Your route, hazards and cameras keep their colours whatever you pick.")}
        </p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={tr("Map look")}>
          {MAP_LOOKS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={look === v}
              onClick={() => updateSetting('mapLook', v)}
              className={cn(
                'tall-hit px-3 py-1.5 rounded-lg text-xs border transition-colors',
                look === v ? 'bg-accent/20 border-accent text-accent' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {LOOK_LABEL[v]()}
            </button>
          ))}
        </div>
      </div>

      {showPreview && (
        <div
          ref={box}
          role="slider"
          tabIndex={0}
          aria-label={tr("Drag to compare the two maps")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={split}
          data-tip="night-map-preview"
          className="relative w-full aspect-[412/520] rounded-xl overflow-hidden border border-border/40 bg-black select-none touch-pan-y cursor-ew-resize focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        >
          <img src={left} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
          <img src={right} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
          <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{leftLabel}</span>
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{rightLabel}</span>
          {/* The divider and its grip. */}
          <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90 pointer-events-none" style={{ left: `${split}%` }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-white text-black shadow-lg flex items-center justify-center text-sm font-bold">
              ‹›
            </div>
          </div>
          <p className="absolute top-1 inset-x-0 text-center text-[8px] text-white/60 pointer-events-none">{tr("Map © OpenStreetMap contributors, OpenFreeMap")}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="pr-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Moon className="w-4 h-4 text-accent" />
            {tr("Night map")}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {tr("Darkens your map look after sunset so a bright screen doesn't spoil your night vision.")}
          </p>
        </div>
        <Switch checked={nightOn} onCheckedChange={(v) => updateSetting('nightMapEnabled', v)} aria-label={tr("Night map")} />
      </div>

      {/* Opens down while the night map is on. */}
      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', nightOn ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden" {...((!nightOn ? { inert: '' } : {}) as Record<string, string>)}>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium mb-1.5">{tr("Night look")}</p>
              <div className="relative grid grid-cols-2 gap-1 rounded-xl border border-border/40 p-1" role="radiogroup" aria-label={tr("Night look")}>
                <SlidingPill />
                {(['dim', 'ember'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={night === v}
                    onClick={() => updateSetting('nightMapStyle', v)}
                    className={cn('relative z-[1] tall-hit rounded-lg py-2 text-xs font-semibold', night === v ? 'text-accent-foreground' : 'text-muted-foreground')}
                  >
                    {v === 'dim' ? tr("Dimmed") : tr("Ember")}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {night === 'dim'
                  ? tr("Your map look at about half brightness, its colours still easy to tell apart.")
                  : tr("Your map look in shades of burn orange, the warm light that keeps your night vision best.")}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium mb-1.5">{tr("When")}</p>
              <div className="relative grid grid-cols-2 gap-1 rounded-xl border border-border/40 p-1" role="radiogroup" aria-label={tr("When")}>
                <SlidingPill />
                {(['auto', 'always'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={settings.nightMapWhen === v}
                    onClick={() => updateSetting('nightMapWhen', v)}
                    className={cn(
                      'relative z-[1] tall-hit rounded-lg py-2 text-xs font-semibold',
                      settings.nightMapWhen === v ? 'text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {v === 'auto' ? tr("Sunset to sunrise") : tr("Always")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
