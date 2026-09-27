import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface ChoiceCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  /** Illustration; pass `active={selected}` so it animates only when chosen. */
  art: ReactNode;
  /** What picking this changes in the app. */
  perks?: string[];
  index?: number;
  compact?: boolean;
}

/** Large single-select card with illustration, used for vehicle and ride-mode steps. */
export function ChoiceCard({ selected, onSelect, title, subtitle, art, perks, index = 0, compact }: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => {
        haptics.tick();
        onSelect();
      }}
      style={{ ['--i' as string]: index }}
      className={cn(
        'pressable group relative w-full text-left rounded-3xl border overflow-hidden',
        'transition-[border-color,background-color,box-shadow] duration-300',
        selected
          ? 'border-accent bg-accent/[0.07] shadow-[0_0_0_1px_hsl(var(--accent)/0.5),0_12px_40px_-12px_hsl(var(--accent)/0.45)]'
          : 'border-border/50 bg-card/40 hover:border-border'
      )}
    >
      {/* Accent wash that fades in when selected */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--accent)/0.18),transparent_60%)] transition-opacity duration-500',
          selected ? 'opacity-100' : 'opacity-0'
        )}
      />

      <div className={cn('relative flex items-center gap-4', compact ? 'p-3' : 'p-4')}>
        <div
          className={cn(
            'shrink-0 transition-colors duration-300',
            compact ? 'w-24 h-14' : 'w-28 h-16',
            selected ? 'text-accent' : 'text-muted-foreground/60'
          )}
        >
          {art}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-lg font-semibold tracking-tight transition-colors', selected && 'text-accent')}>{title}</p>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{subtitle}</p>
        </div>
        <div
          className={cn(
            'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-300',
            selected ? 'border-accent bg-accent' : 'border-border'
          )}
        >
          {selected && <Check className="w-3.5 h-3.5 text-accent-foreground setup-pop" strokeWidth={3} />}
        </div>
      </div>

      {/* Perks expand under the selected card so the consequence of the choice is visible */}
      {perks && perks.length > 0 && (
        <div
          className={cn(
            'relative grid transition-[grid-template-rows,opacity] duration-500 ease-spring',
            selected ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <ul className="px-4 pb-4 pt-0 flex flex-wrap gap-1.5">
              {perks.map((p) => (
                <li key={p} className="text-[11px] px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </button>
  );
}
