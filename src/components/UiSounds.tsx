import { useEffect, useRef } from 'react';
import { useSonner } from 'sonner';
import { useSettings } from '@/features/settings';
import { uiCue, type UiCueKind } from '@/lib/radioFx';

/** Anything whose own sounds (or silence) matter more: the alarm lock, games, scenes' own toggles. */
const QUIET = '[data-no-ui-sound]';
const SWITCHES = '[role="switch"], [role="checkbox"], input[type="checkbox"], [role="radio"], input[type="radio"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const PICKS = '[role="tab"], [role="option"], [role="menuitem"]';
const PRESSES = 'button, a[href], [role="button"], summary, input[type="submit"], input[type="button"]';

const disabled = (el: Element) => el.matches(':disabled, [aria-disabled="true"], [data-disabled]');
const isOn = (el: Element) =>
  el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true' || el.getAttribute('data-state') === 'checked' || el.getAttribute('data-state') === 'on';

/**
 * The app's interface sounds, from one place (mounted once in App.tsx): a click
 * for buttons and links, up / down blips for switches, checkboxes and radios,
 * ticks for sliders, a blip for tabs and menu items, a whoosh for dialogs and
 * sheets, and a tone for success / error / warning toasts. Off with Settings →
 * Your Blacktop → App sounds; alerts (hazards, cameras, crash check, the alarm,
 * directions) have their own calls and always sound.
 */
export function UiSounds() {
  const { settings } = useSettings();
  const on = settings.uiSoundsEnabled !== false;
  const enabled = useRef(on);
  enabled.current = on;

  useEffect(() => {
    const play = (kind: UiCueKind, level?: number) => {
      if (enabled.current && document.visibilityState === 'visible') uiCue(kind, level);
    };

    // Presses: the most specific control under the finger decides the sound.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest || target.closest(QUIET)) return;
      const sw = target.closest(SWITCHES);
      if (sw && !disabled(sw)) {
        // Read the state once the control has flipped.
        setTimeout(() => play(isOn(sw) ? 'on' : 'off'), 0);
        return;
      }
      const pick = target.closest(PICKS);
      if (pick && !disabled(pick)) return play('select');
      const press = target.closest(PRESSES);
      if (press && !disabled(press) && !press.matches('[role="slider"]')) play('tap');
    };

    // Sliders: native ranges and Radix sliders, a tick per step (at most every 35 ms).
    let lastTick = 0;
    const tick = (fraction: number) => {
      const now = performance.now();
      if (now - lastTick < 35) return;
      lastTick = now;
      play('tick', fraction);
    };
    const onInput = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== 'range' || el.closest(QUIET)) return;
      const min = Number(el.min || 0);
      const max = Number(el.max || 100);
      tick(max > min ? (Number(el.value) - min) / (max - min) : 0.5);
    };
    const sliders = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as Element;
        if (el.getAttribute('role') !== 'slider' || el.closest(QUIET)) continue;
        const v = Number(el.getAttribute('aria-valuenow'));
        const min = Number(el.getAttribute('aria-valuemin') ?? 0);
        const max = Number(el.getAttribute('aria-valuemax') ?? 100);
        if (String(v) !== r.oldValue) tick(max > min ? (v - min) / (max - min) : 0.5);
      }
    });
    sliders.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-valuenow'], attributeOldValue: true });

    // Dialogs and sheets open and close in portals straight under <body>.
    const isDialog = (n: Node) =>
      n instanceof Element && !n.closest(QUIET) && !n.querySelector(QUIET) && (n.matches('[role="dialog"], [role="alertdialog"]') || !!n.querySelector('[role="dialog"], [role="alertdialog"]'));
    const portals = new MutationObserver((records) => {
      for (const r of records) {
        if ([...r.addedNodes].some(isDialog)) play('open');
        else if ([...r.removedNodes].some(isDialog)) play('close');
      }
    });
    portals.observe(document.body, { childList: true });

    document.addEventListener('click', onClick, true);
    document.addEventListener('input', onInput, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('input', onInput, true);
      sliders.disconnect();
      portals.disconnect();
    };
  }, []);

  // Toasts: a tone for the ones that report how something went (each toast once).
  const { toasts } = useSonner();
  const heard = useRef(new Set<string | number>());
  useEffect(() => {
    for (const t of toasts) {
      if (heard.current.has(t.id)) continue;
      heard.current.add(t.id);
      if (!enabled.current || document.visibilityState !== 'visible') continue;
      if (t.type === 'success') uiCue('success');
      else if (t.type === 'error') uiCue('error');
      else if (t.type === 'warning') uiCue('warning');
    }
    if (heard.current.size > 200) heard.current = new Set(toasts.map((t) => t.id));
  }, [toasts]);

  return null;
}
