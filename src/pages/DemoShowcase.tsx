import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import {
  Users, Mic, Navigation, AlertTriangle, Trophy, Camera,
  Gauge, Flame, Route, Shield, ChevronRight, Play, X,
  MapPin, Clock, TrendingUp, Crown, Copy, Check,
  Eye, Phone, Settings, History, Video,
  MessageSquare, Wrench, Disc3 as Bike, Map as MapIcon, Globe2, Folder, Gamepad2,
  Palette, QrCode, Mountain, CloudRain, MonitorSmartphone, Heart, Download, Ruler, Lock, Waves, Repeat,
  CornerUpRight, Share2, Flag, CalendarClock, Zap, Skull
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { formatSpeed, formatDistance, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { TIER_LADDER, TIER_STYLES } from '@/features/cards/types';
import { IdCard, Receipt, Sparkles } from 'lucide-react';
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
        { icon: Waves, label: 'Direct or Twisty', text: 'Pick your line before you go — both ETAs shown side by side.' },
        { icon: CloudRain, label: 'Weather Routing', text: 'Warns when heavy rain sits on your route and offers a drier line.' },
        { icon: Repeat, label: 'Loop Planner', text: 'No destination? Generate a twisty round trip back to where you are.' },
        { icon: Download, label: 'Offline Maps', text: 'Save map areas to your phone for rides with no signal.' },
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
      mockup: <TrackingMockup />,
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
        { icon: CornerUpRight, label: 'Corner Report', text: 'Every corner detected and scored 0-100 on line, lean and pace, with a ride grade.' },
        { icon: Share2, label: 'Recap Card', text: 'One tap renders a shareable image of your route, stats and corner grade.' },
        { icon: Trophy, label: 'Badges & Stats', text: 'Speed Demon, Journeyman, Lean Fiend, G-Lock, Corner Carver, Night Owl, Hard Ass and Always Out bank points in a 3×3 grid — Kickback joins them when riders collect your drops, while Fallback docks a point from a full-width row below.' },
        { icon: Sparkles, label: 'Badge Trades', text: 'Badges are currency: spend 10 banked badge points for a spare trading-card copy to drop on the map. Kickbacks from collected drops feed the same wallet.' },
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
        { icon: CalendarClock, label: 'Time Reminders', text: 'Set "every N months" alongside mileage — whichever comes first nags you.' },
        { icon: History, label: 'Ride Assignment', text: 'Tag any ride to a vehicle and its stats roll up automatically.' },
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
        { icon: MapIcon, label: 'Card Drops', text: 'Spare copies — earned from tier milestones, crew challenges and 10-badge trades — can be planted on the Blacktop map, exactly where you\'re standing. Confirm with Yes / No, no map-pin fiddling.' },
        { icon: MapPin, label: 'Go Collect', text: 'Cards show as landmarks with distance and time away. Pull up beside one to scan it; collected cards get a green tick.' },
        { icon: IdCard, label: 'Hot-Spots', text: 'Cards stacked at one spot merge into a heat-coloured hot-spot with a count badge — tap it for a two-column list and collect them all at once.' },
      ],
    },
    {
      id: 'blacktop-world',
      title: 'Blacktop World',
      subtitle: 'Your Crew Hub On A Globe',
      description: 'Opt-in. Spin the globe and tap landmarks for crew convoys, leaderboards, the weekly crew challenge, crew QR joining, your card collection and the arcade — with an anonymous glow showing where riders are active.',
      icon: Globe2,
      color: 'accent',
      mockup: <BlacktopWorldMockup />,
      cards: [
        { icon: Users, label: 'Crew Convoys', text: 'A live list of your crew\'s open rides — tap for leader and riders.' },
        { icon: Trophy, label: 'Crew Leaderboards', text: 'Named rankings for distance, top speed, lean, rides and arcade.' },
        { icon: Folder, label: 'Crew QR & Cards', text: 'Scan a mate\'s QR to join their crew, or their card to collect it.' },
        { icon: Flag, label: 'Challenges', text: 'Two rotating crew challenges every week — miles, corners, lean, ride count, top speed, night rides and longest ride — plus a monthly Forzathon-style crew goal you chase together, with special event weeks through the year.' },
        { icon: Gamepad2, label: 'Arcade', text: 'Hit Heavy, Petrol Head and Legacy Derez — personal bests and win tallies saved locally.' },
      ],
    },
    {
      id: 'legacy-derez',
      title: 'Legacy Derez',
      subtitle: 'Tron-Style Light-Bike Arena',
      description: 'Two or more riders draw a live arena on the map, ready up, then ride inside it. Your GPS trail becomes a glowing wall in your accent colour — crash into someone else\'s line and you\'re out.',
      icon: Gamepad2,
      color: 'accent',
      mockup: <DerezMockup />,
      cards: [
        { icon: MapIcon, label: 'Draw The Grid', text: 'The lobby leader freehands the game space on a map — a car park, a lot, any closed loop.' },
        { icon: Users, label: 'Ready Up', text: 'Everyone joins by code or QR, picks an accent colour, then taps Ready.' },
        { icon: Zap, label: 'Live Trails', text: 'High-frequency GPS paints a wall behind every rider in their own colour.' },
        { icon: Skull, label: 'Crash Out', text: 'Hit another wall or leave the arena for 5 seconds and you lose a life.' },
        { icon: Trophy, label: 'Last Rider Wins', text: 'Winner gets the round, wins are banked to the Arcade tile.' },
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

  // Reset states when changing features
  useEffect(() => {
    setCopied(false);
    setAnimationKey(prev => prev + 1);
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
              {currentFeature.cards.map((card, idx, arr) => {
                const isLast = idx === arr.length - 1;
                const isOdd = arr.length % 2 === 1;
                return (
                  <div
                    key={card.label}
                    className={cn(
                      "rounded-2xl border border-border/40 bg-card/60 p-3 flex flex-col gap-1.5",
                      isLast && isOdd && "col-span-2"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <card.icon className="w-4 h-4 text-accent flex-shrink-0" />
                      <p className="text-[11px] font-semibold tracking-wide">{card.label}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">{card.text}</p>
                  </div>
                );
              })}
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
  const [speaking, setSpeaking] = useState(1);
  useEffect(() => {
    const interval = setInterval(() => setSpeaking(p => (p + 1) % 4), 1400);
    return () => clearInterval(interval);
  }, []);
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
              "flex items-center gap-3 p-2.5 rounded-xl animate-slide-up transition-all duration-300",
              member.isLeader ? "bg-accent/10 border border-accent/20" : "bg-card/30",
              speaking === i && "ring-1 ring-accent/60 shadow-[0_0_14px_hsl(var(--accent)/0.35)]"
            )}
            style={{ animationDelay: `${300 + i * 80}ms` }}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300",
              member.color,
              speaking === i && "scale-110 shadow-[0_0_12px_3px_rgba(255,255,255,0.45)]"
            )}>
              {member.isLeader ? (
                <Crown className="w-4 h-4 text-white" />
              ) : (
                <span className="text-xs font-semibold text-white">{member.name[0]}</span>
              )}
            </div>
            <span className={cn("text-sm font-medium", member.isLeader && "text-accent")}>
              {member.name}
            </span>
            {speaking === i && (
              <span className="ml-auto flex items-end gap-0.5 h-3.5" aria-label="speaking">
                {[0, 1, 2].map(b => (
                  <span
                    key={b}
                    className="w-0.5 rounded-full bg-accent animate-pulse"
                    style={{ height: `${6 + b * 4}px`, animationDelay: `${b * 120}ms` }}
                  />
                ))}
              </span>
            )}
          </div>

        ))}
      </div>
    </div>
  );
}







