import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  CornerUpRight,
  Crown,
  Disc3 as Bike,
  Download,
  Flag,
  Flame,
  FolderOpen,
  Fuel,
  Gamepad2,
  Gauge,
  Ghost,
  Globe2,
  Grid3x3,
  Handshake,
  Heart,
  History,
  IdCard,
  Lock,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Mic,
  MonitorSmartphone,
  Mountain,
  Play,
  QrCode,
  Radio,
  Receipt,
  Repeat,
  Route,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Skull,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Trophy,
  UserRound,
  Users,
  Vibrate,
  Video,
  Wallet,
  Waves,
  X,
  Zap,
  Merge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/PageHeader';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import {
  HazardScene,
  IntroScene,
  LiveDataScene,
  NavigationScene,
  NearbyScene,
  NotificationsScene,
  PillionScene,
  RideTogetherScene,
  SafetyScene,
} from '@/components/demo/scenesRide';
import { AfterRideScene, CardChallengeScene, GarageScene, TrackDayScene, TradingCardsScene } from '@/components/demo/scenesGarage';
import {
  BurnScene,
  DerezScene,
  MakeItYoursScene,
  PayUpScene,
  RadioScene,
  ReadyScene,
  SpeedshopScene,
  WorldScene,
} from '@/components/demo/scenesWorld';

interface FeatureCard {
  icon: React.ElementType;
  label: string;
  text: string;
}

type Tone = 'accent' | 'burn' | 'destructive';

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  tone: Tone;
  scene: ReactNode;
  cards?: FeatureCard[];
}

/**
 * The demo tour: one slide per part of the app, each a short animated scene
 * (the shared scene kit, like the Enterprise packages) with the details under
 * it. Swipe, tap or drag the progress bar, or use the arrow keys.
 */
