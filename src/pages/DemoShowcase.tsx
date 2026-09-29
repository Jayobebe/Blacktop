import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  Bell,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudLightning,
  CloudRain,
  CornerUpRight,
  Crown,
  Disc3 as Bike,
  Download,
  Eye,
  Flag,
  Flame,
  Folder,
  FolderOpen,
  Fuel,
  Gamepad2,
  Gauge,
  Ghost,
  Globe2,
  Handshake,
  Heart,
  History,
  IdCard,
  ListMusic,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Mic,
  MonitorSmartphone,
  Mountain,
  Palette,
  Play,
  QrCode,
  Radio,
  Receipt,
  Repeat,
  Route,
  Ruler,
  Search,
  Settings,
  Share2,
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
  Video,
  Wallet,
  Waves,
  Wrench,
  X,
  Zap,
  CalendarClock,
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
        { icon: Gauge, label: tr("Solo Ride"), text: tr("Same tracking, no group needed — with Discord rescue on tap.") },
        { icon: QrCode, label: tr("QR Join"), text: tr("Scan the lobby QR to jump straight into a convoy.") },
        { icon: MessageSquare, label: tr("Lobby Chat"), text: tr("Sort the plan before you set off, live in the lobby.") },
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
        { icon: Shield, label: tr("Opt-In"), text: tr("Off by default. Only shared with other opted-in riders within a few km, and only while you ride.") },
        { icon: Handshake, label: tr("Handshake"), text: tr("One button next to save-location lists riders and convoys nearby, each with Invite, Join or Merge.") },
        { icon: Timer, label: tr("Request Timer"), text: tr("A sent request counts down on the button; the receiver's button pulses with the same timer until they accept or decline.") },
        { icon: Users, label: tr("Pair Up"), text: tr("Two solo riders who accept become a convoy with voice, mid-ride, without stopping.") },
        { icon: Merge, label: tr("Merge & Unmerge"), text: tr("Leaders merge convoys (up to 8 riders); either leader can unmerge and everyone returns to their own group.") },
        { icon: Ban, label: tr("Snooze & Block"), text: tr("Not now quietens a rider for 30 minutes; Block hides them for good.") },
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
        { icon: QrCode, label: tr("Operator Or Passenger"), text: tr("Pick on Join Convoy before entering the code or scanning the QR.") },
        { icon: Mic, label: tr("Voice"), text: tr("Join, mute and unmute, and pick the audio device.") },
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
        { icon: Route, label: tr("Multi-Stop Routes"), text: tr("Add, reorder and skip waypoints mid-ride, up to five at a time.") },
        { icon: CornerUpRight, label: tr("Turn-By-Turn"), text: tr("Starts as soon as you pick a destination, in the search bar's place. Spoken directions lower the radio and crew voice while they talk; switch the voice off and the banner stays.") },
        { icon: Route, label: tr("Route Preferences"), text: tr("Avoid motorways, tolls, ferries or unpaved roads, like Waze. Twisty routes and loops keep to them too.") },
        { icon: Eye, label: tr("Camera Alerts"), text: tr("Speed and ANPR cameras on your route, flagged as you approach.") },
        { icon: Waves, label: tr("Direct or Twisty"), text: tr("Pick your line before you go — both ETAs shown side by side.") },
        { icon: Repeat, label: tr("Loop Planner"), text: tr("No destination? Generate a twisty round trip back to where you are.") },
        { icon: CloudRain, label: tr("Weather Radar"), text: tr("Optional live rain overlay so you can dodge the downpour.") },
        { icon: CloudRain, label: tr("Weather Routing"), text: tr("Warns when heavy rain sits on your route and offers a drier line.") },
        { icon: Mountain, label: tr("Satellite & 3D"), text: tr("Toggle satellite imagery or a 3D terrain and building view.") },
        { icon: Download, label: tr("Offline Maps"), text: tr("Save map areas to your phone for rides with no signal.") },
        { icon: MapPin, label: tr("Places On The Map"), text: tr("Cafés, fuel, food, sights and more appear as you zoom in, each with its own icon, plus your saved places and recent destinations. They step aside while you ride.") },
        { icon: MapPin, label: tr("Orbit A Place"), text: tr("Tap a pin and the camera swings round it in 3D. Back returns you to where you were; Navigate takes you straight into directions.") },
        { icon: Search, label: tr("Instant Search"), text: tr("Places on the map show up as you type, even offline and however you spell them (\"mcdonalds\" finds McDonald's). Tap the clock on a recent to remove it.") },
        { icon: MapIcon, label: tr("Clearer Map"), text: tr("A higher-contrast dark map, opens where you last were, and a trimmed landscape layout for bar mounts.") },
        { icon: Route, label: tr("Smart Rerouting"), text: tr("Miss a turn and Blacktop finds a new way from where you are. Stops you pass come off the route by themselves.") },
        { icon: Clock, label: tr("Stays Where You Pan"), text: tr("With no route set, pan the map and it stays put; tap locate to follow yourself again. Closing the map ends its route.") },
        { icon: Search, label: tr("Heads-Up Map"), text: tr("The search bar steps aside while you ride and comes back when you slow down; while navigating the turn banner takes its place.") },
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
        { icon: Bell, label: tr("Warned Ahead"), text: tr("A banner (and, if you like, a spoken warning) about 20 seconds before you reach one, on the map or the ride screen.") },
        { icon: Check, label: tr("Still There?"), text: tr("Ride past and Blacktop asks. Yes keeps it up for others; two Gone votes clear it.") },
        { icon: Timer, label: tr("Clears Itself"), text: tr("Each type has its own life: a standstill 20 minutes, an animal 30, a pothole a month, unless riders confirm it.") },
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
        { icon: Gauge, label: tr("Speed & Distance"), text: tr("Real-time GPS speed, distance and duration at a glance.") },
        { icon: TrendingUp, label: tr("Lean & G-Force"), text: tr("Max lean each way, peak G, and warnings near your threshold.") },
        { icon: Clock, label: tr("Smart Timer"), text: tr("Idle rides auto-stop, so a forgotten session never logs 70 hours.") },
      ],
    },
    {
      id: 'safety',
      title: tr("Safety Net"),
      subtitle: tr("Rescue, Crash Detection & Alerts"),
      description: tr("One button sends your location to your convoy, your crew and your Discord — as a notification on their phones, even with Blacktop closed. If a hard impact is followed by a stop, the app asks if you're okay, and calls for help if you don't answer."),
      icon: AlertTriangle,
      tone: 'destructive',
      scene: <SafetyScene />,
      cards: [
        { icon: AlertTriangle, label: tr("Rescue"), text: tr("Sends your live position to the whole convoy and your crew, straight to their lock screens.") },
        { icon: UserRound, label: tr("Solo Rescue"), text: tr("Riding alone? The same button alerts your crew, and Discord if you've connected it.") },
        { icon: Shield, label: tr("Auto-Rescue"), text: tr("High-G impact plus a stop triggers a 5-minute check-in.") },
        { icon: MessageSquare, label: tr("Discord"), text: tr("Webhook announces convoy starts and broadcasts rescue pings.") },
        { icon: MapPin, label: tr("Rescue Card"), text: tr("Tap the alert to see where they are and route to them on the Blacktop map or Google Maps. Cancel and everyone hears you're OK.") },
        { icon: Users, label: tr("You Choose Who Hears"), text: tr("Settings → Safety: your convoy, your crew, Discord, and riders nearby within 5 to 50 km who've opted in to help.") },
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
        { icon: CloudLightning, label: tr("Heavy Weather"), text: tr("Storms, heavy rain, snow or strong winds heading to your area in the next few hours.") },
        { icon: Fuel, label: tr("Blacktank"), text: tr("Requests to vote on, approvals, chip-ins and payouts.") },
        { icon: Timer, label: tr("Cards"), text: tr("Someone picks up your card, or beats or loses to your time attack.") },
        { icon: Trophy, label: tr("Crew"), text: tr("A mate passes you on the board, opens a crew convoy, or a challenge is won, lost or 5 days from closing.") },
        { icon: Wrench, label: tr("Maintenance"), text: tr("Service items coming due or overdue, by miles or by months.") },
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
        { icon: Camera, label: tr("History & Photos"), text: tr("Full stats per ride, plus up to 9 photos, stored on device.") },
        { icon: Receipt, label: tr("Ride Receipts"), text: tr("A printable stat slip with vehicle and badges, saved as an image.") },
        { icon: Video, label: tr("Overlay Download"), text: tr("MP4 with live speed, lean, distance and a mini-map for editing in.") },
        { icon: Mic, label: tr("Voice Recording"), text: tr("Optionally mix convoy voice chat into the overlay MP4.") },
        { icon: Mountain, label: tr("3D Flyover"), text: tr("A cinematic 3D pass over your route with stats, ready to save.") },
        { icon: CornerUpRight, label: tr("Corner Report"), text: tr("Every corner detected and scored 0-100 on line, lean and pace, with a ride grade.") },
        { icon: Share2, label: tr("Recap Card"), text: tr("One tap renders a shareable image of your route, stats and corner grade.") },
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
        { icon: Bike, label: tr("Your Vehicles"), text: tr("Photo, odometer and lifetime stats per machine.") },
        { icon: Wrench, label: tr("Maintenance"), text: tr("Chain, oil, brakes and tyres with bars that reset when serviced.") },
        { icon: CalendarClock, label: tr("Time Reminders"), text: tr("Set \"every N months\" alongside mileage — whichever comes first nags you.") },
        { icon: Bell, label: tr("Service Alerts"), text: tr("A notification when something's due soon or overdue: after the ride that takes it there, or on the day for time-based items.") },
        { icon: History, label: tr("Ride Assignment"), text: tr("Tag any ride to a vehicle and its stats roll up automatically.") },
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
        { icon: Camera, label: tr("Garage Shot"), text: tr("The card uses your garage placement and zoom, so it looks how you set it.") },
        { icon: QrCode, label: tr("Share & Scan"), text: tr("Show your card QR — mates scan it straight into their vault.") },
        { icon: Folder, label: tr("Card Vault"), text: tr("Two sideways rows: Spectre cards, then your own card followed by everything you've scanned. Tap any card to flip it: collected cards show their QR to pass on.") },
        { icon: Ghost, label: tr("Spectre Cards"), text: tr("Ghost versions of a rider's card, earned only by beating their time attack. Flip for your time, theirs and the margin. Never scanned or traded.") },
        { icon: MapIcon, label: tr("Card Drops"), text: tr("Spare copies — earned from tier milestones, crew challenges and 10-badge trades — can be planted on the Blacktop map, exactly where you're standing. Confirm with Yes / No, no map-pin fiddling.") },
        { icon: MapPin, label: tr("Go Collect"), text: tr("Drops show on the map like hazard reports once you zoom in. Pull up beside one to scan it; collected cards get a green tick.") },
        { icon: Bell, label: tr("Pickup Alerts"), text: tr("Get a notification the moment someone picks up a card you dropped.") },
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
        { icon: Receipt, label: tr("Pink Receipt"), text: tr("Every time-attack ride lands in history with a pink receipt: your time, the target, the delta and the card you raced.") },
        { icon: Bell, label: tr("Result Alerts"), text: tr("Set a time attack and you're notified whenever someone beats it, or races it and loses.") },
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
        { icon: Star, label: tr("Your Tracks"), text: tr("Previous, custom and favourite tracks in rows you swipe, each with a mini map, length and best lap.") },
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
        { icon: Folder, label: tr("Crew QR & Cards"), text: tr("Scan a mate's QR to join their crew, or their card to collect it.") },
        { icon: Flag, label: tr("Challenges"), text: tr("Two rotating crew challenges every week — miles, corners, lean, ride count, top speed, night rides and longest ride — plus a monthly Forzathon-style crew goal you chase together, with special event weeks through the year. Notifications for targets hit, results and a 5-days-left nudge.") },
        { icon: Gamepad2, label: tr("Arcade"), text: tr("Hit Heavy with Classic, Flurry and Precision modes, Petrol Head with fuel, near misses and shields, and Derez Legacy. Your bests go on the crew board.") },
        { icon: Fuel, label: tr("Blacktank"), text: tr("On the South Pole: your crew's shared fuel pot. Chip in, request a top-up and vote, with notifications at every step.") },
        { icon: ShoppingBag, label: tr("Speedshop"), text: tr("Printed cards, receipts, hoodies, keychains and logbooks, previewed with your own stuff. Opening soon, so vote on what it should stock.") },
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
        { icon: ChevronRight, label: tr("Flick Through"), text: tr("Arrows under the garage floor, or swipe, to move between items.") },
        { icon: Check, label: tr("Vote"), text: tr("I'd buy it, Maybe or Not for me, then what you'd pay. See how other riders voted.") },
        { icon: MessageSquare, label: tr("Suggest"), text: tr("Something missing? The last slot takes your ideas.") },
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
        { icon: Users, label: tr("Ready Up"), text: tr("Everyone joins by code or QR, picks an accent colour, then taps Ready.") },
        { icon: Zap, label: tr("Live Trails"), text: tr("High-frequency GPS paints a wall behind every rider in their own colour.") },
        { icon: Skull, label: tr("Crash Out"), text: tr("Hit another wall or leave the arena for 5 seconds and you lose a life.") },
        { icon: Trophy, label: tr("Last Rider Wins"), text: tr("Winner gets the round, wins are banked to the Arcade tile.") },
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
        { icon: Palette, label: tr("Name & Colour"), text: tr("Each station gets a name, an icon and one of the eight accent colours.") },
        { icon: Radio, label: tr("Spin The Dial"), text: tr("Hold the radio button on a ride or the map to open the wheel and switch instantly.") },
        { icon: ListMusic, label: tr("Lock Screen"), text: tr("Shuffled playback with play, skip and track name on your lock screen.") },
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
        { icon: QrCode, label: tr("Your Own QR"), text: tr("Save your wallet once and show your code with the address underneath.") },
        { icon: Users, label: tr("Send Or Receive"), text: tr("One toggle swaps between your code and the scanner for theirs.") },
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
        { icon: Palette, label: tr("Accent Colours"), text: tr("Eight themes that recolour speed, dots and gauges app-wide.") },
        { icon: Ruler, label: tr("Units & Alerts"), text: tr("MPH or KPH, miles or km, plus amber and red speed thresholds.") },
        { icon: MonitorSmartphone, label: tr("Car Display"), text: tr("Oversized landscape layout for wired Android head-unit mirroring.") },
        { icon: Download, label: tr("Install App"), text: tr("Add Blacktop to your home screen for a full-screen, offline-ready ride.") },
        { icon: Bell, label: tr("Notifications"), text: tr("One switch per alert type, plus a test you can send with the app closed.") },
        { icon: Globe2, label: tr("Your Language"), text: tr("Tap the BT logo in Settings to switch the whole app to your language.") },
        { icon: Play, label: tr("Demo Data"), text: tr("Hold the logo in settings to preview the app with sample stats.") },
        { icon: Sparkles, label: tr("Living Backdrop"), text: tr("The BLACKTOP wordmark drifts behind every screen, surges when you tap, follows your scrolling and speeds up with you on the ride. Pull down from the top to refresh.") },
        { icon: Heart, label: tr("Tip Jar"), text: tr("No ads, no subscription — support the app only if you want to.") },
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
