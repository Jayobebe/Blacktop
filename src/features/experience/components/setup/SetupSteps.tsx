import { User, Users, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import type { RideMode, RideStyle } from '../../lib/profile';
import { VEHICLES, VEHICLE_ORDER, type VehicleType } from '../../lib/vehicles';
import { RIDE_STYLES } from '../../lib/styles';
import type { ExperienceTerms } from '../../lib/terms';
import { ChoiceCard, IconTile, RadioDot } from './ChoiceCard';

const VEHICLE_BLURB: Record<VehicleType, string> = {
  motorcycle: 'Lean angle, chain care',
  car: 'Big-screen layout, G-force',
  bicycle: 'Pedal power, no fuss',
  ebike: 'Assisted and quick',
  escooter: 'Short hops around town',
};

/** Multi-select list. First pick becomes the main vehicle (icons, speed alerts, garage presets). */
export function VehicleStep({ value, onToggle }: { value: VehicleType[]; onToggle: (v: VehicleType) => void }) {
  return (
    <div className="frost rounded-[22px] overflow-hidden divide-y divide-white/[0.06] stagger-in" role="group" aria-label="Vehicles">
      {VEHICLE_ORDER.map((id, i) => {
        const info = VEHICLES[id];
        const order = value.indexOf(id);
        const selected = order !== -1;
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
            className={cn('pressable w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors', selected && 'bg-accent/[0.07]')}
          >
            <IconTile icon={info.icon} active={selected} />
            <div className="flex-1 min-w-0">
              <p className="text-[17px] font-semibold tracking-tight flex items-center gap-2">
                {info.label}
                {order === 0 && value.length > 1 && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-accent/15 text-accent setup-pop">
                    Main
                  </span>
                )}
              </p>
              <p className="text-[13px] text-muted-foreground">{VEHICLE_BLURB[id]}</p>
            </div>
            <RadioDot active={selected} />
          </button>
        );
      })}
    </div>
  );
}

export function ModeStep({ value, terms, onChange }: { value: RideMode | null; terms: ExperienceTerms; onChange: (m: RideMode) => void }) {
  const options: { id: RideMode; title: string; subtitle: string; perks: string[]; icon: typeof User }[] = [
    {
      id: 'solo',
      title: 'Just me',
      subtitle: `Solo ${terms.rides}. No groups, no convoy screens.`,
      perks: [`One-tap ${terms.ride}`, 'Route planning up front', 'Rescue alerts to your Discord'],
      icon: User,
    },
    {
      id: 'group',
      title: 'My crew',
      subtitle: `Group ${terms.rides}. Convoys and voice chat come first.`,
      perks: ['Start or join a convoy from Home', 'Voice chat', 'Rescue alerts go to the leader'],
      icon: Users,
    },
    {
      id: 'both',
      title: 'A bit of both',
      subtitle: `Solo ${terms.rides} and convoys, side by side.`,
      perks: ['Solo and convoy on Home'],
      icon: Sparkles,
    },
  ];
  return (
    <div role="radiogroup" className="space-y-2.5 stagger-in">
      {options.map(({ id, title, subtitle, perks, icon }, i) => (
        <ChoiceCard
          key={id}
          index={i}
          selected={value === id}
          onSelect={() => onChange(id)}
          title={title}
          subtitle={subtitle}
          perks={perks}
          icon={icon}
        />
      ))}
    </div>
  );
}

export function StyleStep({ value, terms, onChange }: { value: RideStyle | null; terms: ExperienceTerms; onChange: (s: RideStyle) => void }) {
  return (
    <div role="radiogroup" className="space-y-2.5 stagger-in">
      {RIDE_STYLES.map((style, i) => (
        <ChoiceCard
          key={style.id}
          index={i}
          selected={value === style.id}
          onSelect={() => onChange(style.id)}
          title={style.title(terms)}
          subtitle={style.subtitle(terms)}
          icon={style.icon}
        />
      ))}
    </div>
  );
}
