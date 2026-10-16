import type { IControl } from 'maplibre-gl';
import { armAlarm } from '@/features/alarm';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';

/**
 * The anti-theft alarm's lock as a map control, in the right-hand column
 * straight under the compass (it lives here, not in the alarm feature, so
 * MapLibre stays out of the eager screens that mount the alarm).
 */
export class AlarmControl implements IControl {
  private el: HTMLDivElement | null = null;

  onAdd(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bt-alarm-ctrl';
    const label = tr("Arm the anti-theft alarm");
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/></svg>';
    button.addEventListener('click', () => {
      haptics.tick();
      void armAlarm();
    });
    el.appendChild(button);
    this.el = el;
    return el;
  }

  onRemove() {
    this.el?.remove();
    this.el = null;
  }
}
