import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Users, UserPlus, History, BarChart3, Settings, Play, 
  Copy, Check, Mic, MicOff, Crown, User, Navigation, 
  Square, Trophy, ArrowRight, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Demo step definitions
type DemoStep = 
  | 'welcome'
  | 'onboarding' 
  | 'home'
  | 'create-convoy'
  | 'lobby'
  | 'lobby-destination'
  | 'active-ride'
  | 'ride-end'
  | 'badge-summary'
  | 'stats'
  | 'complete';

const STEP_TITLES: Record<DemoStep, string> = {
  'welcome': 'Welcome to Blacktop',
  'onboarding': 'Create Your Profile',
  'home': 'Home Dashboard',
  'create-convoy': 'Start a Convoy',
  'lobby': 'Convoy Lobby',
  'lobby-destination': 'Set Destination',
  'active-ride': 'Active Ride',
  'ride-end': 'Ending the Ride',
  'badge-summary': 'Badge Awards',
  'stats': 'Your Statistics',
  'complete': 'Demo Complete',
};

export default function DemoRide() {
  const navigate = useNavigate();
  const [step, setStep] = useState<DemoStep>('welcome');
  const [demoName, setDemoName] = useState('');
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);

  // Simulate ride when on active-ride step
  useEffect(() => {
    if (step !== 'active-ride') return;
    
    const interval = setInterval(() => {
      setSpeed(prev => {
        const newSpeed = Math.max(0, Math.min(95, prev + (Math.random() - 0.4) * 15));
        setMaxSpeed(m => Math.max(m, newSpeed));
        return Math.round(newSpeed);
      });
      setDistance(prev => prev + 0.02);
      setDuration(prev => prev + 1);
    }, 500);

    return () => clearInterval(interval);
  }, [step]);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nextStep = () => {
    const steps: DemoStep[] = [
      'welcome', 'onboarding', 'home', 'create-convoy', 'lobby', 
      'lobby-destination', 'active-ride', 'ride-end', 'badge-summary', 
      'stats', 'complete'
    ];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const exitDemo = () => navigate('/');

  // Progress indicator
  const steps: DemoStep[] = [
    'welcome', 'onboarding', 'home', 'create-convoy', 'lobby', 
    'lobby-destination', 'active-ride', 'ride-end', 'badge-summary', 
    'stats', 'complete'
  ];
  const progress = ((steps.indexOf(step) + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Demo Header */}
      <div className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="h-1 bg-secondary">
          <div 
            className="h-full bg-accent transition-all duration-500 ease-spring" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
            Demo Mode
          </span>
          <span className="text-sm font-medium">
            {STEP_TITLES[step]}
          </span>
          <Button variant="ghost" size="sm" onClick={exitDemo} className="text-muted-foreground hover:text-foreground">
            Exit
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 pt-20 pb-28">
        {/* Welcome Screen */}
        {step === 'welcome' && (
          <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-accent/15 flex items-center justify-center mb-8 animate-float">
              <Play className="w-10 h-10 text-accent" />
            </div>
            <h1 className="text-3xl font-semibold text-center mb-3 tracking-tight">
              Interactive Demo
            </h1>
            <p className="text-muted-foreground text-center max-w-sm mb-10">
              Experience all of Blacktop's features in this guided walkthrough
            </p>
            <div className="space-y-4 text-sm text-muted-foreground max-w-xs">
              {['Create your profile', 'Start a convoy', 'Track your ride', 'Earn badges'].map((item, i) => (
                <p key={i} className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                  <span className="w-6 h-6 rounded-lg bg-accent/15 flex items-center justify-center">
                    <ChevronRight className="w-4 h-4 text-accent" />
                  </span>
                  {item}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Onboarding */}
        {step === 'onboarding' && (
          <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-full max-w-sm">
              <h1 className="text-4xl font-semibold text-center mb-2 tracking-tight">
                BLACKTOP
              </h1>
              <p className="text-muted-foreground text-center mb-12">
                Your ride companion
              </p>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Profile Name
                  </label>
                  <Input
                    value={demoName}
                    onChange={(e) => setDemoName(e.target.value)}
                    placeholder="Enter your name"
                    className="h-14 text-lg"
                  />
                </div>
                <div className="p-4 bg-accent/10 border border-accent/20 rounded-2xl">
                  <p className="text-sm text-accent flex items-start gap-3">
                    <span className="text-lg">💡</span>
                    <span>No email or password required — just your name to get started</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Home */}
        {step === 'home' && (
          <div className="p-5 animate-fade-in">
            <header className="flex items-center justify-between mb-6">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">Welcome back</p>
                <h1 className="text-2xl font-semibold tracking-tight">{demoName || 'Rider'}</h1>
              </div>
              <button className="p-3 rounded-2xl bg-secondary/50 border border-border/30">
                <Settings className="w-5 h-5 text-muted-foreground" />
              </button>
            </header>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: 'Total Rides', value: '12' },
                { label: 'Distance', value: '348', unit: 'mi' },
                { label: 'Top Speed', value: '92', unit: 'mph' },
                { label: 'Time', value: '8:24:30' },
              ].map((stat, i) => (
                <div key={i} className="bg-card/50 backdrop-blur-sm rounded-2xl p-4 border border-border/30 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1.5">{stat.label}</p>
                  <p className="text-2xl font-mono font-semibold">{stat.value}{stat.unit && <span className="text-sm text-muted-foreground/70 ml-1 font-normal">{stat.unit}</span>}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="h-28 bg-accent hover:bg-accent/90 text-accent-foreground rounded-3xl flex flex-col items-center justify-center transition-all">
                <div className="w-12 h-12 rounded-2xl bg-accent-foreground/10 flex items-center justify-center mb-2">
                  <Users className="w-6 h-6" />
                </div>
                <span className="font-semibold tracking-tight">Start Convoy</span>
              </div>
              <div className="h-24 bg-card/50 hover:bg-secondary border border-border/40 rounded-3xl flex flex-col items-center justify-center transition-all">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-2">
                  <UserPlus className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="font-medium tracking-tight">Join Convoy</span>
              </div>
            </div>

            <div className="flex justify-around mt-6 pt-4 border-t border-border/30">
              {[
                { icon: History, label: 'History' },
                { icon: BarChart3, label: 'Stats' },
                { icon: Settings, label: 'Settings' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 p-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/80 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Convoy */}
        {step === 'create-convoy' && (
          <div className="p-5 animate-fade-in">
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-3xl bg-accent/15 flex items-center justify-center mx-auto mb-5">
                <Users className="w-8 h-8 text-accent" />
              </div>
              <h1 className="text-2xl font-semibold mb-2 tracking-tight">Convoy Created!</h1>
              <p className="text-muted-foreground">Share this code with your group</p>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-3xl p-8 text-center mb-6">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-3">Convoy Code</p>
              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-4 mx-auto group"
              >
                <span className="font-mono text-4xl font-semibold tracking-[0.2em]">XK7M9P</span>
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center group-hover:bg-muted transition-colors">
                  {copied ? (
                    <Check className="w-5 h-5 text-accent" />
                  ) : (
                    <Copy className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </button>
            </div>

            <div className="p-4 bg-accent/10 border border-accent/20 rounded-2xl">
              <p className="text-sm text-accent flex items-start gap-3">
                <span className="text-lg">💡</span>
                <span>Others can join using this code from "Join Convoy" on the home screen</span>
              </p>
            </div>
          </div>
        )}

        {/* Lobby */}
        {step === 'lobby' && (
          <div className="p-5 animate-fade-in">
            <header className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-2">Convoy Code</p>
                <div className="flex items-center gap-3 bg-card/50 border border-border/30 rounded-2xl px-4 py-2.5">
                  <span className="font-mono text-xl font-semibold tracking-[0.15em]">XK7M9P</span>
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
                  !isMuted ? "bg-accent shadow-glow" : "bg-secondary/80 border border-border/30"
                )}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6 text-accent-foreground" />}
              </button>
            </header>

            <div className="mb-5">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-3">Riders (4)</p>
              <div className="space-y-2.5">
                {[
                  { name: demoName || 'You', isLeader: true },
                  { name: 'Marcus', isLeader: false },
                  { name: 'Sarah', isLeader: false },
                  { name: 'Jake', isLeader: false },
                ].map((member, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-3 p-3 rounded-2xl border transition-all animate-slide-up",
                    member.isLeader ? "bg-accent/10 border-accent/20" : "bg-card/50 border-border/30"
                  )} style={{ animationDelay: `${i * 75}ms` }}>
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      member.isLeader ? "bg-accent/20" : "bg-secondary"
                    )}>
                      {member.isLeader ? <Crown className="w-5 h-5 text-accent" /> : <User className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className={cn("font-medium text-sm", member.isLeader && "text-accent")}>{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.isLeader ? 'Leader' : 'Rider'}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground bg-secondary/80 px-3 py-1.5 rounded-full">Waiting</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-accent/10 border border-accent/20 rounded-2xl">
              <p className="text-sm text-accent flex items-start gap-3">
                <span className="text-lg">💡</span>
                <span>As leader, you control the destination. Others will follow your navigation.</span>
              </p>
            </div>
          </div>
        )}

        {/* Lobby with Destination */}
        {step === 'lobby-destination' && (
          <div className="p-5 animate-fade-in">
            <header className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-2">Convoy Code</p>
                <div className="flex items-center gap-3 bg-card/50 border border-border/30 rounded-2xl px-4 py-2.5">
                  <span className="font-mono text-xl font-semibold tracking-[0.15em]">XK7M9P</span>
                </div>
              </div>
              <button className="w-14 h-14 rounded-2xl flex items-center justify-center bg-secondary/80 border border-border/30">
                <MicOff className="w-6 h-6" />
              </button>
            </header>

            <div className="mb-5">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-3">Destination</p>
              <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center">
                  <Navigation className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-accent">Mountain View Diner</p>
                  <p className="text-xs text-muted-foreground">1234 Highway 1, Mountain View</p>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-3">Riders (4)</p>
              <div className="space-y-2.5">
                {[
                  { name: demoName || 'You', isLeader: true, ready: true },
                  { name: 'Marcus', isLeader: false, ready: true },
                  { name: 'Sarah', isLeader: false, ready: true },
                  { name: 'Jake', isLeader: false, ready: false },
                ].map((member, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-3 p-3 rounded-2xl border",
                    member.isLeader ? "bg-accent/10 border-accent/20" : "bg-card/50 border-border/30"
                  )}>
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      member.isLeader ? "bg-accent/20" : "bg-secondary"
                    )}>
                      {member.isLeader ? <Crown className="w-5 h-5 text-accent" /> : <User className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className={cn("font-medium text-sm", member.isLeader && "text-accent")}>{member.name}</p>
                    </div>
                    {member.ready ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-accent bg-accent/15 px-3 py-1.5 rounded-full">
                        <Navigation className="w-3 h-3" /> Ready
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground bg-secondary/80 px-3 py-1.5 rounded-full">Waiting</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Waiting for riders (3/4)
            </div>
          </div>
        )}

        {/* Active Ride */}
        {step === 'active-ride' && (
          <div className="p-5 animate-fade-in">
            <div className="flex items-center justify-center gap-3 mb-8">
              <span className="flex items-center gap-2 text-accent text-xs font-medium px-4 py-2 bg-accent/15 rounded-full">
                <Users className="w-4 h-4" /> LEADER
              </span>
              <span className="text-muted-foreground text-xs">Ride Active</span>
            </div>

            <div className="text-center mb-10">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-3">Current Speed</p>
              <div className={cn(
                "font-mono text-8xl font-semibold transition-all tracking-tight",
                speed > 80 && "text-warning",
                speed > 90 && "text-destructive"
              )}>
                {speed}
              </div>
              <p className="text-muted-foreground text-base mt-1">mph</p>
            </div>

            <div className="flex justify-center gap-10 mb-10">
              {[
                { label: 'Distance', value: distance.toFixed(1), unit: 'mi' },
                { label: 'Duration', value: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` },
                { label: 'Max', value: Math.round(maxSpeed).toString() },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1.5">{stat.label}</p>
                  <p className="font-mono text-xl font-semibold">{stat.value}{stat.unit && <span className="text-sm text-muted-foreground/70 ml-1 font-normal">{stat.unit}</span>}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-5">
              <button className="w-14 h-14 rounded-2xl bg-secondary/80 border border-border/30 flex items-center justify-center">
                <Navigation className="w-6 h-6 text-muted-foreground" />
              </button>
              <button className={cn(
                "w-20 h-20 rounded-3xl flex items-center justify-center transition-all",
                !isMuted ? "bg-accent shadow-glow" : "bg-secondary/80 border border-border/30"
              )} onClick={() => setIsMuted(!isMuted)}>
                {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8 text-accent-foreground" />}
              </button>
              <button className="w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center">
                <Users className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Ride End */}
        {step === 'ride-end' && (
          <div className="p-5 animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold mb-2 tracking-tight">End Ride?</h2>
              <p className="text-muted-foreground">This will end the ride for all convoy members</p>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-3xl p-6 mb-6">
              <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-5">Ride Summary</h3>
              <div className="grid grid-cols-2 gap-5">
                {[
                  { label: 'Distance', value: `${distance.toFixed(1)} mi` },
                  { label: 'Duration', value: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` },
                  { label: 'Top Speed', value: `${Math.round(maxSpeed)} mph` },
                  { label: 'Avg Speed', value: `${Math.round(maxSpeed * 0.6)} mph` },
                ].map((stat, i) => (
                  <div key={i}>
                    <p className="text-muted-foreground text-xs mb-1">{stat.label}</p>
                    <p className="font-mono text-2xl font-semibold">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full h-14 text-base font-semibold bg-destructive hover:bg-destructive/90 rounded-2xl">
              <Square className="w-5 h-5 mr-2" /> END RIDE
            </Button>
          </div>
        )}

        {/* Badge Summary */}
        {step === 'badge-summary' && (
          <div className="p-5 animate-fade-in">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center">
                <Trophy className="w-7 h-7 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Ride Complete</h2>
                <p className="text-sm text-muted-foreground">Badge Awards</p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { type: 'speed-demon', emoji: '⚡', label: 'Speed Demon', name: demoName || 'You', color: 'yellow' },
                { type: 'journeyman', emoji: '🛣️', label: 'Journeyman', name: demoName || 'You', color: 'blue' },
                { type: 'rocksteady', emoji: '🪨', label: 'Rocksteady', name: demoName || 'You', color: 'stone' },
              ].map((badge, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-4 p-5 rounded-2xl border animate-slide-up",
                    badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/20",
                    badge.color === 'blue' && "bg-blue-500/10 border-blue-500/20",
                    badge.color === 'stone' && "bg-stone-500/10 border-stone-500/20"
                  )}
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center text-3xl",
                    badge.color === 'yellow' && "bg-yellow-500/20",
                    badge.color === 'blue' && "bg-blue-500/20",
                    badge.color === 'stone' && "bg-stone-500/20"
                  )}>
                    {badge.emoji}
                  </div>
                  <div className="flex-1">
                    <p className={cn(
                      "font-semibold text-lg",
                      badge.color === 'yellow' && "text-yellow-400",
                      badge.color === 'blue' && "text-blue-400",
                      badge.color === 'stone' && "text-stone-400"
                    )}>
                      {badge.label}
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Crown className="w-4 h-4 text-accent" />
                      <span>{badge.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {step === 'stats' && (
          <div className="p-5 animate-fade-in">
            <h1 className="text-2xl font-semibold mb-6 tracking-tight">Statistics</h1>

            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-accent" />
                </div>
                <h2 className="text-base font-semibold">Convoy Badges</h2>
                <span className="ml-auto text-sm text-muted-foreground">6 earned</span>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {[
                  { emoji: '⚡', count: 3, label: 'Speed Demon', color: 'yellow' },
                  { emoji: '🛣️', count: 2, label: 'Journeyman', color: 'blue' },
                  { emoji: '🪨', count: 1, label: 'Rocksteady', color: 'stone' },
                ].map((badge, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col items-center p-4 rounded-2xl border",
                      badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/20",
                      badge.color === 'blue' && "bg-blue-500/10 border-blue-500/20",
                      badge.color === 'stone' && "bg-stone-500/10 border-stone-500/20"
                    )}
                  >
                    <span className="text-3xl mb-2">{badge.emoji}</span>
                    <span className={cn(
                      "font-mono text-2xl font-semibold",
                      badge.color === 'yellow' && "text-yellow-400",
                      badge.color === 'blue' && "text-blue-400",
                      badge.color === 'stone' && "text-stone-400"
                    )}>
                      {badge.count}
                    </span>
                    <span className={cn(
                      "text-[10px] font-medium text-center mt-1",
                      badge.color === 'yellow' && "text-yellow-400",
                      badge.color === 'blue' && "text-blue-400",
                      badge.color === 'stone' && "text-stone-400"
                    )}>
                      {badge.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {[
                { emoji: '🏍️', label: 'Total Rides', value: '13', unit: 'rides' },
                { emoji: '📍', label: 'Total Distance', value: '352', unit: 'mi' },
                { emoji: '⏱️', label: 'Time Riding', value: '8:35:45', unit: '' },
                { emoji: '🚀', label: 'Top Speed', value: Math.round(maxSpeed).toString(), unit: 'mph' },
              ].map((stat, i) => (
                <div key={i} className="bg-card/50 backdrop-blur-sm rounded-2xl p-4 border border-border/30 flex items-center gap-4 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="text-2xl">{stat.emoji}</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                    <p className="font-mono text-2xl font-semibold">
                      {stat.value}
                      {stat.unit && <span className="text-sm text-muted-foreground/70 ml-1 font-normal">{stat.unit}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Complete */}
        {step === 'complete' && (
          <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-accent/15 flex items-center justify-center mb-8">
              <Check className="w-10 h-10 text-accent" />
            </div>
            <h1 className="text-3xl font-semibold text-center mb-3 tracking-tight">
              Demo Complete!
            </h1>
            <p className="text-muted-foreground text-center max-w-sm mb-10">
              You've seen all of Blacktop's features. Ready to start your own ride?
            </p>
            <Button onClick={exitDemo} className="h-14 px-10 text-base font-semibold rounded-2xl">
              Get Started <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      {step !== 'complete' && (
        <div className="fixed bottom-0 left-0 right-0 p-5 glass">
          <Button onClick={nextStep} className="w-full h-14 text-base font-semibold rounded-2xl">
            {step === 'welcome' ? 'Start Demo' : 'Continue'} <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
