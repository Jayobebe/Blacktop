import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ChevronRight, Smartphone, Share, MoreVertical, PlusSquare, Shield, AlertTriangle } from 'lucide-react';
import { SetupFlow, SetupShell, WelcomeScreen, useExperience } from '@/features/experience';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';

// consent → vehicles → mode → style → care deck → preview → name
const TOTAL_STEPS = 7;

type Step = 'landing' | 'consent' | 'setup' | 'profile';

export default function Onboarding() {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState<Step>('landing');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedAge, setAgreedAge] = useState(false);
  const [agreedSafety, setAgreedSafety] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const { createProfile } = useProfile();
  const { showGroup, terms } = useExperience();
  const navigate = useNavigate();

  const go = (next: Step, dir: 'forward' | 'back' = 'forward') => {
    setDirection(dir);
    setStep(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      const ok = await createProfile(name.trim());
      if (ok) {
        haptics.success();
        navigate('/');
      }
    } finally {
      setIsCreating(false);
    }
  };

  if (step === 'landing') {
    return <WelcomeScreen onStart={() => go('consent')} />;
  }

  if (step === 'consent') {
    const allAgreed = agreedTerms && agreedAge && agreedSafety;
    const items = [
      {
        checked: agreedAge,
        set: setAgreedAge,
        text: <>{tr("I'm at least 16 and licensed to operate a motor vehicle where I live.")}</>,
      },
      {
        checked: agreedSafety,
        set: setAgreedSafety,
        text: <>{tr("Blacktop isn't a safety device or racing tool. I ride at my own risk and won't use the app while moving.")}</>,
      },
      {
        checked: agreedTerms,
        set: setAgreedTerms,
        text: (
          <>
            {tr("I agree to the")}{" "}<Link to="/privacy" className="text-accent underline">{tr("Privacy Policy")}</Link>{" "}{tr("and")}{' '}
            <Link to="/terms" className="text-accent underline">{tr("Terms & Safety")}</Link>.
          </>
        ),
      },
    ];
    return (
      <SetupShell
        stepKey="consent"
        direction={direction}
        progress={{ current: 1, total: TOTAL_STEPS }}
        onBack={() => go('landing', 'back')}
        eyebrow="Before we start"
        title={tr("The ground rules.")}
        subtitle={tr("Short version: your data stays yours, and the road comes first.")}
        footer={
          <Button onClick={() => go('setup')} disabled={!allAgreed} className="w-full h-14 text-base font-semibold rounded-2xl touch-target">
            {allAgreed ? tr("Agree and continue") : tr("Tick all three to continue")}
            {allAgreed && <ChevronRight className="w-5 h-5 ml-1" />}
          </Button>
        }
      >
        <div className="space-y-3 stagger-in">
          <div style={{ ['--i' as string]: 0 }} className="frost rounded-[20px] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">{tr("Privacy-first")}</p>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>{tr("• Your rides, stats and garage are stored on your device")}</li>
              <li>{tr("• No sign-up, no ads, no tracking SDKs")}</li>
              <li>{tr("• Only features you turn on (convoys, Blacktop World, crews, card drops) share data")}</li>
              <li>{tr("• Live convoy data is deleted from the server when a ride ends")}</li>
              <li>{tr("• Voice is encrypted and never stored on a server")}</li>
            </ul>
          </div>

          <div style={{ ['--i' as string]: 1 }} className="bg-destructive/5 rounded-2xl p-4 border border-destructive/30 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <p className="text-xs font-semibold uppercase tracking-widest text-destructive">{tr("Ride safe")}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("Set up before you ride. Don't touch the app while moving. Speed and lean data are for information only. Obey local laws.")}
            </p>
          </div>

          {items.map((item, i) => (
            <label
              key={i}
              style={{ ['--i' as string]: i + 2 }}
              className={`pressable flex items-start gap-3 cursor-pointer rounded-2xl border p-3.5 ${item.checked ? 'border-accent/50 bg-accent/[0.08]' : 'frost'}`}
            >
              <Checkbox
                checked={item.checked}
                onCheckedChange={(v) => {
                  haptics.tick();
                  item.set(v === true);
                }}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground leading-relaxed">{item.text}</span>
            </label>
          ))}
        </div>
      </SetupShell>
    );
  }

  if (step === 'setup') {
    return (
      <SetupFlow
        progressOffset={1}
        progressTotal={TOTAL_STEPS}
        initialDirection={direction}
        startAtEnd={direction === 'back'}
        onExit={() => go('consent', 'back')}
        onDone={() => go('profile')}
        doneLabel="Looks good"
      />
    );
  }

  // Permissions step removed — features now request OS permissions at point-of-use
  // (start ride → location, unmute → mic, scan QR → camera, attach photo → files, etc.)

  return (
    <SetupShell
      stepKey="profile"
      direction={direction}
      progress={{ current: TOTAL_STEPS, total: TOTAL_STEPS }}
      onBack={() => go('setup', 'back')}
      eyebrow="Last thing"
      title={showGroup ? tr("What should your crew call you?") : tr("What should we call you?")}
      subtitle={showGroup ? tr("Other {0} see this name in convoys and voice chat.", [terms.riders]) : tr("Only you will see this, unless you join a convoy later.")}
      footer={
        <Button
          type="submit"
          form="profile-form"
          disabled={!name.trim() || isCreating}
          className="w-full h-14 text-base font-semibold rounded-2xl touch-target"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {tr("Setting up…")}
            </>
          ) : (
            <>
              {tr("Let's")}{" "}{terms.ride}
              <ChevronRight className="w-5 h-5 ml-1" />
            </>
          )}
        </Button>
      }
    >
      <form id="profile-form" onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="name" className="sr-only">
          {tr("Profile name")}
        </label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr("Your name")}
          className="h-16 text-2xl font-semibold rounded-2xl px-5 frost"
          maxLength={20}
          autoFocus
          autoComplete="nickname"
          disabled={isCreating}
        />
        <p className="text-xs text-muted-foreground px-1">
          {tr("No email, no password.")}{" "}{20 - name.length}{" "}{tr("characters left.")}
        </p>
      </form>

      {/* Install instructions, tucked away */}
      <div className="mt-8 rounded-[20px] frost overflow-hidden">
        <button
          type="button"
          onClick={() => setShowInstall((s) => !s)}
          className="w-full flex items-center gap-2 p-3.5 text-xs text-muted-foreground"
          aria-expanded={showInstall}
        >
          <Smartphone className="w-4 h-4" />
          <span className="font-medium flex-1 text-left">{tr("Install for the best experience")}</span>
          <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showInstall ? 'rotate-90' : ''}`} />
        </button>
        <div className={`grid transition-[grid-template-rows] duration-300 ease-spring ${showInstall ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <div className="px-3.5 pb-3.5 space-y-2">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground w-16">{tr("iPhone")}</span>
                <Share className="w-3 h-3" />{" "}{tr("Share")}
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <PlusSquare className="w-3 h-3" />{" "}{tr("Add to Home Screen")}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground w-16">{tr("Android")}</span>
                <MoreVertical className="w-3 h-3" />{" "}{tr("Menu")}
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                {tr("Install app")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SetupShell>
  );
}
