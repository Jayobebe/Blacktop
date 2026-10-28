import type { IControl } from 'maplibre-gl';

/**
 * An empty place in one of MapLibre's control columns, for a React button to be
 * portaled into (the map's rescue R sits in the right-hand column this way, under
 * recentre, the same size and shape as the controls round it).
 */
export class SlotControl implements IControl {
  readonly el: HTMLDivElement;

  constructor(className: string) {
    this.el = document.createElement('div');
    this.el.className = `maplibregl-ctrl maplibregl-ctrl-group ${className}`;
  }

  onAdd(): HTMLElement {
    return this.el;
  }

  onRemove() {
    this.el.remove();
  }
}
