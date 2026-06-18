import { useRef, useState } from 'react';
import { ImagePlus, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BikePhotos } from '../types';
import { toast } from 'sonner';
import { removeImageBackgroundFile } from '../lib/compressImage';

interface Props {
  initial?: Partial<BikePhotos>;
  onComplete: (photos: BikePhotos) => void;
  onCancel?: () => void;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8MB cap

export function BikePhotoCapture({ initial, onComplete, onCancel }: Props) {
  const [hero, setHero] = useState<string | undefined>(initial?.hero);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/png|webp/i.test(file.type)) {
      toast.error('Please use a PNG or WebP vehicle image');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image too large — keep it under 8MB');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await removeImageBackgroundFile(file);
      setHero(dataUrl);
    } catch (err) {
      console.error('[BikePhotoCapture]', err);
      toast.error('Could not read image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a <span className="text-foreground">pixelated PNG</span> of your vehicle —
        the app will clear the flat background and drop it onto the shop floor.
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
              alt="Vehicle"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
              onError={() => {
                setHero(undefined);
                toast.error('Image failed to load. Try another file.');
              }}
            />
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] uppercase tracking-widest px-2 py-1 rounded-full flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Replace
            </div>
          </>
        ) : (
          <>
            <ImagePlus className="w-7 h-7 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tap to upload image
            </span>
          </>
        )}
        {busy && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center text-xs">
            Loading…
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/gif"
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
          Save vehicle
        </Button>
      </div>
    </div>
  );
}
