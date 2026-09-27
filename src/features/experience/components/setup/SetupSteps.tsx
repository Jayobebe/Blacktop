import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import type { RideMode, RideStyle } from '../../lib/profile';
import { VEHICLES, VEHICLE_ORDER, type VehicleType } from '../../lib/vehicles';
import { RIDE_STYLES } from '../../lib/styles';
import type { ExperienceTerms } from '../../lib/terms';
import { ChoiceCard } from './ChoiceCard';
import { MotorcycleArt, CarArt, BicycleArt, EBikeArt, ScooterArt, SoloArt, GroupArt, MixedArt } from './SetupArt';

const VEHICLE_ART: Record<VehicleType, typeof MotorcycleArt> = {
  motorcycle: MotorcycleArt,
  car: CarArt,
  bicycle: BicycleArt,
  ebike: EBikeArt,
  escooter: ScooterArt,
};

const VEHICLE_BLURB: Record<VehicleType, string> = {
  motorcycle: 'Lean angle, chain care',
  car: 'Big-screen layout, G-force',
  bicycle: 'Pedal power, no fuss',
  ebike: 'Assisted and quick',
  escooter: 'Short hops around town',
};

/** Multi-select grid. First pick becomes the main vehicle (icons, speed alerts, garage presets). */
export function VehicleStep({ value, onToggle }: { value: VehicleType[]; onToggle: (v: VehicleType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 stagger-in" role="group" aria-label="Vehicles">
      {VEHICLE_ORDER.map((id, i) => {
        const Art = VEHICLE_ART[id];
        const order = value.indexOf(id);
        const selected = order !== -1;
        const wide = i === VEHICLE_ORDER.length - 1;
        return (
          <button
            key={id}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => {
              haptics.tick();
              onToggle(id);
            }}
            style={{ ['--i' as string]: i }}
            className={cn(
              'pressable relative rounded-3xl border p-3 text-left overflow-hidden transition-[border-color,background-color,box-shadow] duration-300',
              wide && 'col-span-2 flex items-center gap-3',
              selected
                ? 'border-accent bg-accent/[0.07] shadow-[0_12px_36px_-14px_hsl(var(--accent)/0.55)]'
                : 'border-border/50 bg-card/40 hover:border-border'
            )}
          >
            <div className={cn('h-[70px] transition-colors duration-300', selected ? 'text-accent' : 'text-muted-foreground/50', wide ? 'w-[46%] shrink-0' : '-mx-1')}>
              <Art active={selected} />
            </div>
            <div className="min-w-0">
              <p className={cn('text-base font-semibold tracking-tight', selected && 'text-accent')}>{VEHICLES[id].label}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{VEHICLE_BLURB[id]}</p>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-1">
              {order === 0 && value.length > 1 && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground setup-pop">Main</span>
              )}
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors duration-300',
                  selected ? 'border-accent bg-accent' : 'border-border'
                )}
              >
                {selected && <Check className="w-3 h-3 text-accent-foreground setup-pop" strokeWidth={3} />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ModeStep({ value, terms, onChange }: { value: RideMode | null; terms: ExperienceTerms; onChange: (m: RideMode) => void }) {
  const options: { id: RideMode; title: string; subtitle: string; perks: string[]; Art: typeof SoloArt }[] = [
    {
      id: 'solo',
      title: 'Just me',
      subtitle: `Solo ${terms.rides}. No groups, no convoy screens.`,
      perks: [`One-tap ${terms.ride}`, 'Route planning up front', 'Rescue alerts to your Discord'],
      Art: SoloArt,
    },
    {
      id: 'group',
      title: 'My crew',
      subtitle: `Group ${terms.rides}. Convoys and voice chat come first.`,
      perks: ['Start or join a convoy from Home', 'Voice chat', 'Rescue alerts go to the leader'],
      Art: GroupArt,
    },
    {
      id: 'both',
      title: 'A bit of both',
      subtitle: `Solo ${terms.rides} and convoys, side by side.`,
      perks: ['Solo and convoy on Home'],
      Art: MixedArt,
    },
  ];
  return (
    <div role="radiogroup" className="space-y-3 stagger-in">
      {options.map(({ id, title, subtitle, perks, Art }, i) => (
        <ChoiceCard
          key={id}
          index={i}
          selected={value === id}
          onSelect={() => onChange(id)}
          title={title}
          subtitle={subtitle}
          perks={perks}
          art={<Art active={value === id} />}
        />
      ))}
    </div>
  );
}

export function StyleStep({ value, terms, onChange }: { value: RideStyle | null; terms: ExperienceTerms; onChange: (s: RideStyle) => void }) {
  return (
    <div role="radiogroup" className="space-y-2.5 stagger-in">
      {RIDE_STYLES.map((style, i) => {
        const selected = value === style.id;
        const Icon = style.icon;
        return (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              haptics.tick();
              onChange(style.id);
            }}
            style={{ ['--i' as string]: i }}
            className={cn(
              'pressable w-full flex items-center gap-4 p-4 rounded-3xl border text-left transition-[border-color,background-color,box-shadow] duration-300',
              selected
                ? 'border-accent bg-accent/[0.07] shadow-[0_10px_32px_-14px_hsl(var(--accent)/0.6)]'
                : 'border-border/50 bg-card/40 hover:border-border'
            )}
          >
            <div
              className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300',
                selected ? 'bg-accent text-accent-foreground scale-105' : 'bg-secondary text-muted-foreground'
              )}
            >
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-base font-semibold tracking-tight', selected && 'text-accent')}>{style.title(terms)}</p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">{style.subtitle(terms)}</p>
            </div>
            <div
              className={cn(
                'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-300',
                selected ? 'border-accent bg-accent' : 'border-border'
              )}
            >
              {selected && <Check className="w-3.5 h-3.5 text-accent-foreground setup-pop" strokeWidth={3} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
