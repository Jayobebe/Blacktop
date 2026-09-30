import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Building2, ChevronLeft, ChevronRight, Mail, Pause, Play, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { useSettings } from '@/features/settings';
import {
  ENTERPRISE_TIERS,
  TierShowcase,
  enquiryMailto,
  tierInfo,
  type EnterpriseTier,
} from '@/features/enterprise';
import { tierDemo, type DemoScreen, type DemoTone, type DemoUnits } from '@/features/enterprise/demo';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { isThermal } from '@/lib/thermal';
import { cn } from '@/lib/utils';

/** How long each step stays up while the walkthrough plays. */
const STEP_MS = 6000;

const TONE: Record<DemoTone, string> = {
  accent: 'text-accent',
  ok: 'text-emerald-400',
  warn: 'text-warning',
  bad: 'text-destructive',
  muted: 'text-muted-foreground',
};
const CHIP: Record<DemoTone, string> = {
  accent: 'bg-accent/15 text-accent',
  ok: 'bg-emerald-500/15 text-emerald-400',
  warn: 'bg-warning/15 text-warning',
  bad: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

/**
 * One package's demo page (from its card on the Enterprise Doorway): the
 * package scene, then a step-by-step walkthrough for the business and for its
 * customers, each step shown on a phone screen. Back returns to the Doorway
 * with the package still open.
 */
export default function EnterpriseDemo() {
  const { tier: param } = useParams();
  const tier = ENTERPRISE_TIERS.find((t) => t === param) as EnterpriseTier | undefined;
  if (!tier) return <Navigate to="/" replace />;
  return <TierDemoPage tier={tier} />;
}

function TierDemoPage({ tier }: { tier: EnterpriseTier }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  // Opened from the Doorway, the entry behind this one is Home showing it with
  // this package open; opened directly (a shared link), go there instead.
  const back = () =>
    location.key !== 'default' ? navigate(-1) : navigate('/', { replace: true, state: { deck: 'doorway', tier } });
  const info = tierInfo(tier);

  const units = useMemo<DemoUnits>(() => {
    const miles = settings.distanceUnit !== 'km';
    return {
      speed: (kmh) => (settings.speedUnit === 'kph' ? `${Math.round(kmh)} km/h` : `${Math.round(kmh / 1.60934)} mph`),
      near: (m) => (miles ? `${Math.round((m * 1.09361) / 10) * 10} yd` : `${Math.round(m / 10) * 10} m`),
      far: (km) => {
        const v = miles ? km / 1.60934 : km;
        const n = v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();
        return `${n} ${miles ? 'mi' : 'km'}`;
      },
    };
  }, [settings.speedUnit, settings.distanceUnit]);
  const demo = useMemo(() => tierDemo(tier, units), [tier, units]);

  const [side, setSide] = useState<'business' | 'customer'>('business');
  const flow = (side === 'customer' && demo.customer) || demo.business;
  const [step, setStep] = useState(0);
  // Plays on its own unless the rider asked for less motion (or thermal mode).
  const [playing, setPlaying] = useState(
    () => !isThermal() && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % flow.steps.length), STEP_MS);
    return () => window.clearTimeout(id);
  }, [playing, step, flow.steps.length]);

  const go = (i: number) => {
    haptics.tick();
    setPlaying(false);
    setStep((i + flow.steps.length) % flow.steps.length);
  };
  // Clamped: the two sides have different numbers of steps.
  const current = flow.steps[Math.min(step, flow.steps.length - 1)];

  return (
    <div className="min-h-dvh safe-top safe-bottom">
      <div className="px-4 max-w-4xl mx-auto">
        <PageHeader
          sticky
          title={info.name}
          subtitle={tr("Demo")}
          onBack={back}
          backLabel={tr("Go back")}
        />
      </div>

      <main className="max-w-4xl mx-auto px-4 pb-8 flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <TierShowcase tier={tier} />
          <div>
            <p className="text-sm font-semibold text-foreground">{info.tagline}</p>
            <p className="text-xs text-muted-foreground">{info.target}</p>
          </div>
        </section>

        {/* Whose side of the story (packages with one) */}
        {demo.customer && (<div role="tablist" aria-label={tr("Walkthrough")} className="grid grid-cols-2 gap-2">
          {([
            { id: 'business', label: tr("For the business"), Icon: Building2 },
            { id: 'customer', label: tr("For customers"), Icon: Users },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={side === id}
              onClick={() => {
                haptics.tick();
                setSide(id);
                setStep(0);
              }}
              className={cn(
                'pressable touch-target rounded-2xl border-2 px-3 py-2 text-left transition-colors',
                side === id ? 'border-accent bg-accent/10' : 'border-border/40 bg-card/50',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="w-4 h-4 text-accent shrink-0" />
                {label}
              </span>
              <span className="block text-[11px] text-muted-foreground truncate">{demo[id].who}</span>
            </button>
          ))}
        </div>)}

        <section className="grid gap-5 md:grid-cols-[minmax(0,300px)_1fr] md:items-start">
          {/* The phone, showing the current step */}
          <div className="flex flex-col items-center gap-3">
            <PhoneScreen org={demo.org} screen={current.screen} stepKey={`${side}-${step}`} />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl" onClick={() => go(step - 1)} aria-label={tr("Previous step")}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-xl"
                onClick={() => {
                  haptics.tick();
                  setPlaying((p) => !p);
                }}
                aria-label={playing ? tr("Pause") : tr("Play")}
              >
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl" onClick={() => go(step + 1)} aria-label={tr("Next step")}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* The steps, in order: tap one to show it */}
          <ol className="flex flex-col gap-2">
            {flow.steps.map((s, i) => {
              const on = i === step;
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={on ? 'step' : undefined}
                    className={cn(
                      'w-full text-left rounded-2xl border p-3 flex gap-3 transition-colors',
                      on ? 'border-accent bg-accent/10' : 'border-border/40 bg-card/50',
                    )}
                  >
                    <span
                      className={cn(
                        'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-mono font-bold',
                        on ? 'bg-accent text-accent-foreground' : 'bg-accent/15 text-accent',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{s.title}</span>
                      <span className={cn('block text-xs text-muted-foreground', !on && 'line-clamp-1')}>{s.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <Button asChild variant="outline" className="w-full h-12 rounded-xl">
          <a href={enquiryMailto(tier)} onClick={() => haptics.light()}>
            <Mail className="w-4 h-4 mr-2" />
            {tr("Contact sales about {0}", [info.name])}
          </a>
        </Button>
      </main>
    </div>
  );
}

/** A phone drawn in the app's own look, showing one step's screen. */
function PhoneScreen({ org, screen, stepKey }: { org: string; screen: DemoScreen; stepKey: string }) {
  return (
    <div
      className="no-frost w-full max-w-[280px] aspect-[5/7] rounded-[2.25rem] border-2 border-border bg-background/90 p-2 shadow-glow"
      aria-live="polite"
    >
      <div className="h-full rounded-[1.8rem] border border-border/40 bg-card/40 px-4 pt-3 pb-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span>9:41</span>
          <span className="w-16 h-4 rounded-full bg-background" aria-hidden="true" />
          <span>5G</span>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-widest text-accent font-semibold truncate">{org}</p>
        <div key={stepKey} className="flex-1 flex flex-col animate-fade-in">
          <h3 className="mt-1 text-base font-semibold leading-tight text-foreground">{screen.title}</h3>
          <span className={cn('mt-2 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold', CHIP[screen.status.tone])}>
            {screen.status.label}
          </span>
          <ul className="mt-4 flex flex-col gap-2 stagger-in">
            {screen.rows.map((r) => (
              <li key={r.label} className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/50 px-2.5 py-2">
                <r.icon className={cn('w-4 h-4 shrink-0', TONE[r.tone ?? 'accent'])} />
                <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">{r.label}</span>
                {r.value && <span className={cn('text-xs font-mono font-semibold shrink-0', r.tone ? TONE[r.tone] : 'text-foreground')}>{r.value}</span>}
              </li>
            ))}
          </ul>
          <div className="flex-1" />
          {screen.action && (
            <div className="rounded-xl bg-accent text-accent-foreground text-center text-sm font-semibold py-2.5" aria-hidden="true">
              {screen.action}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