// Street network for the maps mockup (viewBox 100 x 125)
const DEMO_ROADS: [number, number][][] = [
  [[8, 122], [24, 96], [38, 70], [33, 40], [28, 8]],
  [[92, 112], [74, 86], [56, 58], [64, 30], [74, 4]],
  [[4, 48], [33, 52], [56, 58], [80, 62], [96, 64]],
  [[24, 96], [50, 90], [74, 86]],
];
// The active route follows real street segments, not a free-hand curve
const DEMO_ROUTE: [number, number][] = [
  [24, 96], [38, 70], [33, 52], [56, 58], [64, 30],
];

function pointsToPath(pts: [number, number][]) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
}

function pointAlong(pts: [number, number][], t: number): [number, number] {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const r = segs[i] === 0 ? 0 : target / segs[i];
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r,
      ];
    }
    target -= segs[i];
  }
  return pts[pts.length - 1];
}

function MapsMockup() {
  const riders = [
    { name: 'You', color: 'bg-orange-500', road: DEMO_ROUTE, speed: 0.055, offset: 0.1 },
    { name: 'Marcus', color: 'bg-blue-500', road: DEMO_ROADS[1], speed: 0.04, offset: 0.45 },
    { name: 'Sarah', color: 'bg-pink-500', road: DEMO_ROADS[2], speed: 0.035, offset: 0.7 },
  ];
  const [speakingIdx, setSpeakingIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [speed, setSpeed] = useState(58);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpeakingIdx((prev) => (prev + 1) % riders.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [riders.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      setSpeed((s) => Math.round(Math.max(34, Math.min(78, s + (Math.random() - 0.45) * 9))));
    }, 250);
    return () => clearInterval(interval);
  }, []);


  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="relative aspect-[4/5] rounded-2xl border border-border/30 bg-[#0d0d10] overflow-hidden animate-scale-in">
        {/* Street network */}
        <svg className="absolute inset-0 w-full h-full opacity-25 text-muted-foreground" viewBox="0 0 100 125" preserveAspectRatio="none">
          {DEMO_ROADS.map((road, i) => (
            <path key={i} d={pointsToPath(road)} stroke="currentColor" strokeWidth={i === 3 ? 1.5 : 2} fill="none" strokeLinejoin="round" />
          ))}
        </svg>

        {/* Route line — follows the streets */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 125" preserveAspectRatio="none">
          <path d={pointsToPath(DEMO_ROUTE)} stroke="hsl(var(--accent))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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

        {/* Convoy member markers — move along the streets, glow when speaking */}
        {riders.map((rider, i) => {
          const t = (rider.offset + tick * rider.speed * 0.06) % 2;
          const prog = t > 1 ? 2 - t : t; // ping-pong along the road
          const [x, y] = pointAlong(rider.road, prog);
          return (
            <div
              key={rider.name}
              className={cn(
                'absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 flex items-center justify-center text-[8px] font-bold text-white transition-all duration-300 ease-linear',
                rider.color,
                speakingIdx === i && 'scale-125 shadow-[0_0_10px_3px_rgba(255,255,255,0.5)]',
              )}
              style={{ top: `${(y / 125) * 100}%`, left: `${x}%` }}
            >
              {rider.name[0]}
            </div>
          );
        })}


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
          <span className="font-mono font-bold text-sm transition-all duration-300">{speed}</span>
          <span className="text-[8px] text-muted-foreground">MPH</span>
        </div>

      </div>

      <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 animate-fade-in delay-300">
        <p className="text-xs text-center text-accent">Glows in their color when a rider talks · camera eyes warn you ahead</p>
      </div>
    </div>
  );
}

