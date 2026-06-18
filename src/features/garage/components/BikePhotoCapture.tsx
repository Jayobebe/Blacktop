import { useRef, useState } from 'react';
import { Camera, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compressImageFile } from '../lib/compressImage';
import { BikePhotos } from '../types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Angle = keyof BikePhotos;
const ORDER: Angle[] = ['left', 'right', 'front', 'back'];
const LABELS: Record<Angle, string> = {
  left: 'Left side',
  right: 'Right side',
  front: 'Front',
  back: 'Back',
};

interface Props {
  initial?: Partial<BikePhotos>;
  onComplete: (photos: BikePhotos) => void;
  onCancel?: () => void;
}

export function BikePhotoCapture({ initial, onComplete, onCancel }: Props) {
  const [photos, setPhotos] = useState<Partial<BikePhotos>>(initial ?? {});
  const [busy, setBusy] = useState<Angle | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Angle>('left');

  const pick = (angle: Angle) => {
    setTarget(angle);
    inputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(target);
    try {
      const dataUrl = await compressImageFile(file);
      setPhotos((p) => ({ ...p, [target]: dataUrl }));
    } catch (err) {
      console.error('[BikePhotoCapture]', err);
      toast.error('Could not process photo');
    } finally {
      setBusy(null);
    }
  };

  const complete =
    photos.left && photos.right && photos.front && photos.back;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Capture your bike from all four sides. The left side becomes the hero render in the garage.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {ORDER.map((angle) => {
          const url = photos[angle];
          const isBusy = busy === angle;
          return (
            <button
              key={angle}
              type="button"
              onClick={() => pick(angle)}
              className={cn(
                'relative aspect-[4/3] rounded-2xl border-2 border-dashed border-border/50 bg-card/50 overflow-hidden flex flex-col items-center justify-center gap-1 transition-all',
                url && 'border-solid border-accent/50',
                isBusy && 'opacity-60',
              )}
            >
              {url ? (
                <>
                  <img src={url} alt={LABELS[angle]} className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs text-white">
                    <span className="font-semibold uppercase tracking-wider">{LABELS[angle]}</span>
                    <Check className="w-4 h-4 text-accent" />
                  </div>
                </>
              ) : (
                <>
                  <Camera className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {LABELS[angle]}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
        )}
        <Button
          onClick={() => complete && onComplete(photos as BikePhotos)}
          disabled={!complete}
          className="flex-1"
        >
          Save bike
        </Button>
      </div>
    </div>
  );
}
