import { Users, UserPlus, Wrench, History, BarChart3, Settings, Globe2, Radio, ShieldCheck, ShieldOff, Check, Minus, Route } from 'lucide-react';
import { useSettings } from '@/features/settings';
import { cn } from '@/lib/utils';
import { CARE_QUESTIONS, isCareOn } from '../../lib/questions';
import { deriveExperience } from '../../hooks/useExperience';
import type { ExperienceProfile } from '../../lib/profile';
import { VEHICLES } from '../../lib/vehicles';

/**
 * Miniature of the Home screen built from the user's answers, plus the
 * on/off ledger — so the effect of every choice is visible before they commit.
 */
export function ExperiencePreview({ profile }: { profile: ExperienceProfile }) {
  const { settings } = useSettings();
  const exp = deriveExperience(profile);
  const { VehicleIcon, terms, care } = exp;

  const nav = [
    ...(settings.garageEnabled ? [{ icon: Wrench, label: 'Garage' }] : []),
    { icon: History, label: 'History' },
    ...(settings.blacktopWorldEnabled ? [{ icon: Globe2, label: 'World' }] : []),
    { icon: BarChart3, label: 'Stats' },
    { icon: Settings, label: 'Settings' },
  ];
  const statCount = settings.speedFocusEnabled ? 4 : 3;

  return (
    <div className="space-y-5">
      <div className="flex gap-4 items-stretch">
        {/* Phone */}
        <div className="w-[136px] shrink-0 rounded-[26px] border-[3px] border-white/15 bg-background/80 p-2 flex flex-col gap-1.5 shadow-[0_20px_50px_-20px_hsl(var(--accent)/0.5)] animate-scale-in">
          <div className="flex items-center justify-between px-0.5">
            <div className="h-1.5 w-10 rounded-full bg-foreground/70" />
            {settings.radioEnabled && <Radio className="w-2.5 h-2.5 text-accent" />}
          </div>
          <div
            className={cn(
              'h-4 rounded-md border flex items-center gap-1 px-1',
              settings.autoRescueEnabled ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-warning/40 bg-warning/10'
            )}
          >
            {settings.autoRescueEnabled ? <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" /> : <ShieldOff className="w-2.5 h-2.5 text-warning" />}
            <div className={cn('h-1 w-10 rounded-full', settings.autoRescueEnabled ? 'bg-emerald-400/60' : 'bg-warning/60')} />
          </div>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${statCount}, minmax(0, 1fr))` }}>
            {Array.from({ length: statCount }, (_, i) => (
              <div key={i} className="h-3 rounded bg-card border border-border/40" />
            ))}
          </div>

          {/* Tiles — mirrors Home's layout for the chosen ride mode */}
          <div className="relative flex-1 min-h-[150px] flex flex-col gap-1">
            <div className="flex gap-1 flex-1">
              {exp.showGroup && <MiniTile icon={Users} label={profile.rideMode === 'group' ? 'Start Convoy' : 'Convoy'} accent />}
              {exp.showSolo && <MiniTile icon={VehicleIcon} label={profile.rideMode === 'solo' ? `Start ${terms.Ride}` : 'Solo'} accent />}
            </div>
            {exp.showGroup ? <MiniTile icon={UserPlus} label="Join" /> : <MiniTile icon={Route} label="Plan route" />}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-accent bg-background flex items-center justify-center">
              <Globe2 className="w-4 h-4 text-accent" />
            </div>
          </div>

          <div className="flex justify-around pt-1 border-t border-border/40">
            {nav.map(({ icon: Icon, label }) => (
              <Icon key={label} className="w-2.5 h-2.5 text-accent" />
            ))}
          </div>
        </div>

        {/* Headline facts */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 stagger-in">
          <Fact i={0} label="Main vehicle" value={exp.primary.label} icon={VehicleIcon} />
          {profile.vehicles.length > 1 && (
            <Fact i={1} label="Also" value={profile.vehicles.slice(1).map((v) => VEHICLES[v].label).join(', ')} />
          )}
          <Fact
            i={2}
            label="Home"
            value={profile.rideMode === 'solo' ? `Solo ${terms.rides}` : profile.rideMode === 'group' ? 'Convoys' : 'Solo + convoys'}
          />
          <Fact i={3} label="Big number" value={settings.speedFocusEnabled ? 'Live speed' : 'Distance'} />
          {exp.hasCar && <Fact i={4} label="Layout" value="Car display" />}
        </div>
      </div>

      {/* Ledger */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2 stagger-in">
        {CARE_QUESTIONS.filter((q) => !q.applies || q.applies(care)).map((q, i) => {
          const on = isCareOn(q, settings, care);
          return (
            <li key={q.id} style={{ ['--i' as string]: i }} className="flex items-center gap-2">
              <span
                className={cn(
                  'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                  on ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground'
                )}
              >
                {on ? <Check className="w-2.5 h-2.5" strokeWidth={3} /> : <Minus className="w-2.5 h-2.5" />}
              </span>
              <span className={cn('text-xs truncate', on ? 'text-foreground font-medium' : 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                {q.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Fact({ label, value, icon: Icon, i }: { label: string; value: string; icon?: React.ElementType; i: number }) {
  return (
    <div style={{ ['--i' as string]: i }} className="rounded-2xl frost px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold flex items-center gap-1.5 truncate">
        {Icon && <Icon className="w-4 h-4 text-accent shrink-0" />}
        {value}
      </p>
    </div>
  );
}

function MiniTile({ icon: Icon, label, accent }: { icon: React.ElementType; label: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        'flex-1 rounded-lg flex flex-col items-center justify-center gap-0.5 border animate-scale-in',
        accent ? 'border-accent text-accent' : 'border-border/40 bg-card/50 text-muted-foreground'
      )}
    >
      <Icon className="w-3 h-3" />
      <span className="text-[7px] font-semibold">{label}</span>
    </div>
  );
}
