import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DemoTooltip, DemoSuccess } from '@/components/DemoTooltip';
import { haptics } from '@/lib/haptics';
import { useWakeLock } from '@/hooks/useWakeLock';
import { 
  Users, UserPlus, History, BarChart3, Settings, Play, 
  Copy, Check, Mic, MicOff, Crown, User, Navigation, 
  Square, Trophy, ArrowRight, ChevronRight, MapPin, Plus,
  GripVertical, AlertTriangle, Camera, Image, Flame,
  Gauge, Clock, TrendingUp, Route, Phone, X, Volume2, Video
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DemoStep = 
  | 'welcome'
  | 'onboarding' 
  | 'home'
  | 'create-convoy'
  | 'lobby-empty'
  | 'lobby-members'
  | 'lobby-waypoints'
  | 'lobby-reorder'
  | 'active-ride'
  | 'action-cam'
  | 'active-rescue'
  | 'rescue-response'
  | 'ride-end'
  | 'badge-summary'
  | 'history'
  | 'history-photos'
  | 'stats'
  | 'settings'
  | 'complete';

const STEP_TITLES: Record<DemoStep, string> = {
  'welcome': 'Welcome to Blacktop',
  'onboarding': 'Privacy-First Profile',
  'home': 'Home Dashboard',
  'create-convoy': 'Start a Convoy',
  'lobby-empty': 'Convoy Lobby',
  'lobby-members': 'Voice Communication',
  'lobby-waypoints': 'Multi-Waypoint Routes',
  'lobby-reorder': 'Drag to Reorder',
  'active-ride': 'Live Ride Tracking',
  'action-cam': 'Action Cam Overlay',
  'active-rescue': 'Rescue Feature',
  'rescue-response': 'Leader Response',
  'ride-end': 'Ending the Ride',
  'badge-summary': 'Badge Awards',
  'history': 'Ride History',
  'history-photos': 'Ride Photos',
  'stats': 'Your Statistics',
  'settings': 'Settings & Privacy',
  'complete': 'Demo Complete',
};

const STEP_INTERACTIONS: Partial<Record<DemoStep, string>> = {
  'onboarding': 'Type your name to continue',
  'lobby-members': 'Tap the mic button to unmute',
  'lobby-reorder': 'Drag a waypoint to reorder',
  'active-ride': 'Tap the mic to toggle voice',
  'active-rescue': 'Tap the RESCUE button',
  'rescue-response': 'Tap Add Waypoint to help',
  'settings': 'Try changing a setting',
};

export default function DemoRide() {
  const navigate = useNavigate();
  const wakeLock = useWakeLock();
  const [step, setStep] = useState<DemoStep>('welcome');
  const [demoName, setDemoName] = useState('');
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waypointOrder, setWaypointOrder] = useState([0, 1, 2]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  // Interactive state tracking
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<'mph' | 'kph'>('mph');
  const [selectedNavApp, setSelectedNavApp] = useState(0);

  // Lean angle state for action cam demo
  const [leanAngle, setLeanAngle] = useState(0);
  const [maxLean, setMaxLean] = useState(0);

  // Keep screen awake during active ride demo steps
  const isActiveRideStep = ['active-ride', 'action-cam', 'active-rescue', 'rescue-response', 'ride-end'].includes(step);
  
  useEffect(() => {
    if (isActiveRideStep) {
      wakeLock.request();
    }
    return () => {
      if (isActiveRideStep) {
        wakeLock.release();
      }
    };
  }, [isActiveRideStep]);

  // Simulate ride when on active-ride or action-cam step
  useEffect(() => {
    if (step !== 'active-ride' && step !== 'action-cam' && step !== 'active-rescue') return;
    
    const interval = setInterval(() => {
      setSpeed(prev => {
        const newSpeed = Math.max(0, Math.min(95, prev + (Math.random() - 0.4) * 15));
        setMaxSpeed(m => Math.max(m, newSpeed));
        return Math.round(newSpeed);
      });
      setDistance(prev => prev + 0.02);
      setDuration(prev => prev + 1);
      // Simulate lean angle swinging side to side
      setLeanAngle(prev => {
        const newLean = Math.sin(Date.now() / 800) * 35 + (Math.random() - 0.5) * 10;
        const clampedLean = Math.max(-45, Math.min(45, newLean));
        setMaxLean(m => Math.max(m, Math.abs(clampedLean)));
        return Math.round(clampedLean);
      });
    }, 500);

    return () => clearInterval(interval);
  }, [step]);

  // Reset interaction state on step change
  useEffect(() => {
    setHasInteracted(false);
    setShowSuccess(false);
  }, [step]);

  const steps: DemoStep[] = [
    'welcome', 'onboarding', 'home', 'create-convoy', 'lobby-empty', 
    'lobby-members', 'lobby-waypoints', 'lobby-reorder', 'active-ride',
    'action-cam', 'active-rescue', 'rescue-response', 'ride-end', 'badge-summary',
    'history', 'history-photos', 'stats', 'settings', 'complete'
  ];

  const nextStep = useCallback(() => {
    setStep(currentStep => {
      const currentIndex = steps.indexOf(currentStep);
      if (currentIndex < steps.length - 1) {
        return steps[currentIndex + 1];
      }
      return currentStep;
    });
  }, []);

  const triggerSuccess = useCallback((advanceStep: () => void) => {
    haptics.success();
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      advanceStep();
    }, 600);
  }, []);

  const handleInteraction = useCallback((action: string) => {
    setHasInteracted(true);
    haptics.medium();
    
    // Auto-advance after certain interactions
    if (['unmute', 'reorder', 'rescue', 'add-waypoint', 'setting'].includes(action)) {
      setTimeout(() => triggerSuccess(nextStep), 300);
    }
  }, [triggerSuccess, nextStep]);

  const handleCopy = () => {
    setCopied(true);
    haptics.medium();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMicToggle = () => {
    setIsMuted(!isMuted);
    if (isMuted) {
      handleInteraction('unmute');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
    haptics.light();
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    
    const newOrder = [...waypointOrder];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    setWaypointOrder(newOrder);
    setDraggedIndex(null);
    handleInteraction('reorder');
  };

  const exitDemo = () => navigate('/');

  const progress = ((steps.indexOf(step) + 1) / steps.length) * 100;

  const waypoints = [
    { name: 'Gas Station', address: '1234 Highway 1', completed: false },
    { name: 'Mountain View Diner', address: '5678 Ridge Road', completed: false },
    { name: 'Sunset Point', address: 'Overlook Drive', completed: false },
  ];

  const demoMembers = [
    { name: demoName || 'You', isLeader: true, color: 'orange', speed: speed, topSpeed: maxSpeed, distance: distance },
    { name: 'Marcus', isLeader: false, color: 'blue', speed: 62, topSpeed: 78, distance: 12.4 },
    { name: 'Sarah', isLeader: false, color: 'pink', speed: 58, topSpeed: 82, distance: 11.8 },
    { name: 'Jake', isLeader: false, color: 'green', speed: 0, topSpeed: 71, distance: 10.2 },
  ];

  // Check if step requires interaction before continuing
  const requiresInteraction = step in STEP_INTERACTIONS;
  const canContinue = !requiresInteraction || hasInteracted || 
    (step === 'onboarding' && demoName.length >= 2);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <DemoSuccess show={showSuccess} />
      
      {/* Demo Header */}
      <div className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="h-1 bg-secondary">
          <div 
            className="h-full bg-accent transition-all duration-500 ease-spring" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{STEP_TITLES[step]}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {STEP_INTERACTIONS[step] || `Step ${steps.indexOf(step) + 1} of ${steps.length}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={exitDemo} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            Exit
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 pt-20 pb-28 overflow-y-auto">
        {/* Welcome Screen */}
        {step === 'welcome' && (
          <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center mb-8 animate-float border border-accent/20">
              <Play className="w-12 h-12 text-accent" />
            </div>
            <h1 className="text-3xl font-semibold text-center mb-2 tracking-tight">
              Interactive Demo
            </h1>
            <p className="text-muted-foreground text-center text-sm mb-8">
              Learn by doing — tap, drag, and explore!
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm max-w-xs w-full">
              {[
                { icon: Users, label: 'Convoy Mode' },
                { icon: Route, label: 'Multi-Waypoints' },
                { icon: Mic, label: 'Voice Chat' },
                { icon: AlertTriangle, label: 'Rescue System' },
                { icon: Trophy, label: 'Badge Awards' },
                { icon: Camera, label: 'Ride Photos' },
                { icon: Gauge, label: 'Live Tracking' },
                { icon: Video, label: 'Action Cam' },
                { icon: Flame, label: 'Burn Button' },
              ].map(({ icon: Icon, label }, i) => (
                <div key={i} className="flex items-center gap-2 p-2.5 bg-card/50 rounded-xl border border-border/30 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <Icon className="w-4 h-4 text-accent" />
                  <span className="text-xs">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Onboarding - Interactive name input */}
        {step === 'onboarding' && (
          <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-full max-w-sm">
              <h1 className="text-4xl font-semibold text-center mb-2 tracking-tight">
                BLACKTOP
              </h1>
              <p className="text-muted-foreground text-center mb-10 text-sm">
                Privacy-first ride companion
              </p>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Profile Name
                  </label>
                  <DemoTooltip 
                    hint="Type your name" 
                    position="top" 
                    pulse={!demoName}
                    className="w-full"
                  >
                    <Input
                      value={demoName}
                      onChange={(e) => setDemoName(e.target.value)}
                      placeholder="Enter your name"
                      className="h-14 text-lg"
                      autoFocus
                    />
                  </DemoTooltip>
                </div>
                <div className="p-4 bg-accent/10 border border-accent/20 rounded-xl space-y-2">
                  <p className="text-sm text-accent font-medium">🔒 No account required</p>
                  <p className="text-xs text-muted-foreground">No email, no phone, no tracking. Just ride.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Home */}
        {step === 'home' && (
          <div className="p-5 animate-fade-in">
            <header className="flex items-center justify-between mb-5">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Welcome back</p>
                <h1 className="text-2xl font-semibold tracking-tight">{demoName || 'Rider'}</h1>
              </div>
              <button className="p-2.5 rounded-xl bg-secondary/50 border border-border/30">
                <Settings className="w-5 h-5 text-muted-foreground" />
              </button>
            </header>

            <div className="grid grid-cols-4 gap-2 mb-5">
              {[
                { label: 'Rides', value: '12' },
                { label: 'Distance', value: '348', unit: 'mi' },
                { label: 'Top', value: '92', unit: 'mph' },
                { label: 'Time', value: '8:24' },
              ].map((stat, i) => (
                <div key={i} className="bg-card/50 rounded-xl p-2.5 border border-border/30 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <p className="text-muted-foreground text-[9px] uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className="text-lg font-mono font-semibold">{stat.value}<span className="text-[10px] text-muted-foreground/70 ml-0.5">{stat.unit}</span></p>
                </div>
              ))}
            </div>

            <div className="space-y-2.5 mb-5">
              <div className="h-24 bg-accent hover:bg-accent/90 text-accent-foreground rounded-2xl flex items-center justify-center gap-3">
                <Users className="w-6 h-6" />
                <span className="font-semibold">Start Convoy</span>
              </div>
              <div className="h-20 bg-card/50 border border-border/40 rounded-2xl flex items-center justify-center gap-3">
                <UserPlus className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Join Convoy</span>
              </div>
            </div>

            <div className="flex justify-around pt-3 border-t border-border/30">
              {[
                { icon: Play, label: 'Demo', active: true },
                { icon: History, label: 'History' },
                { icon: BarChart3, label: 'Stats' },
                { icon: Settings, label: 'Settings' },
              ].map(({ icon: Icon, label, active }) => (
                <div key={label} className={cn("flex flex-col items-center gap-1 p-2", active && "text-accent")}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Convoy - Interactive copy */}
        {step === 'create-convoy' && (
          <div className="p-5 animate-fade-in">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-accent" />
              </div>
              <h1 className="text-2xl font-semibold mb-2">Convoy Created!</h1>
              <p className="text-muted-foreground text-sm">Share this code with your group</p>
            </div>

            <div className="bg-card/50 border border-border/30 rounded-2xl p-6 text-center mb-5">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-3">Convoy Code</p>
              <DemoTooltip hint="Tap to copy" position="bottom" pulse={!copied}>
                <button onClick={handleCopy} className="flex items-center justify-center gap-4 mx-auto">
                  <span className="font-mono text-4xl font-semibold tracking-[0.2em]">XK7M9P</span>
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                    copied ? "bg-accent" : "bg-secondary"
                  )}>
                    {copied ? <Check className="w-5 h-5 text-accent-foreground" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </button>
              </DemoTooltip>
            </div>

            <div className="p-3 bg-secondary/50 rounded-xl text-sm text-muted-foreground">
              💡 Others join using this code from the home screen
            </div>
          </div>
        )}

        {/* Lobby Empty */}
        {step === 'lobby-empty' && (
          <div className="p-5 animate-fade-in">
            <header className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2 bg-card/50 border border-border/30 rounded-xl px-3 py-2">
                <span className="font-mono text-lg font-semibold tracking-wider">XK7M9P</span>
                <Copy className="w-4 h-4 text-muted-foreground" />
              </div>
              <button className="w-12 h-12 rounded-xl bg-secondary/80 border border-border/30 flex items-center justify-center">
                <MicOff className="w-5 h-5" />
              </button>
            </header>

            <div className="mb-5">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-3">Riders (1)</p>
              <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-accent">{demoName || 'You'}</p>
                  <p className="text-xs text-muted-foreground">Leader</p>
                </div>
              </div>
            </div>

            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Waiting for riders to join...</p>
              <p className="text-xs mt-1">Share your convoy code</p>
            </div>
          </div>
        )}

        {/* Lobby with Members - Interactive Voice */}
        {step === 'lobby-members' && (
          <div className="p-5 animate-fade-in">
            <header className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2 bg-card/50 border border-border/30 rounded-xl px-3 py-2">
                <span className="font-mono text-lg font-semibold tracking-wider">XK7M9P</span>
              </div>
              <DemoTooltip hint="Tap to unmute" position="left" pulse={isMuted}>
                <button
                  onClick={handleMicToggle}
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                    !isMuted ? "bg-accent shadow-glow" : "bg-secondary/80 border border-border/30"
                  )}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-accent-foreground" />}
                </button>
              </DemoTooltip>
            </header>

            <div className="mb-5">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-3">Riders (4)</p>
              <div className="space-y-2">
                {demoMembers.map((member, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border animate-slide-up",
                    member.isLeader ? "bg-accent/10 border-accent/20" : "bg-card/50 border-border/30",
                    !isMuted && i === 1 && "ring-2 ring-blue-400/50"
                  )} style={{ animationDelay: `${i * 75}ms` }}>
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      member.isLeader ? "bg-accent/20" : `bg-${member.color}-500/20`
                    )}>
                      {member.isLeader ? <Crown className="w-5 h-5 text-accent" /> : <User className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className={cn("font-medium text-sm", member.isLeader && "text-accent")}>
                        {member.name}
                        {!isMuted && i === 1 && <Volume2 className="w-3 h-3 inline ml-1 text-blue-400" />}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground bg-secondary/80 px-2.5 py-1 rounded-full">
                      Waiting
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-accent/10 border border-accent/20 rounded-xl">
              <p className="text-sm text-accent flex items-center gap-2">
                <Mic className="w-4 h-4" />
                <span>Toggle voice chat — no push-to-talk needed</span>
              </p>
            </div>
          </div>
        )}

        {/* Lobby with Waypoints */}
        {step === 'lobby-waypoints' && (
          <div className="p-5 animate-fade-in">
            <header className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 bg-card/50 border border-border/30 rounded-xl px-3 py-2">
                <span className="font-mono text-base font-semibold tracking-wider">XK7M9P</span>
              </div>
              <button className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                <Mic className="w-4 h-4 text-accent-foreground" />
              </button>
            </header>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-muted-foreground text-[10px] uppercase tracking-widest">Route (3 stops)</p>
                <button className="flex items-center gap-1 text-[10px] text-accent">
                  <Plus className="w-3 h-3" /> Add Stop
                </button>
              </div>
              <div className="space-y-2">
                {waypoints.map((wp, i) => (
                  <div key={i} className="flex items-center gap-2 bg-card/50 border border-border/30 rounded-xl p-2.5 animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{wp.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{wp.address}</p>
                    </div>
                    <div className="flex gap-1">
                      <Check className="w-4 h-4 text-accent" />
                      <X className="w-4 h-4 text-destructive" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-2">Next Stop</p>
              <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-center gap-3">
                <MapPin className="w-5 h-5 text-accent" />
                <div className="flex-1">
                  <p className="font-medium text-accent text-sm">Gas Station</p>
                  <p className="text-[10px] text-muted-foreground">1234 Highway 1</p>
                </div>
                <Button size="sm" className="h-8 bg-accent text-accent-foreground">
                  <Navigation className="w-3 h-3 mr-1" /> Navigate
                </Button>
              </div>
            </div>

            <div className="p-3 bg-secondary/50 rounded-xl text-sm text-muted-foreground">
              💡 Plan multiple stops — riders navigate one at a time
            </div>
          </div>
        )}

        {/* Lobby Reorder - Interactive Drag */}
        {step === 'lobby-reorder' && (
          <div className="p-5 animate-fade-in">
            <header className="mb-4 flex items-center justify-between">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest">Reorder Waypoints</p>
            </header>

            <div className="space-y-2 mb-5">
              {waypointOrder.map((wpIndex, i) => (
                <DemoTooltip 
                  key={wpIndex}
                  hint={i === 0 && !hasInteracted ? "Drag me!" : ""} 
                  position="right" 
                  pulse={i === 0 && !hasInteracted}
                  showArrow={i === 0 && !hasInteracted}
                  className="w-full"
                >
                  <div 
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(i)}
                    className={cn(
                      "flex items-center gap-2 bg-card/50 border rounded-xl p-2.5 cursor-grab active:cursor-grabbing transition-all",
                      draggedIndex === i ? "border-accent border-dashed scale-[1.02] shadow-lg" : "border-border/30",
                      i === 0 && !hasInteracted && "animate-wiggle"
                    )}
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{waypoints[wpIndex].name}</p>
                    </div>
                  </div>
                </DemoTooltip>
              ))}
            </div>

            <div className="p-3 bg-accent/10 border border-accent/20 rounded-xl">
              <p className="text-sm text-accent flex items-center gap-2">
                <GripVertical className="w-4 h-4" />
                <span>Drag handles to reorder your route</span>
              </p>
            </div>
          </div>
        )}

        {/* Active Ride - Interactive mic */}
        {step === 'active-ride' && (
          <div className="p-5 animate-fade-in">
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="flex items-center gap-2 text-accent text-xs font-medium px-3 py-1.5 bg-accent/15 rounded-full">
                <Users className="w-3 h-3" /> LEADER
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                GPS Active
              </span>
            </div>

            <div className="text-center mb-8">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-2">Speed</p>
              <div className={cn(
                "font-mono text-7xl font-semibold transition-all tracking-tight",
                speed > 80 && "text-warning",
                speed > 90 && "text-destructive"
              )}>
                {speed}
              </div>
              <p className="text-muted-foreground text-sm">mph</p>
            </div>

            <div className="flex justify-center gap-8 mb-8">
              {[
                { icon: MapPin, label: 'Dist', value: distance.toFixed(1), unit: 'mi' },
                { icon: Clock, label: 'Time', value: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` },
                { icon: TrendingUp, label: 'Max', value: Math.round(maxSpeed).toString() },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <stat.icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="font-mono text-lg font-semibold">{stat.value}<span className="text-xs text-muted-foreground ml-0.5">{stat.unit}</span></p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-4 mb-4">
              <button className="w-12 h-12 rounded-xl bg-secondary/80 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-muted-foreground" />
              </button>
              <DemoTooltip hint="Try toggling" position="top" pulse={isMuted}>
                <button className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center transition-all",
                  !isMuted ? "bg-accent shadow-glow" : "bg-secondary/80"
                )} onClick={handleMicToggle}>
                  {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7 text-accent-foreground" />}
                </button>
              </DemoTooltip>
              <button className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
                <Users className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-card/50 border border-border/30 rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Convoy (4)</p>
              <div className="flex gap-2">
                {demoMembers.slice(0, 4).map((m, i) => (
                  <div key={i} className="flex-1 text-center">
                    <p className="text-[10px] truncate">{m.name}</p>
                    <p className="font-mono text-sm font-semibold">{Math.round(m.speed)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Cam Overlay Demo */}
        {step === 'action-cam' && (
          <div className="p-5 animate-fade-in">
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Video className="w-5 h-5 text-accent" />
                <span className="text-sm font-medium text-accent">Action Cam Connected</span>
              </div>
              <p className="text-muted-foreground text-xs">Stats overlay on your footage</p>
            </div>

            {/* Simulated action cam view */}
            <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl overflow-hidden aspect-video mb-4 border border-border/30">
              {/* Fake road/scene background */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
              
              {/* Overlay content */}
              <div className="absolute inset-0 flex flex-col justify-end p-4">
                {/* Lean angle arc - positioned above stats */}
                <div className="flex justify-center mb-2">
                  <svg viewBox="0 0 120 70" className="w-28 h-16">
                    {/* White arc background */}
                    <path
                      d="M 10 55 A 50 50 0 0 1 110 55"
                      fill="none"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    {/* Moving indicator dot */}
                    {(() => {
                      const clampedLean = Math.max(-60, Math.min(60, leanAngle));
                      const angle = Math.PI - ((clampedLean + 60) / 120) * Math.PI;
                      const cx = 60 + Math.cos(angle) * 50;
                      const cy = 55 - Math.abs(Math.sin(angle)) * 50;
                      const absLean = Math.abs(leanAngle);
                      const ratio = absLean / 45;
                      const hue = ratio < 0.5 ? 120 - ratio * 120 : 60 - (ratio - 0.5) * 120;
                      const color = absLean >= 45 ? '#ef4444' : `hsl(${Math.max(0, hue)}, 85%, 50%)`;
                      return <circle cx={cx} cy={cy} r="5" fill={color} />;
                    })()}
                  </svg>
                </div>

                {/* Lean angle number */}
                <p className="text-center text-white font-bold text-lg mb-1">{Math.abs(leanAngle)}°</p>

                {/* Stats row */}
                <div className="flex items-end justify-between text-white">
                  {/* Distance */}
                  <div>
                    <p className="font-bold text-xl">{distance.toFixed(1)} mi</p>
                  </div>

                  {/* Center: Max + Speed */}
                  <div className="text-center">
                    <p className="text-xs text-gray-400">MAX {Math.round(maxSpeed)} MPH</p>
                    <p className="font-bold text-2xl">{speed} MPH</p>
                  </div>

                  {/* Duration */}
                  <div className="text-right">
                    <p className="font-bold text-xl">{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</p>
                  </div>
                </div>
              </div>

              {/* Recording indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/80 text-white text-xs">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                REC
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-card/50 border border-border/30 rounded-xl">
                <p className="text-sm flex items-center gap-2">
                  <Video className="w-4 h-4 text-accent" />
                  <span>Connect DJI Action cameras via RTMP</span>
                </p>
              </div>
              <div className="p-3 bg-accent/10 border border-accent/20 rounded-xl">
                <p className="text-sm text-accent flex items-center gap-2">
                  <Gauge className="w-4 h-4" />
                  <span>Lean angle + speed overlay burned into footage</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Active Rescue - Interactive button */}
        {step === 'active-rescue' && (
          <div className="p-5 animate-fade-in">
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="flex items-center gap-2 text-muted-foreground text-xs font-medium px-3 py-1.5 bg-secondary rounded-full">
                <User className="w-3 h-3" /> MEMBER
              </span>
            </div>

            <div className="text-center mb-6">
              <p className="font-mono text-6xl font-semibold">{speed}</p>
              <p className="text-muted-foreground text-sm">mph</p>
            </div>

            <div className="flex justify-center gap-8 mb-6">
              <div className="text-center">
                <p className="font-mono text-lg font-semibold">{distance.toFixed(1)} mi</p>
              </div>
              <div className="text-center">
                <p className="font-mono text-lg font-semibold">{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</p>
              </div>
            </div>

            <DemoTooltip hint="Tap for help!" position="top" pulse={!hasInteracted}>
              <button 
                onClick={() => handleInteraction('rescue')}
                className="w-full h-14 rounded-xl border-2 border-warning text-warning hover:bg-warning hover:text-warning-foreground flex items-center justify-center gap-3 transition-all mb-4 animate-pulse"
              >
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold">RESCUE</span>
              </button>
            </DemoTooltip>

            <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl">
              <p className="text-sm text-warning flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Lost? Tap to send your location to the leader</span>
              </p>
            </div>
          </div>
        )}

        {/* Rescue Response - Interactive add waypoint */}
        {step === 'rescue-response' && (
          <div className="p-5 animate-fade-in relative">
            {/* Rescue Alert Overlay */}
            <div className="absolute top-0 left-4 right-4 bg-destructive/95 text-destructive-foreground rounded-xl p-3 shadow-lg animate-slide-up z-10">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive-foreground/20 flex items-center justify-center animate-pulse">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Jake needs rescue!</p>
                  <p className="text-xs opacity-80">Add them as a waypoint to navigate</p>
                  <div className="flex gap-2 mt-2">
                    <DemoTooltip hint="Tap to help" position="bottom" pulse={!hasInteracted}>
                      <Button 
                        size="sm" 
                        className="h-7 bg-background text-foreground hover:bg-background/90 text-xs"
                        onClick={() => handleInteraction('add-waypoint')}
                      >
                        <UserPlus className="w-3 h-3 mr-1" /> Add Waypoint
                      </Button>
                    </DemoTooltip>
                    <Button size="sm" variant="ghost" className="h-7 text-xs opacity-70">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-24">
              <div className="flex items-center justify-center gap-3 mb-6">
                <span className="flex items-center gap-2 text-accent text-xs font-medium px-3 py-1.5 bg-accent/15 rounded-full">
                  <Crown className="w-3 h-3" /> LEADER VIEW
                </span>
              </div>

              <div className="p-3 bg-accent/10 border border-accent/20 rounded-xl">
                <p className="text-sm text-accent">
                  Leader receives rescue alert and can add the lost rider's location as a waypoint
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Ride End */}
        {step === 'ride-end' && (
          <div className="p-5 animate-fade-in">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold mb-1">End Ride?</h2>
              <p className="text-sm text-muted-foreground">This will end for all convoy members</p>
            </div>

            <div className="bg-card/50 border border-border/30 rounded-xl p-4 mb-5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4">Ride Summary</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: MapPin, label: 'Distance', value: `${distance.toFixed(1)} mi` },
                  { icon: Clock, label: 'Duration', value: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` },
                  { icon: TrendingUp, label: 'Top Speed', value: `${Math.round(maxSpeed)} mph` },
                  { icon: Gauge, label: 'Avg Speed', value: `${Math.round(maxSpeed * 0.6)} mph` },
                ].map((stat, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <stat.icon className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                      <p className="font-mono text-lg font-semibold">{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full h-12 bg-destructive hover:bg-destructive/90 rounded-xl">
              <Square className="w-4 h-4 mr-2" /> END CONVOY
            </Button>
          </div>
        )}

        {/* Badge Summary */}
        {step === 'badge-summary' && (
          <div className="p-5 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Ride Complete!</h2>
                <p className="text-sm text-muted-foreground">Badge Awards</p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { emoji: '⚡', label: 'Speed Demon', desc: 'Highest top speed', name: demoName || 'You', color: 'yellow' },
                { emoji: '🛣️', label: 'Journeyman', desc: 'Most distance covered', name: 'Marcus', color: 'blue' },
                { emoji: '🪨', label: 'Fallback', desc: 'Longest stationary', name: 'Jake', color: 'stone' },
              ].map((badge, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border animate-slide-up",
                    badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/20",
                    badge.color === 'blue' && "bg-blue-500/10 border-blue-500/20",
                    badge.color === 'stone' && "bg-stone-500/10 border-stone-500/20"
                  )}
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                    badge.color === 'yellow' && "bg-yellow-500/20",
                    badge.color === 'blue' && "bg-blue-500/20",
                    badge.color === 'stone' && "bg-stone-500/20"
                  )}>
                    {badge.emoji}
                  </div>
                  <div className="flex-1">
                    <p className={cn(
                      "font-semibold",
                      badge.color === 'yellow' && "text-yellow-400",
                      badge.color === 'blue' && "text-blue-400",
                      badge.color === 'stone' && "text-stone-400"
                    )}>
                      {badge.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{badge.desc}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{badge.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {step === 'history' && (
          <div className="p-5 animate-fade-in">
            <h1 className="text-xl font-semibold mb-4">Ride History</h1>
            
            <div className="space-y-2">
              {[
                { date: 'Today', time: '2:30 PM', distance: '45.2', duration: '57:00', speed: '78', convoy: true },
                { date: 'Yesterday', time: '10:15 AM', distance: '82.7', duration: '1:30:00', speed: '92', convoy: false },
                { date: 'Dec 15', time: '3:45 PM', distance: '67.3', duration: '1:20:00', speed: '85', convoy: true, hasPhotos: true },
              ].map((ride, i) => (
                <div key={i} className="bg-card/50 border border-border/30 rounded-xl p-3 animate-slide-up" style={{ animationDelay: `${i * 75}ms` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{ride.date}</p>
                      <p className="text-xs text-muted-foreground">{ride.time}</p>
                    </div>
                    <div className="flex gap-1">
                      {ride.convoy && (
                        <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" /> Convoy
                        </span>
                      )}
                      {ride.hasPhotos && (
                        <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Image className="w-2.5 h-2.5" /> 3
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{ride.distance} mi</span>
                    <span>{ride.duration}</span>
                    <span>Max {ride.speed} mph</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History Photos */}
        {step === 'history-photos' && (
          <div className="p-5 animate-fade-in">
            <h1 className="text-xl font-semibold mb-1">Dec 15 Ride</h1>
            <p className="text-sm text-muted-foreground mb-4">67.3 mi • 1:20:00</p>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-muted-foreground text-[10px] uppercase tracking-widest flex items-center gap-1">
                  <Image className="w-3 h-3" /> Photos (3/10)
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-border/30 flex items-center justify-center animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                    <Camera className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                ))}
                <button className="aspect-square rounded-xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center gap-1 hover:border-accent/50 transition-colors">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Add</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-accent/10 border border-accent/20 rounded-xl">
              <p className="text-sm text-accent flex items-center gap-2">
                <Camera className="w-4 h-4" />
                <span>Attach up to 10 photos per ride — stored locally</span>
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        {step === 'stats' && (
          <div className="p-5 animate-fade-in">
            <h1 className="text-xl font-semibold mb-4">Statistics</h1>

            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold">Convoy Badges</h2>
                <span className="ml-auto text-xs text-muted-foreground">6 earned</span>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                {[
                  { emoji: '⚡', count: 3, color: 'yellow' },
                  { emoji: '🛣️', count: 2, color: 'blue' },
                  { emoji: '🪨', count: 1, color: 'stone' },
                ].map((badge, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col items-center p-3 rounded-xl border",
                      badge.color === 'yellow' && "bg-yellow-500/10 border-yellow-500/20",
                      badge.color === 'blue' && "bg-blue-500/10 border-blue-500/20",
                      badge.color === 'stone' && "bg-stone-500/10 border-stone-500/20"
                    )}
                  >
                    <span className="text-2xl mb-1">{badge.emoji}</span>
                    <span className="font-mono text-xl font-semibold">{badge.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Total Rides', value: '13' },
                { label: 'Total Distance', value: '352 mi' },
                { label: 'Time Riding', value: '8:35' },
                { label: 'Top Speed', value: `${Math.round(maxSpeed)} mph` },
              ].map((stat, i) => (
                <div key={i} className="bg-card/50 rounded-xl p-3 border border-border/30 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="font-mono text-lg font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings - Interactive */}
        {step === 'settings' && (
          <div className="p-5 animate-fade-in">
            <h1 className="text-xl font-semibold mb-4">Settings</h1>

            <div className="space-y-3 mb-6">
              <div className="bg-card/50 border border-border/30 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Speed Unit</p>
                <DemoTooltip hint="Try changing" position="right" pulse={!hasInteracted && selectedUnit === 'mph'}>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setSelectedUnit('mph'); handleInteraction('setting'); }}
                      className={cn(
                        "flex-1 h-9 rounded-lg text-sm font-medium transition-colors",
                        selectedUnit === 'mph' ? "bg-accent text-accent-foreground" : "bg-secondary"
                      )}
                    >
                      mph
                    </button>
                    <button 
                      onClick={() => { setSelectedUnit('kph'); handleInteraction('setting'); }}
                      className={cn(
                        "flex-1 h-9 rounded-lg text-sm font-medium transition-colors",
                        selectedUnit === 'kph' ? "bg-accent text-accent-foreground" : "bg-secondary"
                      )}
                    >
                      kph
                    </button>
                  </div>
                </DemoTooltip>
              </div>

              <div className="bg-card/50 border border-border/30 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Navigation App</p>
                <div className="flex gap-2">
                  {['Google', 'Apple', 'Waze'].map((app, i) => (
                    <button 
                      key={app} 
                      onClick={() => { setSelectedNavApp(i); handleInteraction('setting'); }}
                      className={cn(
                        "flex-1 h-9 rounded-lg text-sm font-medium transition-colors",
                        selectedNavApp === i ? "bg-accent text-accent-foreground" : "bg-secondary"
                      )}
                    >
                      {app}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-card/50 border border-border/30 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Accent Color</p>
                <div className="flex gap-2">
                  {['orange', 'blue', 'pink', 'green'].map((color, i) => (
                    <button 
                      key={color}
                      className={cn(
                        "w-8 h-8 rounded-full transition-all",
                        color === 'orange' && "bg-orange-500",
                        color === 'blue' && "bg-blue-500",
                        color === 'pink' && "bg-pink-500",
                        color === 'green' && "bg-green-500",
                        i === 0 && "ring-2 ring-offset-2 ring-offset-background ring-orange-500"
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
              <div className="flex items-start gap-3">
                <Flame className="w-5 h-5 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-semibold text-destructive text-sm">Burn Button</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Permanently delete all ride data, stats, and convoy history. Your profile name is preserved.
                  </p>
                  <Button size="sm" variant="destructive" className="mt-3 h-8">
                    Burn All Data
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Complete */}
        {step === 'complete' && (
          <div className="min-h-[calc(100vh-12rem)] flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center mb-6">
              <Check className="w-10 h-10 text-accent" />
            </div>
            <h1 className="text-2xl font-semibold text-center mb-2">
              You're Ready!
            </h1>
            <p className="text-muted-foreground text-center text-sm max-w-xs mb-8">
              You've mastered all of Blacktop's features. Time to hit the road!
            </p>
            
            <div className="grid grid-cols-2 gap-2 text-xs max-w-xs w-full mb-8">
              {['Convoy Mode', 'Voice Chat', 'Multi-Waypoints', 'Rescue System', 'Live Tracking', 'Badge Awards', 'Ride Photos', 'Burn Button'].map((feature, i) => (
                <div key={i} className="flex items-center gap-1.5 text-muted-foreground">
                  <Check className="w-3 h-3 text-accent" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <Button onClick={exitDemo} className="h-12 px-8 rounded-xl">
              Get Started <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      {step !== 'complete' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 glass">
          <Button 
            onClick={nextStep} 
            className="w-full h-12 rounded-xl font-semibold"
            disabled={!canContinue}
          >
            {step === 'welcome' ? 'Start Tour' : canContinue ? 'Continue' : STEP_INTERACTIONS[step]} 
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