export default function DemoShowcase() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'forward' | 'back'>('forward');
  const scrollRef = useRef<HTMLDivElement>(null);

  const slides: Slide[] = [
    {
      id: 'intro',
      title: tr("BLACKTOP"),
      subtitle: tr("Ride Logging & Convoy Communication"),
      description: tr("Privacy-first ride companion for motorcycles, cars, bikes and scooters. No sign-up required. Your ride history is stored on your device."),
      icon: Shield,
      tone: 'accent',
      scene: <IntroScene />,
    },
    {
      id: 'ride-together',
      title: tr("Ride Together"),
      subtitle: tr("Convoys, Voice & Solo Runs"),
      description: tr("Create or join a convoy with a simple code, talk hands-free over live voice, or head out solo — every mode shares the same tracking."),
      icon: Users,
      tone: 'accent',
      scene: <RideTogetherScene />,
      cards: [
        { icon: Users, label: tr("Convoy Mode"), text: tr("Every rider synced in real time via a shared code.") },
        { icon: Mic, label: tr("Voice Comms"), text: tr("Hands-free chat with mute, disconnect and Bluetooth intercoms.") },
        { icon: Crown, label: tr("Leadership"), text: tr("Hand over the lead, or auto-promote when the leader drops.") },
        { icon: Users, label: tr("Convoy Status"), text: tr("A strip on the map shows riders, group average speed, group ETA and how many riders have dropped behind.") },
        { icon: Flag, label: tr("Regroup"), text: tr("When riders fall back the leader gets a regroup card: one tap sends it to the whole convoy.") },
      ],
    },
    {
      id: 'nearby-riders',
      title: tr("Nearby Riders"),
      subtitle: tr("Handshake, Pair Up & Merge"),
      description: tr("Opt in and Blacktop finds other riders close by. Both sides accept a handshake to ride together, and convoy leaders can merge their groups and split them again any time."),
      icon: Handshake,
      tone: 'accent',
      scene: <NearbyScene />,
      cards: [
        { icon: Handshake, label: tr("Handshake"), text: tr("One button next to save-location lists riders and convoys nearby, each with Invite, Join or Merge.") },
        { icon: Users, label: tr("Pair Up"), text: tr("Two solo riders who accept become a convoy with voice, mid-ride, without stopping.") },
        { icon: Merge, label: tr("Merge & Unmerge"), text: tr("Leaders merge convoys (up to 8 riders); either leader can unmerge and everyone returns to their own group.") },
      ],
    },
    {
      id: 'pillion',
      title: tr("Pillion Mode"),
      subtitle: tr("For The Passenger"),
      description: tr("Join as Operator or Passenger. Passengers get everything in the lobby, then a ride screen built for the back seat: voice, waves and rescue, with no map or stats."),
      icon: UserRound,
      tone: 'accent',
      scene: <PillionScene />,
      cards: [
        { icon: Heart, label: tr("Wave & React"), text: tr("Waves and reactions the whole convoy sees; \"need a stop\" buzzes the riders.") },
        { icon: AlertTriangle, label: tr("Rescue"), text: tr("Sees every rescue alert and can call one for the bike from their own phone.") },
      ],
    },
    {
      id: 'navigation',
      title: tr("Navigation"),
      subtitle: tr("Turn-By-Turn, Waypoints & Camera Alerts"),
      description: tr("Search a destination, or tap a place on the map, and ride it in-app with turn-by-turn directions from the moment you pick it. Leaders drop multiple stops, everyone sees the same line, and you get warned about cameras ahead."),
      icon: MapIcon,
      tone: 'accent',
      scene: <NavigationScene />,
      cards: [
        { icon: MapIcon, label: tr("Blacktop Maps"), text: tr("Built-in routing with live convoy dots coloured by accent.") },
        { icon: Waves, label: tr("Direct or Twisty"), text: tr("Pick your line before you go — both ETAs shown side by side.") },
        { icon: Repeat, label: tr("Loop Planner"), text: tr("No destination? Generate a twisty round trip back to where you are.") },
        { icon: CloudRain, label: tr("Weather Routing"), text: tr("Warns when heavy rain sits on your route and offers a drier line.") },
        { icon: Radio, label: tr("Cockpit & Rally Voice"), text: tr("Directions as fighter-pilot radio calls, or rally pacenotes that grade every bend ahead from 1 to 6 and name the hairpins. Voice chat and music duck while it talks.") },
      ],
    },
    {
      id: 'hazards',
      title: tr("Hazard Reports"),
      subtitle: tr("Warn The Riders Behind You"),
      description: tr("Spot something on the road? Tap Report, pick a category and the hazard, and every rider heading that way gets a warning. Anonymous, and it clears itself when it's gone."),
      icon: Megaphone,
      tone: 'accent',
      scene: <HazardScene />,
      cards: [
        { icon: Megaphone, label: tr("Two Taps"), text: tr("Road surface, conditions, traffic or other, then the hazard: 17 in all, from potholes and oil to crashes, roadworks, standstills, animals and hi-vis.") },
        { icon: Shield, label: tr("Anonymous"), text: tr("Nobody sees who reported what. Reports are rate-limited and merge when two riders flag the same thing.") },
      ],
    },
    {
      id: 'live-data',
      title: tr("Live Ride Data"),
      subtitle: tr("Speed, Lean & G-Force"),
      description: tr("Big, glove-friendly GPS readouts backed by your phone's gyroscope and accelerometer for real-time lean angle and cornering G."),
      icon: Gauge,
      tone: 'accent',
      scene: <LiveDataScene />,
      cards: [
        { icon: TrendingUp, label: tr("Lean & G-Force"), text: tr("Max lean each way, peak G, and warnings near your threshold.") },
      ],
    },
    {
      id: 'safety',
      title: tr("Safety Net"),
      subtitle: tr("Rescue, Crash Detection & Anti-Theft"),
      description: tr("One button sends your location to your convoy, your crew and your Discord — as a notification on their phones, even with Blacktop closed. If a hard impact is followed by a stop, the app asks if you're okay, and calls for help if you don't answer. Parked up, a pattern lock turns your phone into an alarm."),
      icon: AlertTriangle,
      tone: 'destructive',
      scene: <SafetyScene />,
      cards: [
        { icon: AlertTriangle, label: tr("Rescue"), text: tr("Sends your live position to the whole convoy and your crew, straight to their lock screens.") },
        { icon: UserRound, label: tr("Solo Rescue"), text: tr("Riding alone? The same button alerts your crew, and Discord if you've connected it.") },
        { icon: Shield, label: tr("Auto-Rescue"), text: tr("High-G impact plus a stop triggers a 5-minute check-in. If help goes out, the phone sounds a siren so people nearby notice.") },
        { icon: MessageSquare, label: tr("Discord"), text: tr("Webhook announces convoy starts and broadcasts rescue pings.") },
        { icon: MapPin, label: tr("Rescue Card"), text: tr("Tap the alert to see where they are and route to them on the Blacktop map or Google Maps. Cancel and everyone hears you're OK.") },
        { icon: Users, label: tr("You Choose Who Hears"), text: tr("Settings → Safety: your convoy, your crew, Discord, and riders nearby within 5 to 50 km who've opted in to help.") },
        { icon: Lock, label: tr("Anti-Theft Alarm"), text: tr("Parked up? Tap the red lock on Home, the ride screen or the map. The first tap sets your unlock pattern.") },
        { icon: Vibrate, label: tr("Tilt & Knock Sensing"), text: tr("Lean angle and G-force keep watch while you're away. A nudge chirps a warning; a real move gives you 7 seconds to unlock before the siren.") },
        { icon: Grid3x3, label: tr("Only Your Pattern"), text: tr("Two wrong patterns warn you, the third sets the siren off. Locking pauses your ride, and it stays paused until you press play.") },
      ],
    },
    {
      id: 'notifications',
      title: tr("Notifications"),
      subtitle: tr("Alerts Even When Blacktop Is Closed"),
      description: tr("Turn them on in Settings and pick exactly what reaches your lock screen. Works from the Home Screen app on Android and iPhone."),
      icon: Bell,
      tone: 'accent',
      scene: <NotificationsScene />,
      cards: [
        { icon: AlertTriangle, label: tr("Rescue Calls"), text: tr("A convoy or crew mate needs help, with where they are.") },
        { icon: Handshake, label: tr("Riders Near Me"), text: tr("Opt in to hear when a rider close by calls for rescue, so help can come from whoever's nearest.") },
        { icon: Fuel, label: tr("Blacktank"), text: tr("Requests to vote on, approvals, chip-ins and payouts.") },
        { icon: Timer, label: tr("Cards"), text: tr("Someone picks up your card, or beats or loses to your time attack.") },
        { icon: Trophy, label: tr("Crew"), text: tr("A mate passes you on the board, opens a crew convoy, or a challenge is won, lost or 5 days from closing.") },
      ],
    },
    {
      id: 'after-ride',
      title: tr("After The Ride"),
      subtitle: tr("History, Receipts, Badges & Overlays"),
      description: tr("Every ride is saved locally with photos, a shareable receipt, earned badges, and an MP4 stats overlay for your action-cam footage."),
      icon: History,
      tone: 'accent',
      scene: <AfterRideScene />,
      cards: [
        { icon: Receipt, label: tr("Ride Receipts"), text: tr("A printable stat slip with vehicle and badges, saved as an image.") },
        { icon: Video, label: tr("Overlay Download"), text: tr("MP4 with live speed, lean, distance and a mini-map for editing in.") },
        { icon: Mic, label: tr("Voice Recording"), text: tr("Optionally mix convoy voice chat into the overlay MP4.") },
        { icon: Mountain, label: tr("3D Flyover"), text: tr("A cinematic 3D pass over your route with stats, ready to save.") },
        { icon: CornerUpRight, label: tr("Corner Report"), text: tr("Every corner detected and scored 0-100 on line, lean and pace, with a ride grade.") },
        { icon: Trophy, label: tr("Badges & Stats"), text: tr("Speed Demon, Journeyman, Lean Fiend, G-Lock, Corner Carver, Night Owl, Hard Ass and Always Out bank points in a 3×3 grid — Kickback joins them when riders collect your drops, while Fallback docks a point from a full-width row below.") },
        { icon: Timer, label: tr("Time-Attack Receipts"), text: tr("Card challenge rides print on pink stock — your time, the target, the delta, the card you raced and whether you unlocked its Spectre.") },
        { icon: Star, label: tr("Burn Trips"), text: tr("Star the rides you love; pick weekly or monthly and everything unstarred is wiped to save space. Your totals never change.") },
        { icon: Sparkles, label: tr("Badge Trades"), text: tr("Badges are currency: spend 10 banked badge points for a spare trading-card copy to drop on the map. Kickbacks from collected drops feed the same wallet.") },
      ],
    },
    {
      id: 'garage',
      title: tr("Mecha-Nick's Garage"),
      subtitle: tr("Vehicles, Maintenance & Cards"),
      description: tr("Every vehicle in your stable gets its own photo, odometer, service intervals and a trading card that levels up as you ride it."),
      icon: Bike,
      tone: 'accent',
      scene: <GarageScene />,
      cards: [
        { icon: Receipt, label: tr("Logbook"), text: tr("A leather logbook per vehicle: keepers, lifetime stats, service record, highlights and every ride, page by page.") },
        { icon: QrCode, label: tr("Change Of Keeper"), text: tr("Selling up? Show the hand-over code for 10 seconds; the new keeper scans it and the logbook, card and stats go with the vehicle.") },
      ],
    },
    {
      id: 'trading-cards',
      title: tr("Trading Cards"),
      subtitle: tr("Bronze To Orion"),
      description: tr("Every vehicle earns a collectable card that levels up with your ride count — ten tiers, each with its own finish."),
      icon: Sparkles,
      tone: 'accent',
      scene: <TradingCardsScene />,
      cards: [
        { icon: Sparkles, label: tr("Tier Ladder"), text: tr("Locked, Bronze, Silver, Gold, Platinum, Diamond, Ruby, Obsidian, Polyatomic, Orion.") },
        { icon: QrCode, label: tr("Share & Scan"), text: tr("Show your card QR — mates scan it straight into their vault.") },
        { icon: Ghost, label: tr("Spectre Cards"), text: tr("Ghost versions of a rider's card, earned only by beating their time attack. Flip for your time, theirs and the margin. Never scanned or traded.") },
        { icon: MapIcon, label: tr("Card Drops"), text: tr("Spare copies — earned from tier milestones, crew challenges and 10-badge trades — can be planted on the Blacktop map, exactly where you're standing. Confirm with Yes / No, no map-pin fiddling.") },
        { icon: MapPin, label: tr("Go Collect"), text: tr("Drops show on the map like hazard reports once you zoom in. Pull up beside one to scan it; collected cards get a green tick.") },
        { icon: IdCard, label: tr("Hot-Spots"), text: tr("Cards stacked at one spot merge into a heat-coloured hot-spot with a count badge — tap it for a two-column list and collect them all at once.") },
      ],
    },
    {
      id: 'card-challenges',
      title: tr("Card Challenges"),
      subtitle: tr("Time Attack On A Dropped Card"),
      description: tr("Drop a card with a challenge attached: a five-second countdown, then you ride your route and hit Finish. Anyone who pulls up to that card can ready up and race your line against your time."),
      icon: Timer,
      tone: 'accent',
      scene: <CardChallengeScene />,
      cards: [
        { icon: Timer, label: tr("Set The Line"), text: tr("Choose Yes + Challenge when you drop. Your spot is the start line, five seconds later the clock runs, and Finish challenge sets the finish where you stop.") },
        { icon: Flag, label: tr("Take It On"), text: tr("Pull up within pick-up range of the card, ready up, and race the stored route with a live delta against the time to beat.") },
        { icon: Trophy, label: tr("Beat It, Bank It"), text: tr("Beat the setter for 3x Speed Demon and their Spectre card. Lose and it is 1x Fallback. The normal card is still collected by scanning it.") },
        { icon: Ghost, label: tr("Race Yourself"), text: tr("Take on your own time attack to earn your own vehicle's Spectre card. No badges either way, so nobody can farm them.") },
        { icon: AlertTriangle, label: tr("Stay On Route"), text: tr("Stray more than 120m off the line for 15 seconds and the run is voided — Fallback earned, no time recorded.") },
      ],
    },
    {
      id: 'track-day',
      title: tr("Track Day"),
      subtitle: tr("Lap Timing With Your Pit Crew"),
      description: tr("Pick a circuit from the library, build your own from the map or with a GPS lap, place the start/finish and sectors with a chase cam, then ready up: the timer starts itself at launch. Your pit crew scans your QR for live timing and a pit board."),
      icon: Zap,
      tone: 'accent',
      scene: <TrackDayScene />,
      cards: [
        { icon: Search, label: tr("Circuit Library"), text: tr("175 circuit layouts from around the world, from Brands Hatch Indy to Suzuka, searchable offline, nearest first.") },
        { icon: MapIcon, label: tr("Build From The Map"), text: tr("Box the circuit and Blacktop finds its roads and every lap they make (GP or Indy?). Tap to drop the ones you don't race.") },
        { icon: Route, label: tr("Or Ride A Lap"), text: tr("GPS follows you and closes the lap itself when you're back on your line.") },
        { icon: Play, label: tr("Chase Cam"), text: tr("Play, pause, rewind, speed up and reverse a camera round the lap to place the start/finish and sector markers. Sectors fill themselves in.") },
        { icon: Timer, label: tr("Ready Up"), text: tr("Pick a track and ready up: timing begins the moment you launch. Live delta, coloured sectors, theoretical best.") },
        { icon: QrCode, label: tr("Pit Crew"), text: tr("They get the track the moment you pick it. Pit board calls are spoken in your helmet (\"Box, box\"), and your calls are spoken to them. Voice too.") },
        { icon: Receipt, label: tr("Track Day Receipts"), text: tr("Sessions print on blue stock in History, with lap traces, racing lines, corner scores and CSV/GPX export.") },
      ],
    },
    {
      id: 'blacktop-world',
      title: tr("Blacktop World"),
      subtitle: tr("Your Crew Hub On A Globe"),
      description: tr("Opt-in. Spin the globe and tap landmarks for crew convoys, leaderboards, the weekly crew challenge, crew QR joining, your card collection, the arcade, the Speedshop and, down on the South Pole, the Blacktank — with an anonymous glow showing where riders are active."),
      icon: Globe2,
      tone: 'accent',
      scene: <WorldScene />,
      cards: [
        { icon: Users, label: tr("Crew Convoys"), text: tr("A live list of your crew's open rides — tap for leader and riders.") },
        { icon: Trophy, label: tr("Crew Leaderboards"), text: tr("Named rankings for distance, top speed, lean, rides and arcade, updated after every ride. Get a heads-up when a mate passes you.") },
        { icon: Flag, label: tr("Challenges"), text: tr("Two rotating crew challenges every week — miles, corners, lean, ride count, top speed, night rides and longest ride — plus a monthly Forzathon-style crew goal you chase together, with special event weeks through the year. Notifications for targets hit, results and a 5-days-left nudge.") },
        { icon: Gamepad2, label: tr("Arcade"), text: tr("Hit Heavy with Classic, Flurry and Precision modes, Petrol Head with fuel, near misses and shields, and Derez Legacy. Your bests go on the crew board.") },
        { icon: Fuel, label: tr("Blacktank"), text: tr("On the South Pole: your crew's shared fuel pot. Chip in, request a top-up and vote, with notifications at every step.") },
      ],
    },
    {
      id: 'speedshop',
      title: tr("Speedshop"),
      subtitle: tr("Help Stock The Shelves"),
      description: tr("A landmark on the Blacktop World globe. Step into the garage and flick through what's coming, each piece shown with your own card, ride and logbook. Nothing's for sale yet: tell us what you'd buy and what you'd pay."),
      icon: ShoppingBag,
      tone: 'accent',
      scene: <SpeedshopScene />,
      cards: [
        { icon: IdCard, label: tr("Your Stuff"), text: tr("Printed vehicle card, ride receipt, crew hoodie, card keychain and a bound logbook, previewed with your own data.") },
        { icon: Check, label: tr("Vote"), text: tr("I'd buy it, Maybe or Not for me, then what you'd pay. See how other riders voted.") },
      ],
    },
    {
      id: 'legacy-derez',
      title: tr("Derez Legacy"),
      subtitle: tr("Tron-Style Light-Bike Arena"),
      description: tr("Two or more riders draw a live arena on the map, ready up, then ride inside it. Your GPS trail becomes a glowing wall in your accent colour — crash into someone else's line and you're out."),
      icon: Gamepad2,
      tone: 'accent',
      scene: <DerezScene />,
      cards: [
        { icon: MapIcon, label: tr("Draw The Grid"), text: tr("The lobby leader freehands the game space on a map — a car park, a lot, any closed loop.") },
        { icon: Zap, label: tr("Live Trails"), text: tr("High-frequency GPS paints a wall behind every rider in their own colour.") },
        { icon: Skull, label: tr("Crash Out"), text: tr("Hit another wall or leave the arena for 5 seconds and you lose a life.") },
      ],
    },
    {
      id: 'radio',
      title: tr("Blacktop Radio"),
      subtitle: tr("Your Music, GTA-Style Dial"),
      description: tr("Build stations from the audio files already on your device, then spin a radio dial mid-ride without ever leaving the screen. Nothing is uploaded and no streaming account is needed."),
      icon: Radio,
      tone: 'accent',
      scene: <RadioScene />,
      cards: [
        { icon: FolderOpen, label: tr("Your Files"), text: tr("Pick tracks or a whole folder from your phone — they never leave it.") },
        { icon: Radio, label: tr("Spin The Dial"), text: tr("Hold the radio button on a ride or the map to open the wheel and switch instantly.") },
      ],
    },
    {
      id: 'pay-up',
      title: tr("Pay Up"),
      subtitle: tr("Support The Developer Or Send Fuel Money"),
      description: tr("No ads, no subscription. Chip into Blacktank, your crew’s shared fuel pot, or flip between Receive to show your own wallet QR and Send to scan someone else’s, then hand off to Nimiq Pay. Everything stays local — no backend wallet or accounts."),
      icon: Heart,
      tone: 'accent',
      scene: <PayUpScene />,
      cards: [
        { icon: Fuel, label: tr("Blacktank"), text: tr("Your crew’s shared fuel pot — chip in NIM or USDT, and every withdrawal needs a unanimous crew vote.") },
        { icon: Wallet, label: tr("NIM Or USDT"), text: tr("Pay with Nimiq or Polygon USDT — Nimiq Pay handles the transaction.") },
        { icon: Heart, label: tr("No Fees To Us"), text: tr("100% of the tip goes to the payee. Blacktop never takes a cut.") },
      ],
    },
    {
      id: 'make-it-yours',
      title: tr("Make It Yours"),
      subtitle: tr("Settings, Display & Support"),
      description: tr("Eight accent colours, your units, your speed alert thresholds — plus a car-display layout for wired mirroring and an install-to-home-screen build."),
      icon: Settings,
      tone: 'accent',
      scene: <MakeItYoursScene />,
      cards: [
        { icon: MonitorSmartphone, label: tr("Car Display"), text: tr("Oversized landscape layout for wired Android head-unit mirroring.") },
        { icon: Sparkles, label: tr("Living Backdrop"), text: tr("The BLACKTOP wordmark drifts behind every screen, surges when you tap, follows your scrolling and speeds up with you on the ride. Pull down from the top to refresh.") },
      ],
    },
    {
      id: 'privacy',
      title: tr("Burn Button"),
      subtitle: tr("Your Data, Your Control"),
      description: tr("Everything lives on your device by default. Burn permanently deletes all of it, on your phone and on our servers: rides, tracks, cards, saved places, reports, photos, settings, all of it. Burning the demo account just takes you back to yours."),
      icon: Flame,
      tone: 'burn',
      scene: <BurnScene />,
    },
    {
      id: 'complete',
      title: tr("Ready to Ride?"),
      subtitle: tr("Start Your First Convoy"),
      description: tr("Everything you need for group rides. No signup, no tracking, no ads. Just you and the road."),
      icon: Play,
      tone: 'accent',
      scene: <ReadyScene />,
    },
  ];

  const count = slides.length;
  const slide = slides[index];
  const isFirst = index === 0;
  const isLast = index === count - 1;

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      setIndex((cur) => {
        if (clamped === cur) return cur;
        setDir(clamped > cur ? 'forward' : 'back');
        return clamped;
      });
    },
    [count],
  );
  const goNext = useCallback(() => {
    if (index >= count - 1) return;
    haptics.medium();
    goTo(index + 1);
  }, [index, count, goTo]);
  const goPrev = useCallback(() => {
    if (index <= 0) return;
    haptics.light();
    goTo(index - 1);
  }, [index, goTo]);

  // Each slide starts at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [index]);

  // Arrow keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  // Swipe sideways between slides (vertical drags still scroll).
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  // The progress bar doubles as a scrubber: tap or drag along it.
  const barRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  /** Where the finger is along the bar (px), while dragging. */
  const [scrubX, setScrubX] = useState<number | null>(null);
  const scrubTo = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0, Math.min(r.width, clientX - r.left));
    setScrubX(x);
    const next = Math.max(0, Math.min(count - 1, Math.floor((x / r.width) * count)));
    if (next !== index) {
      haptics.tick();
      goTo(next);
    }
  };
  const endScrub = () => {
    scrubbing.current = false;
    setScrubX(null);
  };

  const toneText = slide.tone === 'burn' ? 'text-[hsl(var(--burn))]' : slide.tone === 'destructive' ? 'text-destructive' : 'text-accent';
  const toneBg = slide.tone === 'burn' ? 'bg-[hsl(var(--burn))]/15' : slide.tone === 'destructive' ? 'bg-destructive/15' : 'bg-accent/15';

  return (
    <div className="relative isolate h-dvh flex flex-col overflow-hidden">
      <header className="relative z-10 shrink-0 px-4 pt-3 safe-top">
        <div className="flex items-center gap-3">
          <HeaderButton onClick={goPrev} aria-label={tr("Back")} className={cn(isFirst && 'opacity-0 pointer-events-none')}>
            <ChevronLeft className="w-5 h-5 -ml-0.5" strokeWidth={2.25} />
          </HeaderButton>
          <div
            ref={barRef}
            role="slider"
            aria-label={tr("Jump to slide")}
            aria-valuemin={1}
            aria-valuemax={count}
            aria-valuenow={index + 1}
            tabIndex={0}
            className="relative flex-1 flex items-center gap-[3px] py-3 cursor-pointer touch-none"
            onPointerDown={(e) => {
              scrubbing.current = true;
              scrubTo(e.clientX);
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* keep scrubbing without capture */
              }
            }}
            onPointerMove={(e) => scrubbing.current && scrubTo(e.clientX)}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') goNext();
              else if (e.key === 'ArrowLeft') goPrev();
            }}
          >
            {slides.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  'flex-1 rounded-full transition-all duration-200',
                  scrubX != null ? 'h-1.5' : 'h-1',
                  i === index ? 'bg-accent' : i < index ? 'bg-accent/45' : 'bg-white/15',
                )}
              />
            ))}
            {/* While dragging: which slide is under the finger */}
            {scrubX != null && (
              <span
                className="absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full frost-accent px-3 py-1 text-[11px] font-semibold text-foreground pointer-events-none animate-scale-in"
                style={{ left: Math.max(60, Math.min((barRef.current?.clientWidth ?? 0) - 60, scrubX)) }}
              >
                <span className="text-accent tabular-nums mr-1.5">{index + 1}</span>
                {slide.title}
              </span>
            )}
          </div>
          <HeaderButton onClick={() => { haptics.light(); navigate('/settings'); }} aria-label={tr("Skip")}>
            <X className="w-4 h-4" />
          </HeaderButton>
        </div>
      </header>

      <main
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
        data-no-pull
      >
        <div
          key={slide.id}
          className={cn(
            'pt-3 pb-6 min-h-full flex flex-col',
            // Slides without detail cards sit in the middle of the screen.
            !slide.cards && 'justify-center',
            dir === 'forward' ? 'page-in-forward' : 'page-in-back',
          )}
        >
          <div className="flex items-center gap-2">
            <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', toneBg)}>
              <slide.icon className={cn('w-4 h-4', toneText)} />
            </span>
            <p className={cn('text-[11px] font-semibold uppercase tracking-[0.14em] truncate', toneText)}>{slide.subtitle}</p>
          </div>
          <h1 className="mt-3 text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] text-foreground">{slide.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{slide.description}</p>

          <div className="mt-5">{slide.scene}</div>

          {slide.cards && (
            <div className="mt-5 grid grid-cols-2 gap-2.5 stagger-in">
              {slide.cards.map((card, i, arr) => (
                <div
                  key={card.label + i}
                  style={{ ['--i' as string]: Math.min(i, 8) }}
                  className={cn('rounded-2xl bg-card/50 border border-white/[0.06] p-3 flex flex-col gap-1.5', i === arr.length - 1 && arr.length % 2 === 1 && 'col-span-2')}
                >
                  <div className="flex items-center gap-2">
                    <card.icon className="w-4 h-4 text-accent shrink-0" />
                    <p className="text-[12px] font-semibold text-foreground leading-tight">{card.label}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{card.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 px-5 pt-3 pb-4 safe-bottom">
        <Button
          variant="accent"
          size="xl"
          className="w-full group relative"
          onClick={() => {
            if (isLast) {
              haptics.success();
              navigate('/settings');
            } else goNext();
          }}
        >
          {isLast ? tr("Get Started") : tr("Continue")}
          {!isLast && <ChevronRight className="!size-5 transition-transform group-hover:translate-x-0.5" />}
          <span className="absolute right-5 text-xs font-medium opacity-70 tabular-nums">{index + 1} / {count}</span>
        </Button>
      </footer>
    </div>
  );
}