function TrackingMockup() {
  const { settings } = useSettings();
  const sLabel = getSpeedLabel(settings.speedUnit);
  const dLabel = getDistanceLabel(settings.distanceUnit);
  const [speed, setSpeed] = useState(62);
  const [distance, setDistance] = useState(4.2);
  const [maxSpeed, setMaxSpeed] = useState(74);
  const [lean, setLean] = useState(18);
  const [maxLean, setMaxLean] = useState(24);
  const [gForce, setGForce] = useState(0.8);
  const [maxG, setMaxG] = useState(1.1);
  const [seconds, setSeconds] = useState(754);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpeed(prev => {
        const next = Math.round(Math.max(38, Math.min(94, prev + (Math.random() - 0.45) * 10)));
        setMaxSpeed(m => Math.max(m, next));
        return next;
      });
      setDistance(prev => prev + 0.03);
      setSeconds(prev => prev + 1);
      setLean(() => {
        const next = Math.round((Math.random() * 2 - 1) * 42);
        setMaxLean(m => Math.max(m, Math.abs(next)));
        return next;
      });
      setGForce(() => {
        const next = Math.round((0.4 + Math.random() * 1.1) * 100) / 100;
        setMaxG(m => Math.max(m, next));
        return next;
      });
    }, 700);
    return () => clearInterval(interval);
  }, []);

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="w-full max-w-xs text-center space-y-6">
      {/* Speed Display */}
      <div className="animate-scale-in">
        <p className="text-[6rem] font-mono font-black leading-none text-accent animate-speed-glow transition-all duration-500">
          {formatSpeed(speed, settings.speedUnit)}
        </p>
        <p className="text-muted-foreground text-sm -mt-2">{sLabel}</p>
      </div>

      {/* Lean & G gauges */}
      <div className="flex justify-center gap-3 animate-slide-up delay-100">
        <div className="bg-card/50 rounded-xl px-4 py-2 border border-border/30">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Lean</p>
          <p className="font-mono text-base font-semibold text-accent transition-all duration-500">
            {Math.abs(lean)}°{lean < 0 ? ' L' : ' R'} <span className="text-[9px] text-muted-foreground">max {maxLean}°</span>
          </p>
          <div className="mt-1 h-1 w-24 rounded-full bg-secondary overflow-hidden relative">
            <div
              className="absolute top-0 h-full w-1.5 rounded-full bg-accent transition-all duration-500"
              style={{ left: `calc(${((lean + 45) / 90) * 100}% - 3px)` }}
            />
          </div>
        </div>
        <div className="bg-card/50 rounded-xl px-4 py-2 border border-border/30">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest">G-Force</p>
          <p className="font-mono text-base font-semibold text-accent transition-all duration-500">
            {gForce.toFixed(2)}G <span className="text-[9px] text-muted-foreground">max {maxG.toFixed(1)}G</span>
          </p>
          <div className="mt-1 h-1 w-24 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${Math.min(100, (gForce / 1.6) * 100)}%` }}
            />
          </div>
        </div>
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
          <p className="font-mono text-lg font-semibold">{mmss}</p>
        </div>
        <div className="bg-card/50 rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground mb-1">Max</p>
          <p className="font-mono text-lg font-semibold">{formatSpeed(maxSpeed, settings.speedUnit)}</p>
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

      <div className="text-center animate-fade-in delay-500 space-y-1">
        <p className="text-xs text-muted-foreground">
          Lost members send location to leader
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          Lives in the map control row — never next to End Ride
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
        <Video className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Receipt, photos, overlay MP4 & 3D flyover per ride</p>
      </div>
    </div>
  );
}


