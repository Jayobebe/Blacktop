import type { ElementType } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface ChoiceCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  icon: ElementType;
  /** What picking this changes in the app, revealed when selected. */
  perks?: string[];
  index?: number;
}

/** Single-select frosted option row: icon tile, title, subtitle, radio check. */
export function ChoiceCard({ selected, onSelect, title, subtitle, icon: Icon, perks, index = 0 }: ChoiceCardProps) {
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
        'pressable frost w-full text-left rounded-[22px] transition-[border-color,background-color] duration-300',
        selected && '!border-accent/60 !bg-accent/[0.08]'
      )}
    >
      <div className="flex items-center gap-3.5 p-4">
        <IconTile icon={Icon} active={selected} />
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-semibold tracking-tight">{title}</p>
          <p className="text-[13px] text-muted-foreground leading-snug mt-0.5">{subtitle}</p>
        </div>
        <RadioDot active={selected} />
      </div>

      {perks && perks.length > 0 && (
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-500 ease-spring',
            selected ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <ul className="px-4 pb-4 pl-[4.4rem] space-y-1">
              {perks.map((p) => (
                <li key={p} className="flex items-center gap-2 text-[13px] text-foreground/80">
                  <Check className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={2.5} />
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

/** Rounded-square icon holder, the same treatment Settings uses for its icons. */
export function IconTile({ icon: Icon, active, size = 'md' }: { icon: ElementType; active: boolean; size?: 'md' | 'lg' }) {
  return (
    <div
      className={cn(
        'shrink-0 rounded-2xl flex items-center justify-center transition-colors duration-300',
        size === 'lg' ? 'w-12 h-12' : 'w-11 h-11',
        active ? 'bg-accent text-accent-foreground' : 'bg-white/[0.07] text-foreground/75'
      )}
    >
      <Icon className={size === 'lg' ? 'w-6 h-6' : 'w-[22px] h-[22px]'} strokeWidth={1.75} />
    </div>
  );
}

export function RadioDot({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-300',
        active ? 'border-accent bg-accent' : 'border-white/20'
      )}
    >
      {active && <Check className="w-3.5 h-3.5 text-accent-foreground setup-pop" strokeWidth={3} />}
    </div>
  );
}
