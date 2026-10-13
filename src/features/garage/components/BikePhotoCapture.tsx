import { useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BikePhotos } from '../types';
import { toast } from 'sonner';
import { imageKind } from '@/lib/fileKind';
import { NotACutout, NoVehicleFound, cutOutPhotoFile, prepareCutoutFile } from '../lib/compressImage';
import { tr } from '@/lib/i18n';

interface Props {
  initial?: Partial<BikePhotos>;
  onComplete: (photos: BikePhotos) => void;
  onCancel?: () => void;
}

const MAX_BYTES = 40 * 1024 * 1024; // a phone's largest photo, with room

export function BikePhotoCapture({ initial, onComplete, onCancel }: Props) {
  const [hero, setHero] = useState<string | undefined>(initial?.hero);
  // What's being done to the picture just picked, if anything.
  const [busy, setBusy] = useState<'photo' | 'own' | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const ownRef = useRef<HTMLInputElement>(null);

  /**
   * Two ways in. A photo is cut out and redrawn as pixel art on the phone.
   * The rider's own picture goes in exactly as it is when it's a cut-out; one
   * that turns out to have a background is treated as a photo.
   */
  const handleFile = (way: 'photo' | 'own') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // By what the file is, not what the phone calls it: Android's picker often gives no type at all.
    const kind = await imageKind(file);
    if (!kind) {
      toast.error(tr("Could not read image"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(tr("That picture is too large."));
      return;
    }
    const cutout = way === 'own' && (kind === 'png' || kind === 'webp');
    let asPhoto = !cutout;
    setBusy(cutout ? 'own' : 'photo');
    try {
      if (cutout) {
        try {
          // A ready-made cut-out goes in as it is: nothing is cleared out of it.
          setHero(await prepareCutoutFile(file));
          return;
        } catch (err) {
          if (!(err instanceof NotACutout)) throw err;
          asPhoto = true;
          setBusy('photo');
        }
      }
      setHero(await cutOutPhotoFile(file));
      if (way === 'own') toast.info(tr("That picture had a background, so Blacktop cut the vehicle out."));
    } catch (err) {
      console.error('[BikePhotoCapture]', err);
      toast.error(
        err instanceof NoVehicleFound
          ? tr("Couldn't find a vehicle in that photo. Try again with the whole vehicle in view.")
          : !asPhoto
            ? tr("Could not read image")
            : tr("Couldn't process the photo. Check your connection and try again."),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {tr("Take a photo of your vehicle and Blacktop cuts it out and redraws it as pixel art, here on your phone. Or use a picture you've already made.")}
      </p>

      <div
        className="relative w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-border/50 bg-card/50 overflow-hidden flex flex-col items-center justify-center gap-2"
        style={hero ? { borderStyle: 'solid', borderColor: 'hsl(var(--accent) / 0.5)' } : undefined}
      >
        {hero ? (
          <img
            src={hero}
            alt={tr("Vehicle")}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ imageRendering: 'pixelated' }}
            onError={() => {
              setHero(undefined);
              toast.error(tr("Image failed to load. Try another file."));
            }}
          />
        ) : (
          <>
            <ImagePlus className="w-7 h-7 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tr("No picture yet")}</span>
          </>
        )}
        {busy && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center px-4 text-center text-xs">
            {busy === 'photo' ? tr("Cutting out your vehicle…") : tr("Loading…")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([
          { way: 'photo', ref: photoRef, Icon: Camera, title: tr("Take a photo"), note: tr("Blacktop cuts it out and pixelates it") },
          { way: 'own', ref: ownRef, Icon: ImagePlus, title: tr("Use my own picture"), note: tr("A ready-made cut-out goes in as it is") },
        ] as const).map(({ way, ref, Icon, title, note }) => (
          <button
            key={way}
            type="button"
            disabled={!!busy}
            onClick={() => ref.current?.click()}
            className="touch-target pressable rounded-2xl border border-accent/40 bg-card/60 p-3 flex flex-col items-center gap-1 text-center disabled:opacity-50"
          >
            <Icon className="w-5 h-5 text-accent" />
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">{note}</span>
          </button>
        ))}
      </div>

      {/* The camera for a photo; any picture for the rider's own (checked by what it is, once picked). */}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile('photo')} />
      <input ref={ownRef} type="file" accept="image/*" className="hidden" onChange={handleFile('own')} />

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            <X className="w-4 h-4 mr-1" />{" "}{tr("Cancel")}
          </Button>
        )}
        <Button
          onClick={() => hero && onComplete({ hero })}
          disabled={!hero || !!busy}
          className="flex-1"
        >
          {tr("Save vehicle")}
        </Button>
      </div>
    </div>
  );
}
