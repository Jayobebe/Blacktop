import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import nickAsset from '@/assets/mecha-nick.png.asset.json';

interface MechaNickProps {
  tip?: string | null;
  className?: string;
}

const DEFAULT_TIPS = [
  "Looking sharp out there.",
  "Chain's looking dry…",
  "Nice numbers today.",
  "Ride safe, ride often.",
  "Tank's not gonna fill itself.",
];

export function MechaNick({ tip, className }: MechaNickProps) {
  const [open, setOpen] = useState(false);
  const fallback = useMemo(
    () => DEFAULT_TIPS[Math.floor(Math.random() * DEFAULT_TIPS.length)],
    [],
  );
  const message = tip ?? fallback;

  return (
    <div className={cn('relative flex flex-col items-end', className)}>
      {open && (
        <div className="mb-2 max-w-[180px] rounded-2xl rounded-br-sm bg-card border border-border/40 px-3 py-2 text-xs leading-snug shadow-lg animate-scale-in">
          <span className="block text-[10px] uppercase tracking-widest text-accent mb-0.5">
            Mecha-Nick
          </span>
          {message}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative h-[330px] w-24 sm:h-[370px] sm:w-28 select-none focus:outline-none"
        aria-label="Talk to Mecha-Nick"
      >
        <img
          src={nickAsset.url}
          alt="Mecha-Nick the mechanic"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain object-bottom animate-nick-bob drop-shadow-[0_10px_14px_rgba(0,0,0,0.6)]"
        />
      </button>
    </div>
  );
}
