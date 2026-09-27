import { useEffect, useRef, useState } from 'react';
import { Check, X, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useSettings } from '@/features/settings';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { carePatch, isCareOn, requestMotionPermission, type CareContext, type CareQuestion } from '../../lib/questions';
import type { RideStyle } from '../../lib/profile';
import { RIDE_STYLES } from '../../lib/styles';

const SWIPE_COMMIT_PX = 90;
const EXIT_MS = 260;

interface CareDeckProps {
  questions: CareQuestion[];
  index: number;
  context: CareContext;
  style: RideStyle | null;
  /** Called after the card has animated away. */
  onAnswered: () => void;
}

/**
 * Tinder-style stack of "Do you care about…" cards. Swipe right / tap Yes to
 * switch the features on, swipe left / tap No to hide them. Each answer is
 * written to AppSettings immediately, so the preview that follows is live.
 */
export function CareDeck({ questions, index, context, style, onAnswered }: CareDeckProps) {
  const { settings, updateSettings } = useSettings();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<'yes' | 'no' | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  const q = questions[index];
  const crowd = style ? RIDE_STYLES.find((s) => s.id === style)?.crowd(context.terms) : null;

  // Reset drag state whenever the top card changes (answer or undo).
  useEffect(() => {
    setDx(0);
    setExiting(null);
  }, [index]);

  if (!q) return null;
  const current = isCareOn(q, settings, context);

  const answer = async (yes: boolean) => {
    if (exiting) return;
    if (yes && q.needsMotion && !(await requestMotionPermission())) {
      toast.error('Motion sensor permission denied', { description: 'You can turn this on later in Settings.' });
      setDx(0);
      return;
    }
    haptics.tick();
    updateSettings(carePatch(q, yes, context));
    setExiting(yes ? 'yes' : 'no');
    window.setTimeout(onAnswered, EXIT_MS);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDx(e.clientX - start.current.x);
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (dx > SWIPE_COMMIT_PX) answer(true);
    else if (dx < -SWIPE_COMMIT_PX) answer(false);
    else setDx(0);
  };

  const exitX = exiting === 'yes' ? 480 : exiting === 'no' ? -480 : dx;
  const rotate = exitX / 18;
  const yesOpacity = Math.min(1, Math.max(0, exitX / SWIPE_COMMIT_PX));
  const noOpacity = Math.min(1, Math.max(0, -exitX / SWIPE_COMMIT_PX));
  const Icon = q.icon;
  const recommended = style && q.recommendedFor.includes(style);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span className="font-mono">
          {index + 1} / {questions.length}
        </span>
        <span>Swipe or tap</span>
      </div>

      <div className="relative h-[390px] mb-4 [@media(max-height:700px)]:h-[340px]">
        {/* Upcoming cards peek out behind the top card */}
        {[2, 1].map((offset) => {
          const next = questions[index + offset];
          if (!next) return null;
          const NextIcon = next.icon;
          return (
            <div
              key={next.id}
              aria-hidden
              className="absolute inset-0 rounded-[28px] border border-border/50 bg-card transition-transform duration-300 ease-spring"
              style={{ transform: `translateY(${offset * 24}px) scale(${1 - offset * 0.05})`, opacity: 1 - offset * 0.3 }}
            >
              <div className="p-6 opacity-40">
                <NextIcon className="w-8 h-8 text-muted-foreground" />
              </div>
            </div>
          );
        })}

        {/* Top card */}
        <div
          key={q.id}
          role="group"
          aria-label={q.question(context)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            'absolute inset-0 rounded-[28px] border bg-card overflow-hidden touch-pan-y select-none cursor-grab active:cursor-grabbing animate-scale-in',
            current ? 'border-accent/40' : 'border-border/60',
            !dragging && 'transition-[transform,opacity] ease-out'
          )}
          style={{
            transform: `translateX(${exitX}px) rotate(${rotate}deg)`,
            opacity: exiting ? 0 : 1,
            transitionDuration: `${EXIT_MS}ms`,
            boxShadow: '0 30px 60px -30px hsl(var(--accent) / 0.45)',
          }}
        >
          {/* Hero */}
          <div className="relative h-[40%] flex items-center justify-center bg-[radial-gradient(ellipse_at_center,hsl(var(--accent)/0.22),transparent_70%)]">
            <div className="absolute w-36 h-36 rounded-full border border-accent/20 animate-ping [animation-duration:2.4s]" />
            <div className="absolute w-28 h-28 rounded-full border border-accent/30" />
            <div className="relative w-20 h-20 rounded-3xl bg-accent text-accent-foreground flex items-center justify-center shadow-glow">
              <Icon className="w-10 h-10" />
            </div>
            {recommended && (
              <span className="absolute top-4 left-4 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-accent/15 text-accent border border-accent/30">
                <Star className="w-3 h-3" />
                {crowd ? `Popular with ${crowd}` : 'Recommended'}
              </span>
            )}
            {/* Swipe stamps */}
            <span
              className="absolute top-5 right-5 px-3 py-1 rounded-lg border-2 border-emerald-400 text-emerald-400 font-black tracking-widest text-lg rotate-12"
              style={{ opacity: yesOpacity }}
            >
              YES
            </span>
            <span
              className="absolute top-5 left-5 px-3 py-1 rounded-lg border-2 border-muted-foreground text-muted-foreground font-black tracking-widest text-lg -rotate-12"
              style={{ opacity: noOpacity }}
            >
              NOPE
            </span>
          </div>

          {/* Copy */}
          <div className="px-6 pb-5 pt-1 flex flex-col h-[60%]">
            <h2 className="text-2xl font-semibold tracking-tight leading-tight">{q.question(context)}</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{q.pitch(context)}</p>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
              {q.gets(context).map((g) => (
                <span key={g} className="text-[11px] px-2 py-1 rounded-full bg-secondary text-foreground/80 border border-border/50">
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Answer buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => answer(false)}
          className={cn(
            'pressable h-14 rounded-2xl border flex items-center justify-center gap-2 font-semibold',
            !current ? 'border-foreground/40 bg-secondary/60' : 'border-border bg-card/50 text-muted-foreground'
          )}
        >
          <X className="w-5 h-5" />
          No thanks
        </button>
        <button
          type="button"
          onClick={() => answer(true)}
          className={cn(
            'pressable h-14 rounded-2xl flex items-center justify-center gap-2 font-semibold',
            current ? 'bg-accent text-accent-foreground shadow-glow' : 'bg-accent/85 text-accent-foreground'
          )}
        >
          <Check className="w-5 h-5" strokeWidth={3} />
          Yes
        </button>
      </div>
      <p className="text-[11px] text-center text-muted-foreground -mt-1">{current ? 'Currently on' : q.hides(context)}</p>
    </div>
  );
}
