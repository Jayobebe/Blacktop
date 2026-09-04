import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import nickAsset from '@/assets/mecha-nick.png.asset.json';

interface MechaNickProps {
  /** Highest-priority message — always shown first when present. */
  tip?: string | null;
  /** Contextual lines Nick cycles through automatically. */
  lines?: string[];
  className?: string;
}

const FALLBACK_LINES = [
  'Ride safe, ride often.',
  'Tank\'s not gonna fill itself.',
  'Keep the shiny side up.',
];

/** Time a message stays on screen, and the quiet gap between messages. */
const SHOW_MS = 7000;
const GAP_MS = 5000;

export function MechaNick({ tip, lines, className }: MechaNickProps) {
  const pool = useMemo(() => {
    const merged = [...(tip ? [tip] : []), ...(lines?.length ? lines : FALLBACK_LINES)];
    return Array.from(new Set(merged.filter(Boolean)));
  }, [tip, lines]);

  const [message, setMessage] = useState<string | null>(null);
  const lastRef = useRef<string | null>(null);
  const poolRef = useRef(pool);
  poolRef.current = pool;

  const pickNext = useCallback(() => {
    const p = poolRef.current;
    if (!p.length) return null;
    const options = p.length > 1 ? p.filter((l) => l !== lastRef.current) : p;
    const next = options[Math.floor(Math.random() * options.length)];
    lastRef.current = next;
    return next;
  }, []);

  // Auto speech loop: show a line, hold it long enough to read, pause, repeat.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const show = () => {
      if (cancelled) return;
      setMessage(pickNext());
      timer = setTimeout(hide, SHOW_MS);
    };
    const hide = () => {
      if (cancelled) return;
      setMessage(null);
      timer = setTimeout(show, GAP_MS);
    };

    timer = setTimeout(show, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickNext]);

  // A new priority tip interrupts the loop immediately.
  useEffect(() => {
    if (tip) {
      lastRef.current = tip;
      setMessage(tip);
    }
  }, [tip]);

  const speakNow = () => {
    setMessage(pickNext());
  };

  return (
    <div className={cn('relative flex flex-col items-end', className)}>
      {message && (
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-10 w-max max-w-[200px] animate-scale-in">
          <div className="relative rounded-2xl bg-white px-3 py-2 text-xs leading-snug text-neutral-900 shadow-lg">
            <span className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
              Mecha-Nick
            </span>
            {message}
            {/* Bubble tail pointing down at Nick */}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-white" />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={speakNow}
        className="relative h-[260px] w-32 sm:h-[300px] sm:w-36 select-none focus:outline-none"
        aria-label="Talk to Mecha-Nick"
      >
        <img
          src={nickAsset.url}
          alt="Mecha-Nick the mechanic"
          draggable={false}
          className={`absolute inset-0 h-full w-full object-contain object-bottom drop-shadow-[0_10px_14px_rgba(0,0,0,0.6)] ${message ? 'animate-nick-bob' : ''}`}
        />
      </button>
    </div>
  );
}
