import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import {
  Users, Mic, Navigation, AlertTriangle, Trophy, Camera,
  Gauge, Flame, Route, Shield, ChevronRight, Play, X,
  MapPin, Clock, TrendingUp, Crown, Copy, Check,
  Eye, Phone, Settings, History, Video,
  MessageSquare, Wrench, Disc3 as Bike, Map as MapIcon, Globe2, Folder, Gamepad2,
  Palette, QrCode, Mountain, CloudRain, MonitorSmartphone, Heart, Download, Ruler, Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { formatSpeed, formatDistance, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { TIER_LADDER, TIER_STYLES } from '@/features/cards/types';
import { Receipt, Sparkles } from 'lucide-react';
import shopAsset from '@/assets/garage-shop.png.asset.json';
import demoBikeAsset from '@/assets/demo-bike.png.asset.json';

interface FeatureCard {
  icon: React.ElementType;
  label: string;
  text: string;
}

interface Feature {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  mockup: React.ReactNode;
  cards?: FeatureCard[];
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
      id: 'ride-together',
      title: 'Ride Together',
      subtitle: 'Convoys, Voice & Solo Runs',
      description: 'Create or join a convoy of up to 8 with a simple code, talk hands-free over live voice, or head out solo — every mode shares the same tracking.',
      icon: Users,
      color: 'accent',
      mockup: <ConvoyMockup copied={copied} onCopy={() => setCopied(true)} />,
      cards: [
        { icon: Users, label: 'Convoy Mode', text: 'Up to 8 riders synced in real time via a shared code.' },
        { icon: Mic, label: 'Voice Comms', text: 'Hands-free chat with mute, disconnect and Bluetooth intercoms.' },
        { icon: Gauge, label: 'Solo Ride', text: 'Same tracking, no group needed — with Discord rescue on tap.' },
        { icon: QrCode, label: 'QR Join', text: 'Scan the lobby QR to jump straight into a convoy.' },
        { icon: MessageSquare, label: 'Lobby Chat', text: 'Sort the plan before you set off, live in the lobby.' },
        { icon: Crown, label: 'Leadership', text: 'Hand over the lead, or auto-promote when the leader drops.' },
      ],
    },
    {
      id: 'navigation',
      title: 'Navigation',
      subtitle: 'Maps, Waypoints & Camera Alerts',
      description: 'Search a destination and get a route in-app. Leaders drop multiple stops, everyone sees the same line — and you get warned about cameras ahead.',
      icon: MapIcon,
      color: 'accent',
      mockup: <MapsMockup />,
      cards: [
        { icon: MapIcon, label: 'Blacktop Maps', text: 'Built-in routing with live convoy dots coloured by accent.' },
        { icon: Route, label: 'Multi-Stop Routes', text: 'Add, reorder and skip waypoints mid-ride, up to five at a time.' },
        { icon: Eye, label: 'Camera Alerts', text: 'Speed and ANPR cameras on your route, flagged as you approach.' },
        { icon: Mountain, label: 'Satellite & 3D', text: 'Toggle satellite imagery or a 3D terrain and building view.' },
        { icon: CloudRain, label: 'Weather Radar', text: 'Optional live rain overlay so you can dodge the downpour.' },
        { icon: Navigation, label: 'Hand-Off', text: 'Send the route to Google, Apple or Waze and keep tracking.' },
      ],
    },
    {
      id: 'live-data',
      title: 'Live Ride Data',
      subtitle: 'Speed, Lean & G-Force',
      description: 'Big, glove-friendly GPS readouts backed by your phone\'s gyroscope and accelerometer for real-time lean angle and cornering G.',
      icon: Gauge,
      color: 'speed-active',
      mockup: <TrackingMockup speed={speed} distance={distance} />,
      cards: [
        { icon: Gauge, label: 'Speed & Distance', text: 'Real-time GPS speed, distance and duration at a glance.' },
        { icon: TrendingUp, label: 'Lean & G-Force', text: 'Max lean each way, peak G, and warnings near your threshold.' },
        { icon: Clock, label: 'Smart Timer', text: 'Idle rides auto-stop, so a forgotten session never logs 70 hours.' },
      ],
    },
    {
      id: 'safety',
      title: 'Safety Net',
      subtitle: 'Rescue, Crash Detection & Discord',
      description: 'One button pings your location to the convoy leader or your Discord. If a hard impact is followed by a stop, the app asks if you\'re okay — and calls for help if you don\'t answer.',
      icon: AlertTriangle,
      color: 'destructive',
      mockup: <RescueMockup />,
      cards: [
        { icon: AlertTriangle, label: 'Rescue', text: 'Sends your live position to the leader as a waypoint.' },
        { icon: Shield, label: 'Auto-Rescue', text: 'High-G impact plus a stop triggers a 5-minute check-in.' },
        { icon: MessageSquare, label: 'Discord', text: 'Webhook announces convoy starts and broadcasts rescue pings.' },
      ],
    },
    {
      id: 'after-ride',
      title: 'After The Ride',
      subtitle: 'History, Receipts, Badges & Overlays',
      description: 'Every ride is saved locally with photos, a shareable receipt, earned badges, and an MP4 stats overlay for your action-cam footage.',
      icon: History,
      color: 'accent',
      mockup: <HistoryMockup />,
      cards: [
        { icon: Camera, label: 'History & Photos', text: 'Full stats per ride, plus up to 9 photos, stored on device.' },
        { icon: Receipt, label: 'Ride Receipts', text: 'A printable stat slip with vehicle and badges, saved as an image.' },
        { icon: Video, label: 'Overlay Download', text: 'MP4 with live speed, lean, distance and a mini-map for editing in.' },
        { icon: Mic, label: 'Voice Recording', text: 'Optionally mix convoy voice chat into the overlay MP4.' },
        { icon: Mountain, label: '3D Flyover', text: 'A cinematic 3D pass over your route with stats, ready to save.' },
        { icon: Trophy, label: 'Badges & Stats', text: 'Speed Demon, Journeyman and Fallback roll into lifetime totals.' },
      ],
    },
    {
      id: 'garage',
      title: "Mecha-Nick's Garage",
      subtitle: 'Vehicles, Maintenance & Cards',
      description: 'Every vehicle in your stable gets its own photo, odometer, service intervals and a trading card that levels up as you ride it.',
      icon: Bike,
      color: 'accent',
      mockup: <GarageMockup />,
      cards: [
        { icon: Bike, label: 'Your Vehicles', text: 'Photo, odometer and lifetime stats per machine.' },
        { icon: Wrench, label: 'Maintenance', text: 'Chain, oil, brakes and tyres with bars that reset when serviced.' },
        { icon: History, label: 'Ride Assignment', text: 'Tag any ride to a vehicle and its stats roll up automatically.' },
        { icon: Sparkles, label: 'Trading Cards', text: 'Bronze at 10 rides all the way to Orion at 1000.' },
      ],
    },
    {
      id: 'trading-cards',
      title: 'Trading Cards',
      subtitle: 'Bronze To Orion',
      description: 'Every vehicle earns a collectable card that levels up with your ride count — ten tiers, each with its own finish. Swipe to see the whole ladder.',
      icon: Sparkles,
      color: 'accent',
      mockup: <TradingCardsMockup />,
      cards: [
        { icon: Sparkles, label: 'Tier Ladder', text: 'Locked, Bronze, Silver, Gold, Platinum, Diamond, Ruby, Obsidian, Polyatomic, Orion.' },
        { icon: Camera, label: 'Garage Shot', text: 'The card uses your garage placement and zoom, so it looks how you set it.' },
        { icon: QrCode, label: 'Share & Scan', text: 'Show your card QR — mates scan it straight into their vault.' },
        { icon: Folder, label: 'Card Vault', text: 'Collected cards are kept in your folder, exactly as the owner styled them.' },
      ],
    },
    {
      id: 'blacktop-world',
      title: 'Blacktop World',
      subtitle: 'Your Crew Hub On A Globe',
      description: 'Opt-in. Spin the globe and tap landmarks for crew convoys, leaderboards, crew QR joining, your card collection and the arcade — with an anonymous glow showing where riders are active.',
      icon: Globe2,
      color: 'accent',
      mockup: <BlacktopWorldMockup />,
      cards: [
        { icon: Users, label: 'Crew Convoys', text: 'A live list of your crew\'s open rides — tap for leader and riders.' },
        { icon: Trophy, label: 'Crew Leaderboards', text: 'Named rankings for distance, top speed, lean, rides and arcade.' },
        { icon: Folder, label: 'Crew QR & Cards', text: 'Scan a mate\'s QR to join their crew, or their card to collect it.' },
        { icon: Gamepad2, label: 'Arcade', text: 'Hit Heavy and Petrol Head, with personal bests saved locally.' },
      ],
    },
    {
      id: 'make-it-yours',
      title: 'Make It Yours',
      subtitle: 'Settings, Display & Support',
      description: 'Eight accent colours, your units, your speed alert thresholds — plus a car-display layout for wired mirroring and an install-to-home-screen build.',
      icon: Settings,
      color: 'accent',
      mockup: <PersonaliseMockup />,
      cards: [
        { icon: Palette, label: 'Accent Colours', text: 'Eight themes that recolour speed, dots and gauges app-wide.' },
        { icon: Ruler, label: 'Units & Alerts', text: 'MPH or KPH, miles or km, plus amber and red speed thresholds.' },
        { icon: MonitorSmartphone, label: 'Car Display', text: 'Oversized landscape layout for wired Android head-unit mirroring.' },
        { icon: Download, label: 'Install App', text: 'Add Blacktop to your home screen for a full-screen, offline-ready ride.' },
        { icon: Play, label: 'Demo Data', text: 'Hold the logo in settings to preview the app with sample stats.' },
        { icon: Heart, label: 'Tip Jar', text: 'No ads, no subscription — support the app only if you want to.' },
      ],
    },
    {
      id: 'privacy',
      title: 'Burn Button',
      subtitle: 'Your Data, Your Control',
      description: 'Everything lives on your device by default. One tap permanently deletes all ride history, stats and convoy data.',
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
    navigate('/settings');
  };

  const startApp = () => {
    haptics.success();
    navigate('/settings');
  };

  const isLastSlide = currentIndex === features.length - 1;
  const isFirstSlide = currentIndex === 0;

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-hidden">
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

      {/* Scrubber - jump to any slide */}
      <div className="fixed top-12 left-0 right-0 z-40 px-4">
        <input
          type="range"
          min={0}
          max={features.length - 1}
          step={1}
          value={currentIndex}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (next === currentIndex) return;
            haptics.light();
            setCurrentIndex(next);
          }}
          aria-label="Jump to slide"
          className="demo-scrubber w-full"
        />
      </div>


      {/* Main Content */}
      <main className="flex-1 flex flex-col pt-16 pb-44 overflow-y-auto">
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

          {/* Feature cards for grouped slides */}
          {currentFeature.cards && (
            <div className="mt-6 grid grid-cols-2 gap-2.5 animate-fade-in delay-200">
              {currentFeature.cards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-border/40 bg-card/60 p-3 flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2">
                    <card.icon className="w-4 h-4 text-accent flex-shrink-0" />
                    <p className="text-[11px] font-semibold tracking-wide">{card.label}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">{card.text}</p>
                </div>
              ))}
            </div>
          )}

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

      {/* Lobby tools */}
      <div className="grid grid-cols-3 gap-2 animate-slide-up delay-100">
        {[
          { icon: QrCode, label: 'QR Join' },
          { icon: MessageSquare, label: 'Lobby Chat' },
          { icon: Lock, label: 'Crew Listed' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-card/30 border border-border/30">
            <Icon className="w-4 h-4 text-accent" />
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
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







function MapsMockup() {
  const riders = [
    { name: 'You', color: 'bg-orange-500', top: '40%', left: '44%' },
    { name: 'Marcus', color: 'bg-blue-500', top: '60%', left: '64%' },
    { name: 'Sarah', color: 'bg-pink-500', top: '22%', left: '68%' },
  ];
  const [speakingIdx, setSpeakingIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpeakingIdx((prev) => (prev + 1) % riders.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [riders.length]);

  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="relative aspect-[4/5] rounded-2xl border border-border/30 bg-[#0d0d10] overflow-hidden animate-scale-in">
        {/* Faint road lines */}
        <svg className="absolute inset-0 w-full h-full opacity-25 text-muted-foreground" viewBox="0 0 100 125" preserveAspectRatio="none">
          <path d="M8 122 L38 70 L28 8" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M92 112 L56 58 L74 4" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M4 48 L96 64" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>

        {/* Route line to destination */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 125" preserveAspectRatio="none">
          <path d="M44 78 Q 54 54 64 60" stroke="hsl(var(--accent))" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </svg>

        {/* Weather radar wash */}
        <div className="absolute top-0 right-0 w-2/3 h-1/2 pointer-events-none opacity-30 bg-[radial-gradient(ellipse_at_top_right,hsl(200_90%_55%/0.5),transparent_65%)]" />

        {/* Search bar */}
        <div className="absolute top-2 left-2 right-2 h-7 rounded-full bg-card/90 border border-border/40 flex items-center px-3 animate-fade-in">
          <MapPin className="w-3 h-3 text-muted-foreground mr-1.5" />
          <span className="text-[9px] text-muted-foreground">Search destination...</span>
        </div>

        {/* Satellite + 3D toggles */}
        <div className="absolute right-2 top-11 flex flex-col gap-1.5 animate-fade-in delay-100">
          <div className="w-7 h-7 rounded-lg bg-accent border border-accent flex items-center justify-center shadow">
            <Mountain className="w-3.5 h-3.5 text-accent-foreground" />
          </div>
          <div className="w-7 h-7 rounded-lg bg-card/90 border border-border/40 flex items-center justify-center">
            <Globe2 className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        {/* Camera eyes — red speed, orange ANPR */}
        <div className="absolute top-[30%] left-[24%] w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/20 border border-red-500/70 flex items-center justify-center animate-scale-in delay-150">
          <Eye className="w-2.5 h-2.5 text-red-500" />
        </div>
        <div className="absolute top-[58%] left-[76%] w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/20 border border-orange-500/70 flex items-center justify-center animate-scale-in delay-200">
          <Eye className="w-2.5 h-2.5 text-orange-400" />
        </div>

        {/* Convoy member markers — glow cycles to show who's speaking */}
        {riders.map((rider, i) => (
          <div
            key={rider.name}
            className={cn(
              'absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 flex items-center justify-center text-[8px] font-bold text-white transition-all duration-300 animate-scale-in',
              rider.color,
              speakingIdx === i && 'scale-125 shadow-[0_0_10px_3px_rgba(255,255,255,0.5)]',
            )}
            style={{ top: rider.top, left: rider.left, animationDelay: `${i * 100}ms` }}
          >
            {rider.name[0]}
          </div>
        ))}

        {/* Waypoint carousel (max 5, horizontal) */}
        <div className="absolute bottom-10 left-2 right-2 flex gap-1.5 overflow-hidden animate-slide-up delay-200">
          {['⛽ Fuel', '🍔 Diner', '🌅 Sunset'].map((wp, i) => (
            <div key={wp} className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full border text-[8px] whitespace-nowrap',
              i === 0 ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-card/90 border-border/40 text-muted-foreground'
            )}>
              <span>{wp}</span>
              <X className="w-2 h-2 opacity-60" />
            </div>
          ))}
          <div className="flex items-center px-1.5 py-1 rounded-full bg-card/90 border border-dashed border-border/50 text-muted-foreground text-[8px]">+</div>
        </div>

        {/* Speed badge */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-card/95 border border-border/40 flex items-baseline gap-1 animate-slide-up delay-200">
          <span className="font-mono font-bold text-sm">58</span>
          <span className="text-[8px] text-muted-foreground">MPH</span>
        </div>
      </div>

      <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 animate-fade-in delay-300">
        <p className="text-xs text-center text-accent">Glows in their color when a rider talks · camera eyes warn you ahead</p>
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


function BlacktopWorldMockup() {
  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="relative h-56 rounded-2xl overflow-hidden bg-gradient-to-br from-[hsl(220_40%_8%)] via-[hsl(230_50%_12%)] to-black border border-border/30">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-40 h-40 rounded-full bg-[radial-gradient(circle_at_30%_30%,hsl(220_30%_25%),hsl(220_50%_8%))] shadow-[inset_-14px_-14px_36px_rgba(0,0,0,0.6),0_0_50px_hsl(var(--accent)/0.3)] animate-spin-slow">
            <span className="absolute top-5 left-9 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="absolute bottom-6 right-7 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="absolute top-1/2 right-3 w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="absolute top-8 right-10 w-1 h-1 rounded-full bg-rose-400 animate-pulse" />
            <span className="absolute bottom-10 left-8 w-1 h-1 rounded-full bg-sky-300 animate-pulse" />
          </div>
        </div>
        <div className="absolute top-2 left-2 right-2 flex justify-center pointer-events-none">
          <div className="px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm border border-white/[0.06]">
            <span className="text-[8px] tracking-[0.2em] uppercase text-white/60">live rider globe</span>
          </div>
        </div>
        <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-2 pointer-events-none">
          {[
            { c: '#fb923c', l: 'Fire' },
            { c: '#f87171', l: 'Volcano' },
            { c: '#60a5fa', l: 'Flood' },
            { c: '#c4b5fd', l: 'Quake' },
          ].map(({ c, l }) => (
            <div key={l} className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: c, boxShadow: `0 0 4px ${c}` }} />
              <span className="text-[8px] uppercase tracking-wider text-white/55">{l}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-center text-muted-foreground">
        Long-press the home globe to launch
      </p>
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
        Irreversible
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
                  {/* Card body is intentionally blurred — the tier finish and
                      title stay crisp so the progression reads clearly. */}
                  <div className="flex-1 flex flex-col gap-1.5 blur-[2px] select-none">
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
                  </div>
                  <div className="text-center text-[8px] font-semibold tracking-widest text-white/85 drop-shadow">
                    {t.label.toUpperCase()} · {t.minRides === 0 ? '0 RIDES' : `${t.minRides}+ RIDES`}
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



function PersonaliseMockup() {
  const swatches = [
    'hsl(38 95% 55%)', 'hsl(217 91% 60%)', 'hsl(142 71% 45%)', 'hsl(262 83% 58%)',
    'hsl(330 81% 60%)', 'hsl(0 84% 60%)', 'hsl(186 94% 50%)', 'hsl(84 85% 50%)',
  ];
  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="rounded-2xl border border-border/30 bg-card/50 p-4 animate-slide-up">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Accent Colour</p>
        <div className="grid grid-cols-8 gap-2">
          {swatches.map((c, i) => (
            <div
              key={c}
              className={cn(
                'aspect-square rounded-full animate-scale-in',
                i === 0 && 'ring-2 ring-offset-2 ring-offset-background ring-accent',
              )}
              style={{ background: c, animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-border/30 bg-card/50 p-4 space-y-3 animate-slide-up delay-200">
        {[
          { icon: Ruler, label: 'Units', value: 'MPH · Miles' },
          { icon: AlertTriangle, label: 'Speed alerts', value: '80 / 100' },
          { icon: MonitorSmartphone, label: 'Car display', value: 'Landscape' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon className="w-4 h-4 text-accent flex-shrink-0" />
            <span className="text-xs text-muted-foreground flex-1">{label}</span>
            <span className="text-xs font-mono font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
