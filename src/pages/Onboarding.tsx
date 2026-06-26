import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ChevronRight, Smartphone, Share, MoreVertical, PlusSquare, Shield, AlertTriangle, MapPin, Mic, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'landing' | 'consent' | 'profile';

export default function Onboarding() {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [step, setStep] = useState<Step>('landing');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedAge, setAgreedAge] = useState(false);
  const [agreedSafety, setAgreedSafety] = useState(false);
  const { createProfile } = useProfile();
  const navigate = useNavigate();

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await createProfile(name.trim());
      navigate('/');
    } finally {
      setIsCreating(false);
    }
  };


  if (step === 'landing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 safe-top safe-bottom gap-8">
        {/* Hero */}
        <div className="text-center max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-3">Blacktop</p>
          <h1 className="text-3xl font-semibold tracking-tight leading-tight mb-3">
            GPS convoy riding,<br />finally connected.
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Live tracking, voice chat, crash rescue.<br />No account, no subscription.
          </p>
        </div>

        {/* Feature list */}
        <div className="w-full max-w-sm space-y-3">
          {[
            { icon: MapPin, label: 'Live convoy tracking', desc: "See every rider's position in real-time" },
            { icon: Mic, label: 'In-ride voice chat', desc: 'Peer-to-peer, never recorded' },
            { icon: AlertTriangle, label: 'Crash rescue', desc: 'Auto-detects a fall, pings your group' },
            { icon: BarChart2, label: 'Ride stats & lean angle', desc: 'Every run logged on-device, privately' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-4 bg-card/50 rounded-2xl p-4 border border-border/50">
              <div className="mt-0.5 rounded-lg bg-accent/10 p-2">
                <Icon className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Privacy badge */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20">
          <Shield className="w-4 h-4 text-accent" />
          <span className="text-xs text-accent font-medium">Privacy-first · No ads · No tracking</span>
        </div>

        {/* CTAs */}
        <div className="w-full max-w-sm space-y-3">
          <Button
            onClick={() => setStep('consent')}
            className="w-full h-14 text-base font-semibold rounded-2xl touch-target"
          >
            Ride Free — No Account Needed
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
          <div className="text-center">
            <Link to="/demo" className="text-sm text-accent underline-offset-4 hover:underline">
              See it in action →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'consent') {
    const allAgreed = agreedTerms && agreedAge && agreedSafety;
    return (
      <div className="h-screen max-h-screen overflow-auto flex flex-col items-center justify-center p-4 safe-top safe-bottom gap-5">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight mb-2">BLACKTOP</h1>
          <p className="text-muted-foreground text-sm">Before we set you up</p>
        </div>

        <div className="w-full max-w-sm space-y-4">
          {/* Privacy summary */}
          <div className="bg-card/50 rounded-2xl p-4 border border-border/50 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">Privacy-first</p>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• Your rides, stats and garage stay on your device</li>
              <li>• No accounts, no ads, no analytics, no tracking</li>
              <li>• Live convoy data is server-burned the moment a ride ends</li>
              <li>• Voice is peer-to-peer and never recorded</li>
            </ul>
          </div>

          {/* Safety summary */}
          <div className="bg-destructive/5 rounded-2xl p-4 border border-destructive/30 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <p className="text-xs font-semibold uppercase tracking-widest text-destructive">Ride safe</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Set up before you ride. Don't interact with the app in motion. Speed
              and lean data are informational only — obey local laws.
            </p>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agreedAge}
                onCheckedChange={(v) => setAgreedAge(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground leading-relaxed">
                I'm at least 16 years old and licensed to operate a motor vehicle
                in my jurisdiction.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agreedSafety}
                onCheckedChange={(v) => setAgreedSafety(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground leading-relaxed">
                I understand Blacktop is not a safety device or racing tool. I ride
                at my own risk and won't interact with the app while in motion.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agreedTerms}
                onCheckedChange={(v) => setAgreedTerms(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground leading-relaxed">
                I have read and agree to the{' '}
                <Link to="/privacy" className="text-accent underline">Privacy Policy</Link>
                {' '}and{' '}
                <Link to="/terms" className="text-accent underline">Terms & Safety</Link>.
              </span>
            </label>
          </div>

          <Button
            onClick={() => setStep('profile')}
            disabled={!allAgreed}
            className="w-full h-12 text-base font-semibold rounded-2xl touch-target"
          >
            Continue
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // Permissions step removed — features now request OS permissions at point-of-use
  // (start ride → location, unmute → mic, scan QR → camera, attach photo → files, etc.)


  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col landscape:flex-row items-center justify-center p-4 landscape:p-3 safe-top safe-bottom gap-6 landscape:gap-8">
      {/* Branding - left side in landscape */}
      <div className="text-center landscape:text-left landscape:flex-1 landscape:max-w-xs">
        <h1 className="text-5xl landscape:text-4xl font-semibold tracking-tight mb-3">
          BLACKTOP
        </h1>
        <p className="text-muted-foreground text-sm mb-4">
          Ride logging & convoy communication
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs text-accent font-medium">No account required</span>
        </div>
      </div>

      {/* Form - right side in landscape */}
      <div className="w-full max-w-sm landscape:flex-1 landscape:max-w-xs">

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label htmlFor="name" className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              Profile Name
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="h-14 text-lg"
              maxLength={20}
              autoFocus
              disabled={isCreating}
            />
          </div>

          <Button
            type="submit"
            disabled={!name.trim() || isCreating}
            className="w-full h-14 text-base font-semibold rounded-2xl touch-target"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              'Get Started'
            )}
          </Button>
        </form>

        <div className="text-center mt-4 landscape:mt-2 px-4 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your data stays on your device. No cloud sync, no tracking, no ads.
          </p>
          <p className="text-[10px] text-muted-foreground/60 landscape:hidden">
            Blacktop is a ride logging tool, not a racing app.
          </p>
        </div>

        {/* Install instructions - always show on onboarding */}
        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Smartphone className="w-3.5 h-3.5" />
            <span className="font-medium">Install for the best experience</span>
          </div>
          
          {/* iOS Instructions */}
          <div className="bg-card/50 rounded-lg p-2.5 border border-border/50">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">iPhone / iPad</p>
            <div className="flex items-center gap-2 text-[11px] text-foreground">
              <span className="flex items-center gap-1">
                <Share className="w-3 h-3" /> Tap Share
              </span>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="flex items-center gap-1">
                <PlusSquare className="w-3 h-3" /> Add to Home Screen
              </span>
            </div>
          </div>

          {/* Android Instructions */}
          <div className="bg-card/50 rounded-lg p-2.5 border border-border/50">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Android</p>
            <div className="flex items-center gap-2 text-[11px] text-foreground">
              <span className="flex items-center gap-1">
                <MoreVertical className="w-3 h-3" /> Tap Menu
              </span>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span>Install app / Add to Home</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
