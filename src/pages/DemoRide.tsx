import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Users, UserPlus, History, BarChart3, Settings, Play, 
  Copy, Check, Mic, MicOff, Crown, User, Navigation, 
  Square, Gauge, Route, Trophy, ArrowRight, ChevronRight,
  Zap, Map, Mountain
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
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-accent transition-all duration-500" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            Demo Mode
          </span>
          <span className="text-sm font-medium">
            {STEP_TITLES[step]}
          </span>
          <Button variant="ghost" size="sm" onClick={exitDemo}>
            Exit
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 pt-16 pb-24">
        {/* Welcome Screen */}
        {step === 'welcome' && (
          <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mb-6">
              <Play className="w-10 h-10 text-accent" />
            </div>
            <h1 className="text-3xl font-display font-bold text-center mb-2">
              Interactive Demo
            </h1>
            <p className="text-muted-foreground text-center max-w-sm mb-8">
              Experience all of Blacktop's features in this guided walkthrough
            </p>
            <div className="space-y-3 text-sm text-muted-foreground max-w-xs">
              <p className="flex items-center gap-2"><ChevronRight className="w-4 h-4 text-accent" /> Create your profile</p>
              <p className="flex items-center gap-2"><ChevronRight className="w-4 h-4 text-accent" /> Start a convoy</p>
              <p className="flex items-center gap-2"><ChevronRight className="w-4 h-4 text-accent" /> Track your ride</p>
              <p className="flex items-center gap-2"><ChevronRight className="w-4 h-4 text-accent" /> Earn badges</p>
            </div>
          </div>
        )}

        {/* Onboarding */}
        {step === 'onboarding' && (
          <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-full max-w-sm">
              <h1 className="text-4xl font-display font-bold text-center mb-2 tracking-tight">
                BLACKTOP
              </h1>
              <p className="text-muted-foreground text-center mb-12">
                Your ride companion
              </p>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Profile Name
                  </label>
                  <Input
                    value={demoName}
                    onChange={(e) => setDemoName(e.target.value)}
                    placeholder="Enter your name"
                    className="h-14 text-lg bg-secondary border-border"
                  />
                </div>
                <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg">
                  <p className="text-sm text-accent">
                    💡 No email or password required - just your name to get started
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Home */}
        {step === 'home' && (
          <div className="p-4 animate-fade-in">
            <header className="flex items-center justify-between mb-4">
              <div>
                <p className="text-muted-foreground text-sm uppercase tracking-wide">Welcome back</p>
                <h1 className="text-2xl font-display font-bold">{demoName || 'Rider'}</h1>
              </div>
              <button className="p-3 rounded-lg bg-secondary">
                <Settings className="w-6 h-6" />
              </button>
            </header>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Total Rides</p>
                <p className="text-2xl font-mono font-bold">12</p>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Distance</p>
                <p className="text-2xl font-mono font-bold">348<span className="text-sm text-muted-foreground ml-1">mi</span></p>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Top Speed</p>
                <p className="text-2xl font-mono font-bold">92<span className="text-sm text-muted-foreground ml-1">mph</span></p>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Time</p>
                <p className="text-2xl font-mono font-bold">8:24:30</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="h-24 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg flex flex-col items-center justify-center border-2 border-accent">
                <Users className="w-8 h-8 mb-1" />
                <span className="font-display font-bold">START CONVOY</span>
              </div>
              <div className="h-20 bg-card hover:bg-muted border-2 border-border rounded-lg flex flex-col items-center justify-center">
                <UserPlus className="w-6 h-6 mb-1" />
                <span className="font-display font-semibold">JOIN CONVOY</span>
              </div>
            </div>

            <div className="flex justify-around mt-6 pt-4 border-t border-border">
              <div className="flex flex-col items-center gap-1 p-3 text-muted-foreground">
                <History className="w-6 h-6" />
                <span className="text-xs">History</span>
              </div>
              <div className="flex flex-col items-center gap-1 p-3 text-muted-foreground">
                <BarChart3 className="w-6 h-6" />
                <span className="text-xs">Stats</span>
              </div>
              <div className="flex flex-col items-center gap-1 p-3 text-muted-foreground">
                <Settings className="w-6 h-6" />
                <span className="text-xs">Settings</span>
              </div>
            </div>
          </div>
        )}

        {/* Create Convoy */}
        {step === 'create-convoy' && (
          <div className="p-4 animate-fade-in">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-accent" />
              </div>
              <h1 className="text-2xl font-display font-bold mb-2">Convoy Created!</h1>
              <p className="text-muted-foreground">Share this code with your group</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 text-center mb-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Convoy Code</p>
              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-3 mx-auto"
              >
                <span className="font-mono text-4xl font-bold tracking-widest">XK7M9P</span>
                {copied ? (
                  <Check className="w-6 h-6 text-accent" />
                ) : (
                  <Copy className="w-6 h-6 text-muted-foreground" />
                )}
              </button>
            </div>

            <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg">
              <p className="text-sm text-accent">
                💡 Others can join using this code from "Join Convoy" on the home screen
              </p>
            </div>
          </div>
        )}

        {/* Lobby */}
        {step === 'lobby' && (
          <div className="p-4 animate-fade-in">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Convoy Code</p>
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
                  <span className="font-mono text-xl font-bold tracking-widest">XK7M9P</span>
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  !isMuted ? "bg-ptt-active" : "bg-ptt-inactive"
                )}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-background" />}
              </button>
            </header>

            <div className="mb-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Riders (4)</p>
              <div className="space-y-2">
                {[
                  { name: demoName || 'You', isLeader: true },
                  { name: 'Marcus', isLeader: false },
                  { name: 'Sarah', isLeader: false },
                  { name: 'Jake', isLeader: false },
                ].map((member, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg border",
                    member.isLeader ? "bg-accent/20 border-accent/30" : "bg-card border-border"
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      member.isLeader ? "bg-accent/30" : "bg-secondary"
                    )}>
                      {member.isLeader ? <Crown className="w-4 h-4 text-accent" /> : <User className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className={cn("font-medium text-sm", member.isLeader && "text-accent")}>{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.isLeader ? 'Leader' : 'Rider'}</p>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Waiting</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg">
              <p className="text-sm text-accent">
                💡 As leader, you control the destination. Others will follow your navigation.
              </p>
            </div>
          </div>
        )}

        {/* Lobby with Destination */}
        {step === 'lobby-destination' && (
          <div className="p-4 animate-fade-in">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Convoy Code</p>
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
                  <span className="font-mono text-xl font-bold tracking-widest">XK7M9P</span>
                </div>
              </div>
              <button className="w-12 h-12 rounded-full flex items-center justify-center bg-ptt-inactive">
                <MicOff className="w-5 h-5" />
              </button>
            </header>

            <div className="mb-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Destination</p>
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex items-center gap-3">
                <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-accent">Mountain View Diner</p>
                  <p className="text-xs text-muted-foreground">1234 Highway 1, Mountain View</p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">Riders (4)</p>
              <div className="space-y-2">
                {[
                  { name: demoName || 'You', isLeader: true, ready: true },
                  { name: 'Marcus', isLeader: false, ready: true },
                  { name: 'Sarah', isLeader: false, ready: true },
                  { name: 'Jake', isLeader: false, ready: false },
                ].map((member, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg border",
                    member.isLeader ? "bg-accent/20 border-accent/30" : "bg-card border-border"
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      member.isLeader ? "bg-accent/30" : "bg-secondary"
                    )}>
                      {member.isLeader ? <Crown className="w-4 h-4 text-accent" /> : <User className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className={cn("font-medium text-sm", member.isLeader && "text-accent")}>{member.name}</p>
                    </div>
                    {member.ready ? (
                      <span className="flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-1 rounded">
                        <Navigation className="w-3 h-3" /> Ready
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Waiting</span>
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
          <div className="p-4 animate-fade-in">
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="flex items-center gap-1 text-accent text-sm font-medium px-2 py-1 bg-accent/10 rounded">
                <Users className="w-4 h-4" /> LEADER
              </span>
              <span className="text-muted-foreground text-sm">Ride Active</span>
            </div>

            <div className="text-center mb-8">
              <p className="text-muted-foreground text-sm uppercase tracking-wide mb-2">Current Speed</p>
              <div className={cn(
                "font-mono text-7xl font-bold transition-all",
                speed > 80 && "text-warning",
                speed > 90 && "text-destructive"
              )}>
                {speed}
              </div>
              <p className="text-muted-foreground text-lg">mph</p>
            </div>

            <div className="flex justify-center gap-8 mb-8">
              <div className="text-center">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Distance</p>
                <p className="font-mono text-xl font-bold">{distance.toFixed(1)}<span className="text-sm text-muted-foreground ml-1">mi</span></p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Duration</p>
                <p className="font-mono text-xl font-bold">{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Max</p>
                <p className="font-mono text-xl font-bold">{Math.round(maxSpeed)}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                <Navigation className="w-6 h-6" />
              </button>
              <button className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center",
                !isMuted ? "bg-ptt-active" : "bg-ptt-inactive"
              )} onClick={() => setIsMuted(!isMuted)}>
                {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8 text-background" />}
              </button>
              <button className="w-14 h-14 rounded-full bg-accent/20 text-accent flex items-center justify-center">
                <Users className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Ride End */}
        {step === 'ride-end' && (
          <div className="p-4 animate-fade-in">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-display font-bold mb-2">End Ride?</h2>
              <p className="text-muted-foreground">This will end the ride for all convoy members</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Ride Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-xs">Distance</p>
                  <p className="font-mono text-2xl font-bold">{distance.toFixed(1)} mi</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Duration</p>
                  <p className="font-mono text-2xl font-bold">{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Top Speed</p>
                  <p className="font-mono text-2xl font-bold">{Math.round(maxSpeed)} mph</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Avg Speed</p>
                  <p className="font-mono text-2xl font-bold">{Math.round(maxSpeed * 0.6)} mph</p>
                </div>
              </div>
            </div>

            <Button className="w-full h-14 text-lg font-semibold bg-destructive hover:bg-destructive/90">
              <Square className="w-5 h-5 mr-2" /> END RIDE
            </Button>
          </div>
        )}

        {/* Badge Summary */}
        {step === 'badge-summary' && (
          <div className="p-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-display font-bold">Ride Complete</h2>
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
                    "flex items-center gap-4 p-4 rounded-xl border animate-slide-up",
                    badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/30",
                    badge.color === 'blue' && "bg-blue-500/10 border-blue-500/30",
                    badge.color === 'stone' && "bg-stone-500/10 border-stone-500/30"
                  )}
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center text-3xl",
                    badge.color === 'yellow' && "bg-yellow-500/20",
                    badge.color === 'blue' && "bg-blue-500/20",
                    badge.color === 'stone' && "bg-stone-500/20"
                  )}>
                    {badge.emoji}
                  </div>
                  <div className="flex-1">
                    <p className={cn(
                      "font-bold text-lg",
                      badge.color === 'yellow' && "text-yellow-400",
                      badge.color === 'blue' && "text-blue-400",
                      badge.color === 'stone' && "text-stone-400"
                    )}>
                      {badge.label}
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground">
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
          <div className="p-4 animate-fade-in">
            <h1 className="text-2xl font-display font-bold mb-6">Statistics</h1>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-display font-semibold">Convoy Badges</h2>
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
                      "flex flex-col items-center p-4 rounded-xl border",
                      badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/30",
                      badge.color === 'blue' && "bg-blue-500/10 border-blue-500/30",
                      badge.color === 'stone' && "bg-stone-500/10 border-stone-500/30"
                    )}
                  >
                    <span className="text-3xl mb-2">{badge.emoji}</span>
                    <span className={cn(
                      "font-mono text-2xl font-bold",
                      badge.color === 'yellow' && "text-yellow-400",
                      badge.color === 'blue' && "text-blue-400",
                      badge.color === 'stone' && "text-stone-400"
                    )}>
                      {badge.count}
                    </span>
                    <span className={cn(
                      "text-xs font-medium text-center mt-1",
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
                { icon: '🏍️', label: 'Total Rides', value: '13', unit: 'rides' },
                { icon: '📍', label: 'Total Distance', value: '352', unit: 'mi' },
                { icon: '⏱️', label: 'Time Riding', value: '8:35:45', unit: '' },
                { icon: '🚀', label: 'Top Speed', value: Math.round(maxSpeed).toString(), unit: 'mph' },
              ].map((stat, i) => (
                <div key={i} className="bg-card rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{stat.icon}</span>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                      <p className="font-mono text-2xl font-bold">
                        {stat.value}
                        {stat.unit && <span className="text-sm text-muted-foreground ml-1">{stat.unit}</span>}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Complete */}
        {step === 'complete' && (
          <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mb-6">
              <Check className="w-10 h-10 text-accent" />
            </div>
            <h1 className="text-3xl font-display font-bold text-center mb-2">
              Demo Complete!
            </h1>
            <p className="text-muted-foreground text-center max-w-sm mb-8">
              You've seen all of Blacktop's features. Ready to start your own ride?
            </p>
            <Button onClick={exitDemo} className="h-14 px-8 text-lg font-semibold">
              Get Started <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      {step !== 'complete' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border">
          <Button onClick={nextStep} className="w-full h-14 text-lg font-semibold">
            {step === 'welcome' ? 'Start Demo' : 'Continue'} <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
