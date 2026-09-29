import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { LucideIcon } from 'lucide-react';

/**
 * A lucide icon as an <img>, for canvas drawing and map sprites.
 *
 * Rendered into its own detached root and read once React has committed it.
 * Don't use flushSync for this: callers run inside effects (map layers are
 * added from them), where React refuses to flush, so the markup came back
 * empty and every icon silently went missing.
 */
export async function lucideImage(
  icon: LucideIcon,
  opts: { color: string; strokeWidth?: number; size?: number },
): Promise<HTMLImageElement> {
  const host = document.createElement('div');
  const root = createRoot(host);
  root.render(createElement(icon, { size: opts.size ?? 24, color: opts.color, strokeWidth: opts.strokeWidth ?? 2 }));
  for (let i = 0; i < 60 && !host.querySelector('svg'); i++) await new Promise((r) => setTimeout(r, 0));
  const svg = host.innerHTML;
  setTimeout(() => root.unmount(), 0);
  if (!svg.includes('<svg')) throw new Error('Icon did not render');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
