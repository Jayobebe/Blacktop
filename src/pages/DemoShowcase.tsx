import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { 
  Users, Mic, Navigation, AlertTriangle, Trophy, Camera, 
  Gauge, Flame, Route, Shield, ChevronRight, Play, X,
  Volume2, MapPin, Clock, TrendingUp, Crown, Copy, Check,
  Zap, Eye, Phone, Settings, BarChart3, History, Video, User,
  MessageSquare, Wrench, Disc3 as Bike, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { formatSpeed, formatDistance, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { TIER_LADDER, TIER_STYLES } from '@/features/cards/types';
import { Receipt, Sparkles, Lock } from 'lucide-react';

interface Feature {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  mockup: React.ReactNode;
}

export default function DemoShowcase() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);

  // Animated values for mockups
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [copied, setCopied] = useState(false);

  const features: Feature[] = [
    {
      id: 'intro',
      title: 'BLACKTOP',
      subtitle: 'Ride Logging & Convoy Communication',
      description: 'Privacy-first companion for motorcyclists and drivers. No account required. Your data stays on your device.',
      icon: Shield,
      color: 'accent',
      mockup: <IntroMockup />
    },
    {
      id: 'convoy',
      title: 'Convoy Mode',
      subtitle: 'Ride Together, Stay Connected',
      description: 'Create or join a convoy with up to 8 members. Share a simple code and everyone\'s in. Real-time sync keeps the group together.',
      icon: Users,
      color: 'accent',
      mockup: <ConvoyMockup copied={copied} onCopy={() => setCopied(true)} />
    },
    {
      id: 'solo',
      title: 'Solo Ride',
      subtitle: 'Track Your Own Adventures',
      description: 'Don\'t need a group? Start a solo ride to track your speed, distance, and lean angle. Tap RESCUE anytime to ping your Discord with your live location.',
      icon: Gauge,
      color: 'accent',
      mockup: <SoloMockup />
    },
    {
      id: 'voice',
      title: 'Voice Communication',
      subtitle: 'Talk Hands-Free On the Road',
      description: 'Crystal clear voice chat with your convoy. Toggle mute anytime. Disconnect to save battery. Works alongside your music.',
      icon: Mic,
      color: 'voice-active',
      mockup: <VoiceMockup />
    },
    {
      id: 'waypoints',
      title: 'Multi-Waypoint Routes',
      subtitle: 'Plan Stops Along the Way',
      description: 'Leaders set multiple destinations. Drag to reorder. Navigate to each stop in sequence. Everyone sees the same route.',
      icon: Route,
      color: 'accent',
      mockup: <WaypointsMockup />
    },
    {
      id: 'tracking',
      title: 'Live Ride Tracking',
      subtitle: 'Speed, Distance, Duration',
      description: 'Real-time GPS tracking with large, glove-friendly display. Works in background while you use navigation apps.',
      icon: Gauge,
      color: 'speed-active',
      mockup: <TrackingMockup speed={speed} distance={distance} />
    },
    {
      id: 'lean',
      title: 'Lean Angle Sensor',
      subtitle: 'Track Your Cornering',
      description: 'Uses your phone\'s gyroscope to measure lean angle in real-time. See your max lean and get warnings when approaching your threshold.',
      icon: TrendingUp,
      color: 'accent',
      mockup: <LeanAngleMockup />
    },
    {
      id: 'rescue',
      title: 'Rescue System',
      subtitle: 'Never Leave Anyone Behind',
      description: 'In a convoy, tap RESCUE to send your location to the leader as a waypoint. On a solo ride, the same button pings your connected Discord so your crew knows where to find you.',
      icon: AlertTriangle,
      color: 'destructive',
      mockup: <RescueMockup />
    },
    {
      id: 'auto-rescue',
      title: 'Auto-Rescue',
      subtitle: 'Crash Detection That Calls For Help',
      description: 'Optional. If a high-G impact is followed by a stop, the app asks "Are you okay?". No reply in 5 minutes and a rescue ping fires automatically — to your convoy leader and Discord, or Discord only on solo rides.',
      icon: Shield,
      color: 'destructive',
      mockup: <AutoRescueMockup />
    },
    {
      id: 'discord',
      title: 'Discord Integration',
      subtitle: 'Loop In Your Crew',
      description: 'Connect a Discord webhook in Settings to auto-announce when a convoy starts and to broadcast rescue pings — for both convoy and solo rides — straight to your channel.',
      icon: MessageSquare,
      color: 'accent',
      mockup: <DiscordMockup />
    },
    {
      id: 'badges',
      title: 'Badge Awards',
      subtitle: 'Celebrate Every Ride',
      description: 'Earn badges in convoy rides: Speed Demon for top speed, Journeyman for most distance, Fallback for longest stationary.',
      icon: Trophy,
      color: 'accent',
      mockup: <BadgesMockup />
    },
    {
      id: 'history',
      title: 'Ride History & Photos',
      subtitle: 'Relive Your Adventures',
      description: 'Every ride saved with stats. Attach up to 10 photos per ride. All stored locally on your device.',
      icon: Camera,
      color: 'accent',
      mockup: <HistoryMockup />
    },
    {
      id: 'receipts',
      title: 'Ride Receipts',
      subtitle: 'Shareable Stat Slips',
      description: 'Every finished ride prints a receipt with your stats, vehicle, and badges. Download it as an image to share with the crew.',
      icon: Receipt,
      color: 'accent',
      mockup: <ReceiptMockup />
    },
    {
      id: 'studio',
      title: 'Overlay Download',
      subtitle: 'Sync Stats to Your Action Cam',
      description: 'Download an MP4 overlay after your ride with live speed, lean angle, distance, and duration. Layer it over your GoPro, DJI, or Insta360 footage in any video editor.',
      icon: Video,
      color: 'accent',
      mockup: <StudioMockup />
    },
    {
      id: 'stats',
      title: 'Lifetime Statistics',
      subtitle: 'Track Your Progress',
      description: 'Total rides, distance traveled, top speed achieved, badges earned. See your journey at a glance.',
      icon: BarChart3,
      color: 'accent',
      mockup: <StatsMockup />
    },
    {
      id: 'cards',
      title: 'Trading Cards',
      subtitle: 'Collect Every Tier',
      description: 'Each vehicle earns a trading card that levels up with rides — Bronze at 10, all the way to Orion at 1000. Download them as images for the collection.',
      icon: Sparkles,
      color: 'accent',
      mockup: <TradingCardsMockup />
    },
    {
      id: 'garage',
      title: "Mecha-Nick's Garage",
      subtitle: 'Your Vehicles, Your Stats',
      description: 'Add every vehicle in your stable. Snap a photo, set the odometer, and Mecha-Nick keeps lifetime stats and maintenance per vehicle — not just one big pile.',
      icon: Bike,
      color: 'accent',
      mockup: <GarageMockup />
    },
    {
      id: 'maintenance',
      title: 'Maintenance Tracker',
      subtitle: 'Never Miss a Service',
      description: 'Set service intervals for chain, oil, brakes, tyres and more. Progress bars fill as you rack up miles. Tap Serviced and the bar resets to zero.',
      icon: Wrench,
      color: 'accent',
      mockup: <MaintenanceMockup />
    },
    {
      id: 'bike-assignment',
      title: 'Assign Rides to Vehicles',
      subtitle: 'History Knows Which Vehicle',
      description: 'Pick the vehicle used for any ride straight from History. Distance, top speed and ride time roll up into that vehicle\'s garage stats automatically.',
      icon: History,
      color: 'accent',
      mockup: <BikeAssignmentMockup />
    },
    {
      id: 'privacy',
      title: 'Burn Button',
      subtitle: 'Your Data, Your Control',
      description: 'One tap to permanently delete all ride history, stats, and convoy data. Your profile name stays. Total privacy.',
      icon: Flame,
      color: 'burn',
      mockup: <BurnMockup />
    },
    {
      id: 'complete',
      title: 'Ready to Ride?',
      subtitle: 'Start Your First Convoy',
      description: 'Everything you need for group rides. No signup, no tracking, no ads. Just you and the road.',
      icon: Play,
      color: 'accent',
      mockup: <CompleteMockup />
    }
  ];

  const currentFeature = features[currentIndex];
  const progress = ((currentIndex + 1) / features.length) * 100;

  // Animate speed/distance for tracking mockup
  useEffect(() => {
    if (currentFeature.id !== 'tracking') return;
    
    const interval = setInterval(() => {
      setSpeed(prev => {
        const newSpeed = Math.max(45, Math.min(88, prev + (Math.random() - 0.4) * 8));
        return Math.round(newSpeed);
      });
      setDistance(prev => prev + 0.03);
    }, 400);

    return () => clearInterval(interval);
  }, [currentFeature.id]);

  // Reset states when changing features
  useEffect(() => {
    setCopied(false);
    setAnimationKey(prev => prev + 1);
    if (currentFeature.id === 'tracking') {
      setSpeed(62);
      setDistance(4.2);
    }
  }, [currentIndex]);

  const goNext = useCallback(() => {
    if (currentIndex >= features.length - 1 || isTransitioning) return;
    
    haptics.medium();
    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentIndex(prev => prev + 1);
      setIsTransitioning(false);
    }, 300);
  }, [currentIndex, features.length, isTransitioning]);

  const goPrev = useCallback(() => {
    if (currentIndex <= 0 || isTransitioning) return;
    
    haptics.light();
    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentIndex(prev => prev - 1);
      setIsTransitioning(false);
    }, 300);
  }, [currentIndex, isTransitioning]);

  const exitDemo = () => {
    haptics.light();
    navigate('/');
  };

  const startApp = () => {
    haptics.success();
    navigate('/');
  };

  const isLastSlide = currentIndex === features.length - 1;
  const isFirstSlide = currentIndex === 0;

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-secondary">
        <div 
          className="h-full bg-accent transition-all duration-500 ease-out" 
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-1 left-0 right-0 z-40 flex items-center justify-between px-4 py-3">
        <button 
          onClick={goPrev}
          disabled={isFirstSlide}
          className={cn(
            "text-sm font-medium transition-opacity",
            isFirstSlide ? "opacity-0 pointer-events-none" : "opacity-70 hover:opacity-100"
          )}
        >
          Back
        </button>
        <div className="flex items-center gap-1.5">
          {features.map((_, i) => (
            <div 
              key={i}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                i === currentIndex 
                  ? "w-4 bg-accent" 
                  : i < currentIndex 
                    ? "bg-accent/50" 
                    : "bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
        <button 
          onClick={exitDemo}
          className="text-sm font-medium opacity-70 hover:opacity-100 transition-opacity"
        >
          Skip
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col pt-16 pb-32">
        <div 
          key={animationKey}
          className={cn(
            "flex-1 flex flex-col px-6 transition-all duration-300",
            isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
          )}
        >
          {/* Icon */}
          <div className="flex justify-center mb-4 pt-4 animate-slide-down">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center",
              currentFeature.color === 'burn' && "bg-[hsl(var(--burn))]/20",
              currentFeature.color === 'voice-active' && "bg-[hsl(var(--voice-active))]/20",
              currentFeature.color === 'speed-active' && "bg-[hsl(var(--speed-active))]/20",
              currentFeature.color === 'destructive' && "bg-destructive/20",
              currentFeature.color === 'accent' && "bg-accent/15"
            )}>
              <currentFeature.icon className={cn(
                "w-8 h-8",
                currentFeature.color === 'burn' && "text-[hsl(var(--burn))]",
                currentFeature.color === 'voice-active' && "text-[hsl(var(--voice-active))]",
                currentFeature.color === 'speed-active' && "text-[hsl(var(--speed-active))]",
                currentFeature.color === 'destructive' && "text-destructive",
                currentFeature.color === 'accent' && "text-accent"
              )} />
            </div>
          </div>

          {/* Title & Description */}
          <div className="text-center mb-6 animate-fade-in">
            <h1 className="text-3xl font-semibold tracking-tight mb-1">
              {currentFeature.title}
            </h1>
            <p className={cn(
              "text-sm font-medium mb-3",
              currentFeature.color === 'burn' && "text-[hsl(var(--burn))]",
              currentFeature.color === 'voice-active' && "text-[hsl(var(--voice-active))]",
              currentFeature.color === 'speed-active' && "text-[hsl(var(--speed-active))]",
              currentFeature.color === 'destructive' && "text-destructive",
              currentFeature.color === 'accent' && "text-accent"
            )}>
              {currentFeature.subtitle}
            </p>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
              {currentFeature.description}
            </p>
          </div>

          {/* Mockup Area */}
          <div className="flex-1 flex items-center justify-center animate-scale-in delay-100">
            {currentFeature.mockup}
          </div>
        </div>
      </main>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-6 safe-bottom">
        {isLastSlide ? (
          <Button 
            onClick={startApp}
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            Get Started
          </Button>
        ) : (
          <Button 
            onClick={goNext}
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-accent hover:bg-accent/90 text-accent-foreground group"
          >
            <span>Continue</span>
            <ChevronRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============ MOCKUP COMPONENTS ============

function IntroMockup() {
  const features = [
    { icon: Users, label: 'Convoy' },
    { icon: Mic, label: 'Voice' },
    { icon: Route, label: 'Routes' },
    { icon: Gauge, label: 'Tracking' },
    { icon: Trophy, label: 'Badges' },
    { icon: Shield, label: 'Privacy' },
  ];

  return (
    <div className="w-full max-w-xs">
      <div className="grid grid-cols-3 gap-3">
        {features.map(({ icon: Icon, label }, i) => (
          <div 
            key={label}
            className="aspect-square bg-card/50 rounded-2xl border border-border/30 flex flex-col items-center justify-center gap-2 animate-scale-in"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <Icon className="w-6 h-6 text-accent" />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 bg-accent/10 rounded-xl border border-accent/20 animate-slide-up delay-500">
        <p className="text-xs text-center text-accent">🔒 No account required</p>
      </div>
    </div>
  );
}

function ConvoyMockup({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="w-full max-w-xs space-y-4">
      {/* Code Card */}
      <div className="bg-card/50 rounded-2xl border border-border/30 p-5 animate-slide-up">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest text-center mb-3">
          Convoy Code
        </p>
        <button 
          onClick={onCopy}
          className="w-full flex items-center justify-center gap-3"
        >
          <span className="font-mono text-3xl font-semibold tracking-[0.15em]">XK7M9P</span>
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
            copied ? "bg-accent" : "bg-secondary"
          )}>
            {copied ? (
              <Check className="w-5 h-5 text-accent-foreground" />
            ) : (
              <Copy className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </button>
      </div>

      {/* Members Preview */}
      <div className="space-y-2 animate-slide-up delay-200">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Members (4/8)
        </p>
        {[
          { name: 'You', isLeader: true, color: 'bg-orange-500' },
          { name: 'Marcus', isLeader: false, color: 'bg-blue-500' },
          { name: 'Sarah', isLeader: false, color: 'bg-pink-500' },
          { name: 'Jake', isLeader: false, color: 'bg-green-500' },
        ].map((member, i) => (
          <div 
            key={member.name}
            className={cn(
              "flex items-center gap-3 p-2.5 rounded-xl animate-slide-up",
              member.isLeader ? "bg-accent/10 border border-accent/20" : "bg-card/30"
            )}
            style={{ animationDelay: `${300 + i * 80}ms` }}
          >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", member.color)}>
              {member.isLeader ? (
                <Crown className="w-4 h-4 text-white" />
              ) : (
                <span className="text-xs font-semibold text-white">{member.name[0]}</span>
              )}
            </div>
            <span className={cn("text-sm font-medium", member.isLeader && "text-accent")}>
              {member.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SoloMockup() {
  return (
    <div className="w-full max-w-xs space-y-4">
      {/* Solo Ride Card */}
      <div className="bg-card/50 rounded-2xl border border-border/30 p-5 animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
            <User className="w-6 h-6 text-accent" />
          </div>
          <div>
            <p className="font-semibold">Solo Ride</p>
            <p className="text-xs text-muted-foreground">Just you and the road</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: Gauge, label: 'Speed' },
            { icon: Route, label: 'Distance' },
            { icon: TrendingUp, label: 'Lean' },
          ].map(({ icon: Icon, label }, i) => (
            <div key={label} className="p-2 bg-secondary/50 rounded-lg animate-scale-in" style={{ animationDelay: `${200 + i * 100}ms` }}>
              <Icon className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="p-3 bg-destructive/10 rounded-xl border border-destructive/30 animate-fade-in delay-300 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-destructive/20 border border-destructive flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-destructive">Rescue ping</p>
          <p className="text-[10px] text-muted-foreground">Sends your location to Discord</p>
        </div>
      </div>
    </div>
  );
}

function DiscordMockup() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % 3), 1400);
    return () => clearInterval(t);
  }, []);

  const messages = [
    { tag: 'CONVOY', text: '🏍️ Jake started a convoy — code A3F9', tone: 'text-accent' },
    { tag: 'RESCUE', text: '🚨 Sam needs rescue — maps.google.com/...', tone: 'text-destructive' },
    { tag: 'SOLO', text: '🚨 You need rescue — maps.google.com/...', tone: 'text-destructive' },
  ];

  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="bg-card/50 rounded-2xl border border-border/30 p-4 animate-slide-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#5865F2]/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-[#5865F2]" />
          </div>
          <div>
            <p className="font-semibold text-sm">#members</p>
            <p className="text-[10px] text-muted-foreground">Discord webhook connected</p>
          </div>
        </div>
        <div className="space-y-2">
          {messages.map((m, i) => (
            <div
              key={m.tag}
              className={cn(
                "flex items-start gap-2 p-2 rounded-lg border transition-all duration-300",
                step === i ? "bg-secondary/60 border-border/40 opacity-100" : "bg-secondary/20 border-transparent opacity-50"
              )}
            >
              <span className={cn("text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-background/60", m.tone)}>
                {m.tag}
              </span>
              <p className="text-[11px] text-foreground/90 flex-1">{m.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 animate-fade-in delay-300">
        <p className="text-xs text-center text-accent">Set up once in Settings → Integrations</p>
      </div>
    </div>
  );
}

function LeanAngleMockup() {
  const [lean, setLean] = useState(0);
  const [maxLean, setMaxLean] = useState(32);

  useEffect(() => {
    const interval = setInterval(() => {
      setLean(prev => {
        const newLean = Math.sin(Date.now() / 600) * 38 + (Math.random() - 0.5) * 5;
        const clamped = Math.max(-45, Math.min(45, newLean));
        setMaxLean(m => Math.max(m, Math.abs(clamped)));
        return Math.round(clamped);
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const leanRotation = (lean / 90) * 90;

  return (
    <div className="w-full max-w-xs space-y-4 text-center">
      {/* Lean Arc Visualization */}
      <div className="relative animate-scale-in">
        <svg className="w-48 h-24 mx-auto" viewBox="0 0 120 50">
          {/* Background arc */}
          <path
            d="M 10 50 A 50 40 0 0 1 110 50"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            className="text-secondary"
          />
          {/* Active indicator */}
          <circle
            cx={60 + Math.sin(leanRotation * Math.PI / 180) * 45}
            cy={50 - Math.cos(leanRotation * Math.PI / 180) * 35}
            r="8"
            className={cn(
              "transition-all duration-100",
              Math.abs(lean) > 35 ? "fill-destructive" : Math.abs(lean) > 25 ? "fill-orange-500" : "fill-accent"
            )}
          />
        </svg>
        <p className="text-4xl font-mono font-bold mt-2">{Math.abs(lean)}°</p>
        <p className="text-xs text-muted-foreground">{lean < 0 ? 'Left' : lean > 0 ? 'Right' : 'Upright'}</p>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-4 animate-slide-up delay-200">
        <div className="bg-card/50 rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground">Max Lean</p>
          <p className="font-mono text-lg font-semibold text-accent">{maxLean}°</p>
        </div>
        <div className="bg-card/50 rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground">Threshold</p>
          <p className="font-mono text-lg font-semibold text-destructive">40°</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground animate-fade-in delay-300">
        ⚠️ Glows red when approaching threshold
      </p>
    </div>
  );
}


function StudioMockup() {
  return (
    <div className="w-full max-w-xs space-y-4">
      {/* Overlay Preview */}
      <div className="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden animate-scale-in">
        {/* Fake action cam background */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900" />
        
        {/* Overlay stats */}
        <div className="absolute inset-x-0 bottom-0">
          <div 
            className="h-8"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)'
            }}
          />
          <div className="absolute bottom-1.5 inset-x-3 flex justify-between items-end text-white font-mono">
            <span className="text-[10px]">12.4 mi</span>
            <div className="text-center">
              <span className="text-[8px] text-gray-400 block">SPEED</span>
              <span className="text-lg font-bold">67</span>
            </div>
            <span className="text-[10px]">0:23:45</span>
          </div>
        </div>
        
        {/* Download indicator */}
        <div className="absolute top-2 right-2 px-2 py-1 bg-accent rounded-lg text-[10px] font-semibold text-accent-foreground flex items-center gap-1">
          <Video className="w-3 h-3" />
          MP4
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2 animate-slide-up delay-200">
        {[
          { step: '1', label: 'Ride with your action cam recording' },
          { step: '2', label: 'Download overlay from ride history' },
          { step: '3', label: 'Layer in CapCut, Premiere, or DaVinci' },
        ].map((item, i) => (
          <div 
            key={i} 
            className="flex items-center gap-3 p-2 bg-card/30 rounded-lg animate-slide-up"
            style={{ animationDelay: `${300 + i * 100}ms` }}
          >
            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
              {item.step}
            </div>
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center animate-fade-in delay-500">
        🔒 All processing happens on your device
      </p>
    </div>
  );
}

function VoiceMockup() {
  const [speaking, setSpeaking] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpeaking(prev => {
        const options = [null, 0, 1, 2];
        return options[Math.floor(Math.random() * options.length)];
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const members = [
    { name: 'You', color: 'bg-orange-500' },
    { name: 'Marcus', color: 'bg-blue-500' },
    { name: 'Sarah', color: 'bg-pink-500' },
  ];

  return (
    <div className="w-full max-w-xs space-y-6">
      {/* Voice Visualizer */}
      <div className="flex items-center justify-center gap-1 h-16">
        {[...Array(12)].map((_, i) => (
          <div 
            key={i}
            className="w-1.5 bg-[hsl(var(--voice-active))] rounded-full transition-all duration-150"
            style={{ 
              height: speaking !== null ? `${20 + Math.random() * 40}px` : '8px',
              opacity: speaking !== null ? 0.8 : 0.3
            }}
          />
        ))}
      </div>

      {/* Members */}
      <div className="space-y-2">
        {members.map((member, i) => (
          <div 
            key={member.name}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all duration-300 animate-slide-up",
              speaking === i 
                ? "bg-[hsl(var(--voice-active))]/15 border border-[hsl(var(--voice-active))]/30 shadow-[0_0_20px_hsl(var(--voice-active)/0.2)]" 
                : "bg-card/30"
            )}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              member.color,
              speaking === i && "ring-2 ring-[hsl(var(--voice-active))]"
            )}>
              <span className="text-sm font-semibold text-white">{member.name[0]}</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">{member.name}</p>
              <p className="text-xs text-muted-foreground">
                {speaking === i ? 'Speaking...' : 'Connected'}
              </p>
            </div>
            {speaking === i && (
              <Volume2 className="w-5 h-5 text-[hsl(var(--voice-active))] animate-pulse-soft" />
            )}
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div className="flex justify-center gap-3 animate-fade-in delay-300">
        <div className="px-4 py-2 bg-secondary/50 rounded-xl text-xs text-muted-foreground">
          🎤 Toggle Mute
        </div>
        <div className="px-4 py-2 bg-secondary/50 rounded-xl text-xs text-muted-foreground">
          🔌 Disconnect
        </div>
      </div>
    </div>
  );
}

function WaypointsMockup() {
  const waypoints = [
    { name: 'Gas Station', icon: '⛽', completed: true },
    { name: 'Mountain Diner', icon: '🍔', completed: false },
    { name: 'Sunset Point', icon: '🌅', completed: false },
  ];

  return (
    <div className="w-full max-w-xs space-y-3">
      {waypoints.map((wp, i) => (
        <div 
          key={wp.name}
          className={cn(
            "flex items-center gap-3 p-4 rounded-xl border animate-slide-up",
            wp.completed 
              ? "bg-accent/10 border-accent/20" 
              : "bg-card/50 border-border/30"
          )}
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <div className="flex items-center justify-center w-10 h-10 text-xl">
            {wp.icon}
          </div>
          <div className="flex-1">
            <p className={cn(
              "font-medium text-sm",
              wp.completed && "text-accent"
            )}>
              {wp.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {wp.completed ? '✓ Completed' : `Stop ${i + 1}`}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
            <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
            <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
          </div>
        </div>
      ))}
      <div className="text-center pt-2 animate-fade-in delay-400">
        <p className="text-xs text-muted-foreground">Drag handles to reorder</p>
      </div>
    </div>
  );
}

function TrackingMockup({ speed, distance }: { speed: number; distance: number }) {
  const { settings } = useSettings();
  const sLabel = getSpeedLabel(settings.speedUnit);
  const dLabel = getDistanceLabel(settings.distanceUnit);
  return (
    <div className="w-full max-w-xs text-center space-y-6">
      {/* Speed Display */}
      <div className="animate-scale-in">
        <p className="text-[6rem] font-mono font-black leading-none text-accent animate-speed-glow">
          {formatSpeed(speed, settings.speedUnit)}
        </p>
        <p className="text-muted-foreground text-sm -mt-2">{sLabel}</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 animate-slide-up delay-200">
        <div className="bg-card/50 rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground mb-1">Distance</p>
          <p className="font-mono text-lg font-semibold">{formatDistance(distance, settings.distanceUnit)}</p>
          <p className="text-[10px] text-muted-foreground">{dLabel}</p>
        </div>
        <div className="bg-card/50 rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground mb-1">Time</p>
          <p className="font-mono text-lg font-semibold">12:34</p>
        </div>
        <div className="bg-card/50 rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground mb-1">Max</p>
          <p className="font-mono text-lg font-semibold">{formatSpeed(92, settings.speedUnit)}</p>
          <p className="text-[10px] text-muted-foreground">{sLabel}</p>
        </div>
      </div>

      {/* Background tracking hint */}
      <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 animate-fade-in delay-300">
        <p className="text-xs text-accent">📱 Continues tracking in background</p>
      </div>
    </div>
  );
}

function RescueMockup() {
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowAlert(true), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full max-w-xs space-y-4">
      {/* Rescue Button */}
      <div className="flex justify-center animate-scale-in">
        <div className="w-24 h-24 rounded-full bg-destructive/20 border-2 border-destructive flex items-center justify-center animate-pulse-soft">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
      </div>

      {/* Alert Card */}
      {showAlert && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 animate-scale-in">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-white">J</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-destructive">Jake needs rescue!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Location shared • 2.4 mi away
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <div className="flex-1 py-2 bg-destructive/20 rounded-xl text-center">
              <span className="text-xs font-medium text-destructive">Add Waypoint</span>
            </div>
            <div className="flex-1 py-2 bg-secondary/50 rounded-xl text-center">
              <span className="text-xs font-medium text-muted-foreground">Dismiss</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-center animate-fade-in delay-500">
        <p className="text-xs text-muted-foreground">
          Lost members send location to leader
        </p>
      </div>
    </div>
  );
}

function BadgesMockup() {
  const badges = [
    { name: 'Speed Demon', emoji: '⚡', desc: 'Top Speed', color: 'bg-yellow-500/20 border-yellow-500/30' },
    { name: 'Journeyman', emoji: '🛣️', desc: 'Most Distance', color: 'bg-blue-500/20 border-blue-500/30' },
    { name: 'Fallback', emoji: '🪨', desc: 'Longest Stationary', color: 'bg-stone-500/20 border-stone-500/30' },
  ];

  return (
    <div className="w-full max-w-xs space-y-3">
      {badges.map((badge, i) => (
        <div 
          key={badge.name}
          className={cn(
            "flex items-center gap-4 p-4 rounded-2xl border animate-slide-up",
            badge.color
          )}
          style={{ animationDelay: `${i * 150}ms` }}
        >
          <div className="text-3xl">{badge.emoji}</div>
          <div className="flex-1">
            <p className="font-semibold">{badge.name}</p>
            <p className="text-xs text-muted-foreground">{badge.desc}</p>
          </div>
          <Trophy className="w-5 h-5 text-accent" />
        </div>
      ))}
      <div className="text-center pt-2 animate-fade-in delay-500">
        <p className="text-xs text-muted-foreground">Earned in convoy rides with 2+ members</p>
      </div>
    </div>
  );
}

function HistoryMockup() {
  const rides = [
    { date: 'Today', distance: '45.2 mi', time: '1:23:45', badge: '⚡' },
    { date: 'Yesterday', distance: '28.7 mi', time: '0:52:18', badge: '🛣️' },
    { date: 'Dec 14', distance: '62.1 mi', time: '2:05:33', badge: null },
  ];

  return (
    <div className="w-full max-w-xs space-y-3">
      {rides.map((ride, i) => (
        <div 
          key={i}
          className="bg-card/50 rounded-xl border border-border/30 p-4 animate-slide-up"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{ride.date}</p>
            {ride.badge && <span className="text-lg">{ride.badge}</span>}
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Route className="w-3 h-3" /> {ride.distance}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {ride.time}
            </span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 pt-2 animate-fade-in delay-400">
        <Camera className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Tap ride to add photos</p>
      </div>
    </div>
  );
}

function StatsMockup() {
  const { settings } = useSettings();
  const stats = [
    { label: 'Total Rides', value: '47' },
    { label: 'Distance', value: formatDistance(1248, settings.distanceUnit), unit: getDistanceLabel(settings.distanceUnit) },
    { label: 'Top Speed', value: String(formatSpeed(112, settings.speedUnit)), unit: getSpeedLabel(settings.speedUnit) },
    { label: 'Ride Time', value: '32:15' },
  ];

  return (
    <div className="w-full max-w-xs">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, i) => (
          <div 
            key={stat.label}
            className="bg-card/50 rounded-2xl border border-border/30 p-4 text-center animate-scale-in"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <p className="text-2xl font-mono font-bold">
              {stat.value}
              {stat.unit && <span className="text-sm text-muted-foreground ml-1">{stat.unit}</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 animate-slide-up delay-400">
        {['⚡ 12', '🛣️ 8', '🪨 5'].map((badge, i) => (
          <div key={i} className="bg-accent/10 rounded-xl p-2 text-center">
            <span className="text-sm">{badge}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BurnMockup() {
  const [burned, setBurned] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBurned(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full max-w-xs text-center space-y-6">
      <div 
        className={cn(
          "w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all duration-500",
          burned 
            ? "bg-[hsl(var(--burn))]/30 animate-burn-pulse" 
            : "bg-secondary"
        )}
      >
        <Flame className={cn(
          "w-12 h-12 transition-colors duration-500",
          burned ? "text-[hsl(var(--burn))]" : "text-muted-foreground"
        )} />
      </div>

      <div className="space-y-3 animate-fade-in delay-200">
        <div className={cn(
          "py-2 px-4 rounded-xl text-sm transition-all duration-500",
          burned ? "bg-[hsl(var(--burn))]/10 text-[hsl(var(--burn))]" : "bg-secondary text-muted-foreground"
        )}>
          {burned ? '✓ All data deleted' : 'Ride history'}
        </div>
        <div className={cn(
          "py-2 px-4 rounded-xl text-sm transition-all duration-500 delay-100",
          burned ? "bg-[hsl(var(--burn))]/10 text-[hsl(var(--burn))]" : "bg-secondary text-muted-foreground"
        )}>
          {burned ? '✓ All data deleted' : 'Statistics'}
        </div>
        <div className={cn(
          "py-2 px-4 rounded-xl text-sm transition-all duration-500 delay-200",
          burned ? "bg-[hsl(var(--burn))]/10 text-[hsl(var(--burn))]" : "bg-secondary text-muted-foreground"
        )}>
          {burned ? '✓ All data deleted' : 'Convoy data'}
        </div>
      </div>

      <p className="text-xs text-muted-foreground animate-fade-in delay-500">
        Profile name is kept • Irreversible
      </p>
    </div>
  );
}

function CompleteMockup() {
  return (
    <div className="w-full max-w-xs text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-3xl bg-accent/20 flex items-center justify-center animate-float">
        <Play className="w-10 h-10 text-accent" />
      </div>

      <div className="space-y-4 animate-slide-up delay-200">
        <div className="flex items-center justify-center gap-3">
          <Shield className="w-5 h-5 text-accent" />
          <span className="text-sm">No signup required</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Eye className="w-5 h-5 text-accent" />
          <span className="text-sm">No tracking or ads</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Phone className="w-5 h-5 text-accent" />
          <span className="text-sm">Data stays on device</span>
        </div>
      </div>
    </div>
  );
}

function GarageMockup() {
  const { settings } = useSettings();
  const bikes = [
    { name: 'Daily Twin', model: 'Yamaha MT-07', km: 12480, emoji: '🏍️', active: true },
    { name: 'Track Toy', model: 'Aprilia RS660', km: 3210, emoji: '🏁', active: false },
  ];

  return (
    <div className="w-full max-w-xs space-y-3">
      {bikes.map((bike, i) => (
        <div
          key={bike.name}
          className={cn(
            "rounded-2xl border p-4 animate-slide-up",
            bike.active
              ? "bg-accent/10 border-accent/40"
              : "bg-card/50 border-border/30"
          )}
          style={{ animationDelay: `${i * 150}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl">
              {bike.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold truncate">{bike.name}</p>
                {bike.active && (
                  <span className="text-[10px] uppercase tracking-wide text-accent font-medium">Active</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{bike.model}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Odometer</span>
            <span className="font-mono font-semibold">
              {formatDistance(bike.km, settings.distanceUnit)} {getDistanceLabel(settings.distanceUnit)}
            </span>
          </div>
        </div>
      ))}
      <p className="text-center text-xs text-muted-foreground animate-fade-in delay-400">
        Each vehicle keeps its own stats & maintenance
      </p>
    </div>
  );
}

function MaintenanceMockup() {
  const { settings } = useSettings();
  const [chainPct, setChainPct] = useState(15);
  const [serviced, setServiced] = useState(false);

  useEffect(() => {
    setChainPct(15);
    setServiced(false);
    let p = 15;
    const interval = setInterval(() => {
      p += 6;
      if (p >= 90) {
        setChainPct(0);
        setServiced(true);
        p = 0;
        setTimeout(() => setServiced(false), 800);
      } else {
        setChainPct(p);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const parts = [
    { name: 'Chain lube', intervalKm: 500, pct: chainPct, highlight: true },
    { name: 'Engine oil', intervalKm: 5000, pct: 62, highlight: false },
    { name: 'Brake pads', intervalKm: 10000, pct: 38, highlight: false },
  ];

  return (
    <div className="w-full max-w-xs space-y-3">
      {parts.map((part, i) => (
        <div
          key={part.name}
          className={cn(
            "bg-card/50 rounded-xl border p-3 animate-slide-up",
            part.highlight ? "border-accent/40" : "border-border/30"
          )}
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-sm font-medium">{part.name}</p>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              every {formatDistance(part.intervalKm, settings.distanceUnit)} {getDistanceLabel(settings.distanceUnit)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500 ease-out",
                part.pct >= 80 ? "bg-destructive" : "bg-accent"
              )}
              style={{ width: `${part.pct}%` }}
            />
          </div>
          {part.highlight && (
            <div className="mt-2 flex justify-end">
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                serviced
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-secondary border-border/30 text-muted-foreground"
              )}>
                {serviced ? '✓ Serviced — reset' : 'Tap Serviced to reset'}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BikeAssignmentMockup() {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('Daily Twin');

  useEffect(() => {
    const t1 = setTimeout(() => setOpen(true), 700);
    const t2 = setTimeout(() => { setSelected('Track Toy'); setOpen(false); }, 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const distLabel = getDistanceLabel(settings.distanceUnit);
  const distValue = formatDistance(45.2, settings.distanceUnit);

  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="bg-card/50 rounded-xl border border-border/30 p-4 animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Today's Ride</p>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded-md border border-border/40"
          >
            <Bike className="w-3 h-3 text-accent" />
            <span className="font-medium">{selected}</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
          </button>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Route className="w-3 h-3" /> {distValue} {distLabel}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> 1:23:45
          </span>
        </div>
        {open && (
          <div className="mt-3 rounded-lg border border-border/40 bg-background/80 overflow-hidden animate-fade-in">
            {['Daily Twin', 'Track Toy'].map(b => (
              <div
                key={b}
                className={cn(
                  "px-3 py-2 text-xs flex items-center justify-between",
                  b === selected && "bg-accent/10 text-accent"
                )}
              >
                <span>{b}</span>
                {b === selected && <Check className="w-3 h-3" />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center text-accent animate-pulse">
        <ChevronDown className="w-5 h-5" />
      </div>

      <div className="bg-accent/10 rounded-xl border border-accent/30 p-4 animate-slide-up delay-200">
        <div className="flex items-center gap-2 mb-2">
          <Bike className="w-4 h-4 text-accent" />
          <p className="text-sm font-semibold">{selected}</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          +{distValue} {distLabel} added to this vehicle's lifetime stats
        </p>
      </div>
    </div>
  );
}

function ReceiptMockup() {
  return (
    <div className="w-full max-w-[260px] mx-auto animate-receipt-print">
      <div className="receipt-edge-top" />
      <div className="receipt relative px-5 py-4 font-receipt text-[--ink]">
        <div className="text-center mb-2">
          <div className="text-xl font-bold tracking-[0.18em]">BLACKTOP STORE</div>
          <div className="text-[10px] tracking-[0.3em] opacity-70 mt-0.5">— RIDE RECEIPT —</div>
        </div>
        <div className="my-2 border-t-2 border-dashed border-[--ink] opacity-60" />
        <div className="space-y-1 text-xs">
          {[
            ['Vehicle', 'Daily Twin'],
            ['Max Spd', '92 mph'],
            ['Max Lean', '38°'],
            ['Distance', '24.6 mi'],
            ['Duration', '0:47:12'],
            ['Avg Spd', '31 mph'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="tracking-wider opacity-80">{k}</span>
              <span className="font-bold">{v}</span>
            </div>
          ))}
        </div>
        <div className="my-2 border-t-2 border-dashed border-[--ink] opacity-60" />
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { e: '⚡', l: 'SPEED' },
            { e: '🛣️', l: 'JOURNEY' },
            { e: '🏔️', l: 'LEAN' },
          ].map(b => (
            <div key={b.l} className="receipt-bracket text-center px-1 py-2">
              <span className="receipt-bracket-tr" />
              <span className="receipt-bracket-bl" />
              <div className="text-base leading-none">{b.e}</div>
              <div className="text-[8px] font-bold tracking-wider mt-1">{b.l}</div>
            </div>
          ))}
        </div>
        <div className="my-2 border-t-2 border-dashed border-[--ink] opacity-60" />
        <div className="text-center">
          <div className="text-[10px] tracking-[0.25em]">THANK YOU FOR THE RIDE</div>
          <div className="receipt-barcode mt-2" aria-hidden />
        </div>
      </div>
      <div className="receipt-edge-bottom" />
    </div>
  );
}

function TradingCardsMockup() {
  const tiers = TIER_LADDER;
  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="-mx-6 px-6 overflow-x-auto snap-x snap-mandatory scrollbar-none">
        <div className="flex gap-3 pb-2">
          {tiers.map((t, i) => {
            const style = TIER_STYLES[t.id];
            const locked = t.id === 'locked';
            return (
              <div
                key={t.id}
                className={cn(
                  'relative shrink-0 snap-center w-[150px] aspect-[5/7] rounded-xl border-2 overflow-hidden shadow-lg flex flex-col animate-scale-in',
                  style.bg,
                  style.border,
                )}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {style.shine && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute inset-0 animate-card-shine" />
                  </div>
                )}
                {style.sparkle && (
                  <div className="absolute inset-0 pointer-events-none opacity-60 [background-image:radial-gradient(circle_at_20%_30%,white_0.5px,transparent_1px),radial-gradient(circle_at_70%_60%,white_0.5px,transparent_1px),radial-gradient(circle_at_45%_80%,white_0.5px,transparent_1px),radial-gradient(circle_at_85%_20%,white_0.5px,transparent_1px)] [background-size:60px_60px,70px_70px,50px_50px,80px_80px]" />
                )}
                <div className="relative flex-1 flex flex-col p-2 gap-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-bold tracking-wider text-white drop-shadow truncate">
                      VEHICLE
                    </span>
                    <span className={cn(
                      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider',
                      style.chip,
                    )}>
                      {locked ? <Lock className="w-2 h-2" /> : <Sparkles className="w-2 h-2" />}
                      {t.label}
                    </span>
                  </div>
                  <div className="relative rounded-md bg-black/30 border border-white/10 aspect-[4/3] flex items-center justify-center">
                    {locked ? (
                      <Lock className="w-5 h-5 text-white/60" />
                    ) : (
                      <div className="text-[10px] text-white/50 font-mono">PHOTO</div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-auto">
                    {['SPD', 'DST', 'TIME', 'RIDES'].map(s => (
                      <div key={s} className="rounded bg-black/40 border border-white/10 px-1 py-0.5">
                        <div className="text-[7px] tracking-widest text-white/60">{s}</div>
                        <div className="text-[9px] font-mono font-bold text-white">
                          {locked ? '—' : '••'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-center text-[7px] tracking-widest text-white/60">
                    {t.minRides === 0 ? '0 rides' : `${t.minRides}+ rides`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center animate-fade-in delay-300">
        ← swipe to see every tier from Bronze to Orion →
      </p>
    </div>
  );
}


