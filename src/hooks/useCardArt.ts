import { useEffect, useState } from 'react';
import { useSettings } from '@/features/settings';
import { pixelArt, styledNow } from '@/lib/pixelArt';

/**
 * The picture a card should draw for a rider's vehicle: the photo itself, or,
 * with Settings → Your Blacktop → Pixel-art cards on, the photo redrawn in the
 * Card Wars look (lib/pixelArt). Card Wars' own artwork already has the look
 * and is passed straight through. Until the redrawn one is ready (a moment,
 * once a launch) the photo shows.
 */
export function useCardArt(src: string | undefined | null): string | undefined {
  const { settings } = useSettings();
  const wanted = !!settings.cardArtStyle && !!src && !src.startsWith('/card-wars/');
  const [styled, setStyled] = useState<{ src: string; out: string } | null>(() => {
    const out = wanted && src ? styledNow(src) : undefined;
    return out && src ? { src, out } : null;
  });
  useEffect(() => {
    if (!wanted || !src) return;
    let live = true;
    void pixelArt(src).then((out) => {
      if (live && out) setStyled({ src, out });
    });
    return () => {
      live = false;
    };
  }, [wanted, src]);
  if (!src) return undefined;
  return wanted && styled?.src === src ? styled.out : src;
}
