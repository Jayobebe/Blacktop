import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sticker as StickerIcon, X } from 'lucide-react';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { useCardArt } from '@/hooks/useCardArt';
import { MAX_STICKERS, addSticker, removeStickerFor, setArranging, useStickers } from '../lib/store';

/**
 * On the back of a vault card: sticks the card's sticker on Home, or peels it
 * off again. The card it sits on is itself a button, so this is a span with a
 * button's role, and its taps don't turn the card back over.
 */
export function StickerControl({ card, name, src, className }: { card: string; name: string; src?: string; className?: string }) {
  const stuck = useStickers().some((s) => s.card === card);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!src) return null;

  const act = async () => {
    if (busy) return;
    haptics.light();
    if (stuck) {
      removeStickerFor(card);
      toast(tr("Sticker peeled off Home"));
      return;
    }
    setBusy(true);
    const res = await addSticker(card, name, src);
    setBusy(false);
    if (res === 'full') toast.error(tr("Home holds {0} stickers. Peel one off first.", [MAX_STICKERS]));
    else if (res === 'failed') toast.error(tr("Couldn't make this sticker"));
    else
      toast.success(tr("Sticker on Home"), {
        description: tr("Move, resize, turn or flip it there."),
        action: {
          label: tr("Arrange"),
          onClick: () => {
            setArranging(true);
            navigate('/');
          },
        },
      });
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={stuck}
      onClick={(e) => {
        e.stopPropagation();
        void act();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        void act();
      }}
      className={cn(
        'relative inline-flex w-full min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
        stuck ? 'border-white/30 bg-black/40 text-white' : 'border-white/40 bg-white/15 text-white hover:bg-white/25',
        busy && 'opacity-60',
        className,
      )}
    >
      {stuck ? <X className="w-3.5 h-3.5" aria-hidden /> : <StickerIcon className="w-3.5 h-3.5" aria-hidden />}
      {stuck ? tr("Peel off Home") : tr("Stick on Home")}
    </span>
  );
}

/** The sticker itself, as the back of a card shows it: the cut-out with its white edge, a little askew. */
export function StickerPreview({ src, className }: { src: string; className?: string }) {
  // With Pixel-art cards on, a rider's photo is drawn in that look here too (the sticker kept is still the photo).
  const art = useCardArt(src);
  return <img src={art} alt="" draggable={false} className={cn('sticker-img max-w-full max-h-full object-contain -rotate-6', className)} />;
}
