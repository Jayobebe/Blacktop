import { useRef, useState } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pixelateImageFile } from '../lib/compressImage';
import { BikePhotos } from '../types';
import { toast } from 'sonner';

interface Props {
  initial?: Partial<BikePhotos>;
  onComplete: (photos: BikePhotos) => void;
  onCancel?: () => void;
}

export function BikePhotoCapture({ initial, onComplete, onCancel }: Props) {
  const [hero, setHero] = useState<string | undefined>(initial?.hero);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await pixelateImageFile(file);
      setHero(dataUrl);
    } catch (err) {
      console.error('[BikePhotoCapture]', err);
      toast.error('Could not process photo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        One photo: <span className="text-foreground">front-right quarter view</span>. Plain background
        works best. We'll pixelate it into a low-poly diorama render.
      </p>

      <button
        type="button"
        onClick={pick}
        className="relative w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-border/50 bg-card/50 overflow-hidden flex flex-col items-center justify-center gap-2 transition-all hover:border-accent/60"
        style={hero ? { borderStyle: 'solid', borderColor: 'hsl(var(--accent) / 0.5)' } : undefined}
      >
        {hero ? (
          <>
            <img
              src={hero}
              alt="Bike hero"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] uppercase tracking-widest px-2 py-1 rounded-full flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Retake
            </div>
          </>
        ) : (
          <>
            <Camera className="w-7 h-7 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tap to capture
            </span>
          </>
        )}
        {busy && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center text-xs">
            Pixelating…
          </div>
        )}
      </button>

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
          onClick={() => hero && onComplete({ hero })}
          disabled={!hero || busy}
          className="flex-1"
        >
          Save bike
        </Button>
      </div>
    </div>
  );
}
