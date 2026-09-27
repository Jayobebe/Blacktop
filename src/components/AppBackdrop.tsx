import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * The app-wide backdrop, fixed behind every screen. Bottom to top:
 *   1. Lava-lamp glow: very soft accent blobs slowly drifting, bouncing and
 *      growing. Pure radial gradients moved with transforms (no blur filter),
 *      so they're cheap to animate.
 *   2. Charcoal "BLACKTOP" wordmark, tightly packed. It sits above the glow,
 *      so the blobs light the gaps and the words read as dark silhouettes.
 *   3. Mist: fine grain + haze, with the wordmark softened, for a
 *      frosted-glass finish.
 *
 * `paused` freezes the blobs (active rides, open map) to save battery.
 */

const ROWS = 110;
const WORDS_PER_ROW = 30;

export const AppBackdrop = memo(function AppBackdrop({ paused = false }: { paused?: boolean }) {
  return (
    <div aria-hidden className={cn('app-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden', paused && 'lava-paused')}>
      {/* 1. Lava lamp */}
      <div className="absolute inset-0">
        <span className="lava-blob lava-blob-1" />
        <span className="lava-blob lava-blob-2" />
        <span className="lava-blob lava-blob-3" />
        <span className="lava-blob lava-blob-4" />
        <span className="lava-blob lava-blob-5" />
      </div>

      {/* 2. Wordmark */}
      <div className="backdrop-wordmark">
        {Array.from({ length: ROWS }, (_, r) => (
          <div key={r} className={cn('backdrop-wordmark-row', r % 2 === 1 && 'backdrop-wordmark-row-offset')}>
            {Array.from({ length: WORDS_PER_ROW }, (_, w) => (
              <span key={w}>BLACKTOP</span>
            ))}
          </div>
        ))}
      </div>

      {/* 3. Mist */}
      <div className="backdrop-mist" />
    </div>
  );
});