function BlacktopWorldMockup() {
  const landmarks = [
    { label: 'Crew Convoys', top: '18%', left: '12%' },
    { label: 'Crew Leaderboards', top: '12%', right: '8%' },
    { label: 'Join Crew', bottom: '26%', left: '8%' },
    { label: 'Crew QR', bottom: '20%', right: '10%' },
  ];
  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="relative h-64 rounded-2xl overflow-hidden bg-gradient-to-br from-[hsl(220_40%_8%)] via-[hsl(230_50%_12%)] to-black border border-border/30">
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
            <span className="text-[8px] tracking-[0.2em] uppercase text-white/60">crew hub</span>
          </div>
        </div>
        {/* Crew landmarks — beacon dot + label chip, like the real globe */}
        {landmarks.map((lm, i) => (
          <div
            key={lm.label}
            className="absolute flex flex-col items-center gap-1 animate-scale-in"
            style={{ top: lm.top, bottom: lm.bottom, left: lm.left, right: lm.right, animationDelay: `${200 + i * 120}ms` }}
          >
            <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_2px_hsl(var(--accent)/0.6)] animate-pulse" />
            <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-accent/30 text-[8px] font-semibold uppercase tracking-wider text-accent whitespace-nowrap">
              {lm.label}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-center text-muted-foreground">
        Tap a landmark to jump in — long-press the home globe to launch
      </p>
    </div>
  );
}




function DerezMockup() {
  // Progressive trails drawn inside the arena; pink dies at 72% of its path,
  // then the loop resets after a winner flash.
  const LOOP_MS = 7000;
  const [t, setT] = useState(0); // 0..1 through the loop

  useEffect(() => {
    const start = performance.now();
    let raf: number;
    const step = (now: number) => {
      setT(((now - start) % LOOP_MS) / LOOP_MS);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Each dying rider's trail ends exactly on the wall it hits, and its speed
  // equals diesAt so the full trail is drawn before the burst.
  const riders = [
    // orange clips blue's horizontal wall at (70, 60)
    { color: '#f97316', trail: 'M18 25 L45 25 L45 55 L70 55 L70 60', speed: 0.78, diesAt: 0.78, deathPoint: { x: 70, y: 60 }, name: 'Orange' },
    // blue survives — the winner
    { color: '#3b82f6', trail: 'M82 30 L82 60 L55 60 L55 82 L30 82', speed: 0.92, name: 'Blue' },
    // pink steers straight into the orange wall at (45, 38)
    { color: '#ec4899', trail: 'M20 88 L20 55 L20 38 L42 38 L45 38', speed: 0.6, diesAt: 0.6, deathPoint: { x: 45, y: 38 }, name: 'Pink' },
  ];
  const winner = riders[1];

  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="relative aspect-square rounded-2xl border border-border/30 bg-[#0a0a0c] overflow-hidden animate-scale-in">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Arena boundary */}
          <polygon
            points="10,10 90,10 90,90 50,95 10,90"
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth="1"
            strokeDasharray="3 2"
            opacity="0.6"
          />
          {riders.map((r, i) => {
            const died = r.diesAt !== undefined && t >= r.diesAt;
            const pct = died ? 1 : Math.min(1, t / r.speed);
            // dead trails flash off over 0.15 of the loop, then disappear
            const deadT = died ? t - r.diesAt! : 0;
            if (died && deadT > 0.15) return null;
            const flashOn = Math.floor(deadT / 0.025) % 2 === 0;
            return (
              <DerezTrail key={i} d={r.trail} color={r.color} pct={pct} opacity={died ? (flashOn ? 0.85 : 0.1) : 0.9} />
            );
          })}
          {/* Death bursts */}
          {riders.map((r, i) => {
            if (r.diesAt === undefined || t < r.diesAt) return null;
            const burst = Math.min(1, (t - r.diesAt) / 0.08);
            const fade = Math.max(0, 1 - (t - r.diesAt) / 0.18);
            if (fade <= 0) return null;
            const p = r.deathPoint!;
            return (
              <g key={`death-${i}`}>
                <circle cx={p.x} cy={p.y} r={4 + burst * 12} fill="none" stroke={r.color} strokeWidth={2 * fade} opacity={fade} />
                <circle cx={p.x} cy={p.y} r={2.5} fill="#fff" opacity={fade} />
                <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="5.5" fill={r.color} opacity={fade} fontWeight="700">DEREZ!</text>
              </g>
            );
          })}
          {/* Winner celebration */}
          {t > 0.85 && (() => {
            const pct = Math.min(1, t / winner.speed);
            const pt = trailPointAt(winner.trail, pct);
            const pulse = 3 + Math.sin(t * 60) * 1.2;
            return (
              <g>
                <circle cx={pt.x} cy={pt.y} r={pulse + 3} fill="none" stroke={winner.color} strokeWidth="1" opacity="0.7" />
                <text x={pt.x} y={pt.y - 8} textAnchor="middle" fontSize="6" fill={winner.color} fontWeight="800">WINNER!</text>
              </g>
            );
          })()}
        </svg>

        {/* Moving rider dots */}
        {riders.map((r, i) => {
          const died = r.diesAt !== undefined && t >= r.diesAt;
          if (died) return null;
          const pct = Math.min(1, t / r.speed);
          const pt = trailPointAt(r.trail, pct);
          return (
            <div
              key={`dot-${i}`}
              className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80"
              style={{ left: `${pt.x}%`, top: `${pt.y}%`, background: r.color, boxShadow: `0 0 10px ${r.color}` }}
            />
          );
        })}

        {/* Status chip */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-accent/30 text-[10px] font-semibold text-accent">
          {t < 0.6 ? '3 riders live' : t < 0.68 ? 'Pink derezzed!' : t < 0.78 ? '2 riders live' : t < 0.86 ? 'Orange derezzed!' : 'Blue wins!'}
        </div>
      </div>
      <p className="text-[10px] text-center text-muted-foreground">
        Leader draws the arena · riders leave coloured walls · hit a wall and you derez
      </p>
    </div>
  );
}

/** Interpolated point along an SVG path made of straight M/L segments. */
function trailPointAt(d: string, pct: number): { x: number; y: number } {
  const nums = d.replace(/M|L/g, ' ').trim().split(/\s+/).map(Number);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  if (pts.length === 0) return { x: 50, y: 50 };
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(len); total += len;
  }
  let target = total * pct;
  for (let i = 1; i < pts.length; i++) {
    if (target <= segs[i - 1] || i === pts.length - 1) {
      const f = segs[i - 1] === 0 ? 0 : Math.min(1, target / segs[i - 1]);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    }
    target -= segs[i - 1];
  }
  return pts[pts.length - 1];
}

/** A trail rendered with stroke-dash trickery so it draws smoothly behind its rider. */
function DerezTrail({ d, color, pct, faded }: { d: string; color: string; pct: number; faded?: boolean }) {
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(300);
  useEffect(() => {
    if (ref.current) setLen(ref.current.getTotalLength());
  }, [d]);
  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      pathLength={len}
      strokeDasharray={`${len * pct} ${len}`}
      opacity={faded ? 0.35 : 0.9}
      style={{ filter: `drop-shadow(0 0 3px ${color})` }}
    />
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
    { name: 'V4 Ducati', model: 'Ducati Streetfighter V4', km: 12480, active: true },
    { name: 'Track Toy', model: 'Aprilia RS660', km: 3210, active: false },
  ];

  return (
    <div className="w-full max-w-xs space-y-3">
      {/* Mecha-Nick's garage diorama */}
      <div className="relative h-32 rounded-2xl overflow-hidden border border-border/30 animate-slide-up">
        <img src={shopAsset.url} alt="Mecha-Nick's garage" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/25" />
        <img src={demoBikeAsset.url} alt="Red pixel-art bike" className="absolute bottom-1 left-1/2 -translate-x-1/2 h-24 object-contain" />
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm border border-white/10">
          <span className="text-[8px] uppercase tracking-[0.2em] text-white/70">Mecha-Nick's</span>
        </div>
      </div>

      {bikes.map((bike, i) => (
        <div
          key={bike.name}
          className={cn(
            "rounded-2xl border p-4 animate-slide-up",
            bike.active
              ? "bg-accent/10 border-accent/40"
              : "bg-card/50 border-border/30"
          )}
          style={{ animationDelay: `${150 + i * 150}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
              <Bike className="w-6 h-6 text-accent" />
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
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Odometer</span>
              <span className="font-mono font-semibold">
                {formatDistance(bike.km, settings.distanceUnit)} {getDistanceLabel(settings.distanceUnit)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="w-3 h-3 text-muted-foreground" />
              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                <div className={cn("h-full", bike.active ? "bg-destructive" : "bg-accent")} style={{ width: bike.active ? '86%' : '34%' }} />
              </div>
              <span className="text-[9px] text-muted-foreground">Chain</span>
            </div>
          </div>
        </div>
      ))}
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
                  'relative shrink-0 snap-center w-[150px] h-[224px] rounded-xl border-2 overflow-hidden shadow-lg flex flex-col animate-scale-in',
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
                  <div className="flex-1 min-h-0 flex flex-col gap-1.5 blur-[2px] select-none">
                    <div className="relative flex-1 min-h-0 rounded-md bg-black/30 border border-white/10 flex items-center justify-center">
                      {locked ? (
                        <Lock className="w-5 h-5 text-white/60" />
                      ) : (
                        <div className="text-[10px] text-white/50 font-mono">PHOTO</div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1 shrink-0">
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
                  <div className="shrink-0 text-center text-[8px] font-semibold tracking-widest text-white/85 drop-shadow">
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
          { icon: Gauge, label: 'Ride metrics', value: 'Lean · G · Flyover' },
          { icon: AlertTriangle, label: 'Safety', value: 'Alerts · Auto-rescue' },
          { icon: Play, label: 'Demo', value: 'Replay tour' },
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
