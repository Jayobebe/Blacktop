import { useState, useEffect, useCallback, useRef } from 'react';
import { GForceCircle } from '@/components/GForceCircle';
import { emptyGVector, envelopeBin } from '@/lib/gForceVector';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { haptics } from '@/lib/haptics';
import {
  Users, Mic, Navigation, AlertTriangle, Trophy, Camera,
  Gauge, Flame, Route, Shield, ChevronRight, ChevronDown, Play, X,
  MapPin, Clock, TrendingUp, Crown, Copy, Check,
  Eye, Phone, Settings, History, Video,
  MessageSquare, Wrench, Disc3 as Bike, Map as MapIcon, Globe2, Folder, Gamepad2,
  Palette, QrCode, Mountain, CloudRain, MonitorSmartphone, Heart, Download, Ruler, Lock, Waves, Repeat,
  CornerUpRight, Share2, Flag, CalendarClock, Zap, Skull, Timer,
  Radio, Music, SkipForward, Pause, FolderOpen, ListMusic, Wallet, Fuel,
  Handshake, Merge, Ghost, Star, UserRound, Ban, Search, MicOff, Bell, CloudLightning
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { formatSpeed, formatDistance, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { TIER_LADDER, TIER_STYLES } from '@/features/cards/types';
import { IdCard, Receipt, Sparkles, ShoppingBag, Megaphone, TrafficCone, Droplets } from 'lucide-react';
import shopAsset from '@/assets/garage-shop.png.asset.json';
import demoBikeAsset from '@/assets/demo-bike.png.asset.json';
import { tr } from '@/lib/i18n';

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
      title: tr("BLACKTOP"),
      subtitle: tr("Ride Logging & Convoy Communication"),
      description: tr("Privacy-first ride companion for motorcycles, cars, bikes and scooters. No sign-up required. Your ride history is stored on your device."),
      icon: Shield,
      color: 'accent',
      mockup: <IntroMockup />
    },
    {
      id: 'ride-together',
      title: tr("Ride Together"),
      subtitle: tr("Convoys, Voice & Solo Runs"),
      description: tr("Create or join a convoy with a simple code, talk hands-free over live voice, or head out solo — every mode shares the same tracking."),
      icon: Users,
      color: 'accent',
      mockup: <ConvoyMockup copied={copied} onCopy={() => setCopied(true)} />,
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
      color: 'accent',
      mockup: <NearbyMockup />,
      cards: [
        { icon: Shield, label: tr("Opt-In"), text: tr("Off by default. Only shared with other opted-in riders within a few km, and only while you ride.") },
        { icon: Handshake, label: tr("Handshake"), text: tr("One button next to save-location lists riders and convoys nearby, each with Invite, Join or Merge.") },
        { icon: Timer, label: tr("Request Timer"), text: 'A sent request counts down on the button; the receiver\'s button pulses with the same timer until they accept or decline.' },
        { icon: Users, label: tr("Pair Up"), text: tr("Two solo riders who accept become a convoy with voice, mid-ride, without stopping.") },
        { icon: Merge, label: tr("Merge & Unmerge"), text: 'Leaders merge convoys (up to 8 riders); either leader can unmerge and everyone returns to their own group.' },
        { icon: Ban, label: tr("Snooze & Block"), text: 'Not now quietens a rider for 30 minutes; Block hides them for good.' },
      ],
    },
    {
      id: 'pillion',
      title: tr("Pillion Mode"),
      subtitle: tr("For The Passenger"),
      description: tr("Join as Operator or Passenger. Passengers get everything in the lobby, then a ride screen built for the back seat: voice, waves and rescue, with no map or stats."),
      icon: UserRound,
      color: 'accent',
      mockup: <PillionMockup />,
      cards: [
        { icon: QrCode, label: tr("Operator Or Passenger"), text: tr("Pick on Join Convoy before entering the code or scanning the QR.") },
        { icon: Mic, label: tr("Voice"), text: tr("Join, mute and unmute, and pick the audio device.") },
        { icon: Heart, label: tr("Wave & React"), text: 'Wave and emoji reactions the whole convoy sees; "need a stop" buzzes the riders.' },
        { icon: AlertTriangle, label: tr("Rescue"), text: tr("Sees every rescue alert and can call one for the bike from their own phone.") },
      ],
    },
    {
      id: 'navigation',
      title: tr("Navigation"),
      subtitle: tr("Turn-By-Turn, Waypoints & Camera Alerts"),
      description: tr("Search a destination, or tap a place on the map, and ride it in-app with turn-by-turn directions from the moment you pick it. Leaders drop multiple stops, everyone sees the same line, and you get warned about cameras ahead."),
      icon: MapIcon,
      color: 'accent',
      mockup: <MapsMockup />,
      cards: [
        { icon: MapIcon, label: tr("Blacktop Maps"), text: tr("Built-in routing with live convoy dots coloured by accent.") },
        { icon: Route, label: tr("Multi-Stop Routes"), text: tr("Add, reorder and skip waypoints mid-ride, up to five at a time.") },
        { icon: Eye, label: tr("Camera Alerts"), text: tr("Speed and ANPR cameras on your route, flagged as you approach.") },
        { icon: Mountain, label: tr("Satellite & 3D"), text: tr("Toggle satellite imagery or a 3D terrain and building view.") },
        { icon: CloudRain, label: tr("Weather Radar"), text: tr("Optional live rain overlay so you can dodge the downpour.") },
        { icon: Waves, label: tr("Direct or Twisty"), text: tr("Pick your line before you go — both ETAs shown side by side.") },
        { icon: CloudRain, label: tr("Weather Routing"), text: tr("Warns when heavy rain sits on your route and offers a drier line.") },
        { icon: Repeat, label: tr("Loop Planner"), text: tr("No destination? Generate a twisty round trip back to where you are.") },
        { icon: Download, label: tr("Offline Maps"), text: tr("Save map areas to your phone for rides with no signal.") },
        { icon: CornerUpRight, label: tr("Turn-By-Turn"), text: 'Starts as soon as you pick a destination: the next turn sits where the search bar was, with your destination, time left and arrival time. Tap X to stop. Spoken directions lower the radio and crew voice while they talk; switch them off in Settings and the banner stays.' },
        { icon: MapPin, label: tr("Places On The Map"), text: tr("Cafés, fuel, food, sights and more appear as you zoom in, each with its own icon, plus your saved places and recent destinations. They step aside while you ride.") },
        { icon: Repeat, label: tr("Orbit A Place"), text: 'Tap a pin and the camera swings round it in 3D. Back returns you to where you were; Navigate sets the route.' },
        { icon: Search, label: tr("Instant Search"), text: tr("Places on the map show up as you type, even offline and however you spell them (\"mcdonalds\" finds McDonald's). Tap the clock on a recent to remove it.") },
        { icon: MapIcon, label: tr("Clearer Map"), text: tr("A higher-contrast dark map, opens where you last were, and a trimmed landscape layout for bar mounts.") },
        { icon: Navigation, label: tr("Smart Rerouting"), text: tr("Miss a turn and Blacktop finds a new way from where you are. Stops you pass come off the route by themselves.") },
        { icon: Search, label: tr("Heads-Up Map"), text: 'The search bar steps aside while you ride and comes back when you slow down; while navigating the turn banner takes its place, and in a convoy the status strip sits under it.' },
      ],
    },
    {
      id: 'hazards',
      title: tr("Hazard Reports"),
      subtitle: tr("Warn The Riders Behind You"),
      description: tr("Spot something on the road? Tap Report, pick a category and the hazard, and every rider heading that way gets a warning. Anonymous, and it clears itself when it's gone."),
      icon: Megaphone,
      color: 'accent',
      mockup: <HazardMockup />,
      cards: [
        { icon: Megaphone, label: tr("Two Taps"), text: tr("Road surface, conditions, traffic or other, then the hazard: 17 in all, from potholes and oil to crashes, roadworks, standstills, animals and hi-vis.") },
        { icon: Bell, label: tr("Warned Ahead"), text: tr("A banner (and, if you like, a spoken warning) about 20 seconds before you reach one, on the map or the ride screen.") },
        { icon: Check, label: tr("Still There?"), text: 'Ride past and Blacktop asks. Yes keeps it up for others; two Gone votes clear it.' },
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
      color: 'speed-active',
      mockup: <TrackingMockup />,
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
      color: 'destructive',
      mockup: <RescueMockup />,
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
      color: 'accent',
      mockup: <NotificationsMockup />,
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
      color: 'accent',
      mockup: <HistoryMockup />,
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
        { icon: Star, label: tr("Burn Trips"), text: 'Star the rides you love; pick weekly or monthly and everything unstarred is wiped to save space. Your totals never change.' },
        { icon: Sparkles, label: tr("Badge Trades"), text: tr("Badges are currency: spend 10 banked badge points for a spare trading-card copy to drop on the map. Kickbacks from collected drops feed the same wallet.") },
      ],
    },
    {
      id: 'garage',
      title: tr("Mecha-Nick's Garage"),
      subtitle: tr("Vehicles, Maintenance & Cards"),
      description: tr("Every vehicle in your stable gets its own photo, odometer, service intervals and a trading card that levels up as you ride it."),
      icon: Bike,
      color: 'accent',
      mockup: <GarageMockup />,
      cards: [
        { icon: Bike, label: tr("Your Vehicles"), text: tr("Photo, odometer and lifetime stats per machine.") },
        { icon: Wrench, label: tr("Maintenance"), text: tr("Chain, oil, brakes and tyres with bars that reset when serviced.") },
        { icon: CalendarClock, label: tr("Time Reminders"), text: tr("Set \"every N months\" alongside mileage — whichever comes first nags you.") },
        { icon: Bell, label: tr("Service Alerts"), text: tr("A notification when something's due soon or overdue: after the ride that takes it there, or on the day for time-based items.") },
        { icon: History, label: tr("Ride Assignment"), text: tr("Tag any ride to a vehicle and its stats roll up automatically.") },
        { icon: Receipt, label: tr("Logbook"), text: tr("A leather logbook per vehicle: keepers, lifetime stats, service record, highlights and every ride, page by page.") },
        { icon: QrCode, label: tr("Change Of Keeper"), text: 'Selling up? Show the hand-over code for 10 seconds; the new keeper scans it and the logbook, card and stats go with the vehicle.' },
      ],
    },
    {
      id: 'trading-cards',
      title: tr("Trading Cards"),
      subtitle: tr("Bronze To Orion"),
      description: tr("Every vehicle earns a collectable card that levels up with your ride count — ten tiers, each with its own finish. Swipe to see the whole ladder."),
      icon: Sparkles,
      color: 'accent',
      mockup: <TradingCardsMockup />,
      cards: [
        { icon: Sparkles, label: tr("Tier Ladder"), text: tr("Locked, Bronze, Silver, Gold, Platinum, Diamond, Ruby, Obsidian, Polyatomic, Orion.") },
        { icon: Camera, label: tr("Garage Shot"), text: tr("The card uses your garage placement and zoom, so it looks how you set it.") },
        { icon: QrCode, label: tr("Share & Scan"), text: tr("Show your card QR — mates scan it straight into their vault.") },
        { icon: Folder, label: tr("Card Vault"), text: tr("Two sideways rows: Spectre cards, then your own card followed by everything you've scanned. Tap any card to flip it: collected cards show their QR to pass on.") },
        { icon: Ghost, label: tr("Spectre Cards"), text: tr("Ghost versions of a rider's card, earned only by beating their time attack. Flip for your time, theirs and the margin. Never scanned or traded.") },
        { icon: MapIcon, label: tr("Card Drops"), text: tr("Spare copies — earned from tier milestones, crew challenges and 10-badge trades — can be planted on the Blacktop map, exactly where you're standing. Confirm with Yes / No, no map-pin fiddling.") },
        { icon: MapPin, label: tr("Go Collect"), text: 'Cards show as landmarks with distance and time away. Pull up beside one to scan it; collected cards get a green tick.' },
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
      color: 'accent',
      mockup: <CardChallengeMockup />,
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
      id: 'track-pack',
      title: tr("Track Day"),
      subtitle: tr("Lap Timing With Your Pit Crew"),
      description: tr("Pick a circuit from the library, build your own from the map or with a GPS lap, place the start/finish and sectors with a chase cam, then ready up: the timer starts itself at launch. Your pit crew scans your QR for live timing and a pit board."),
      icon: Zap,
      color: 'accent',
      mockup: <TrackPackMockup />,
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
      color: 'accent',
      mockup: <BlacktopWorldMockup />,
      cards: [
        { icon: Users, label: tr("Crew Convoys"), text: tr("A live list of your crew's open rides — tap for leader and riders.") },
        { icon: Trophy, label: tr("Crew Leaderboards"), text: tr("Named rankings for distance, top speed, lean, rides and arcade, updated after every ride. Get a heads-up when a mate passes you.") },
        { icon: Folder, label: tr("Crew QR & Cards"), text: tr("Scan a mate's QR to join their crew, or their card to collect it.") },
        { icon: Flag, label: tr("Challenges"), text: tr("Two rotating crew challenges every week — miles, corners, lean, ride count, top speed, night rides and longest ride — plus a monthly Forzathon-style crew goal you chase together, with special event weeks through the year. Notifications for targets hit, results and a 5-days-left nudge.") },
        { icon: Gamepad2, label: tr("Arcade"), text: tr("Hit Heavy, Petrol Head and Derez Legacy — personal bests and win tallies saved locally.") },
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
      color: 'accent',
      mockup: <SpeedshopMockup />,
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
      color: 'accent',
      mockup: <DerezMockup />,
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
      color: 'accent',
      mockup: <RadioMockup />,
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
      color: 'accent',
      mockup: <PayUpMockup />,
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
      color: 'accent',
      mockup: <PersonaliseMockup />,
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
      color: 'burn',
      mockup: <BurnMockup />
    },
    {
      id: 'complete',
      title: tr("Ready to Ride?"),
      subtitle: tr("Start Your First Convoy"),
      description: tr("Everything you need for group rides. No signup, no tracking, no ads. Just you and the road."),
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
    <div className="relative isolate min-h-dvh flex flex-col overflow-hidden">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-white/10">
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
          {tr("Back")}
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
          {tr("Skip")}
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
          aria-label={tr("Jump to slide")}
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
                      "rounded-2xl border border-border/40 frost p-3 flex flex-col gap-1.5",
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
            {tr("Get Started")}
          </Button>
        ) : (
          <Button 
            onClick={goNext}
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-accent hover:bg-accent/90 text-accent-foreground group"
          >
            <span>{tr("Continue")}</span>
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
    { icon: Users, label: tr("Convoy") },
    { icon: Mic, label: tr("Voice") },
    { icon: Route, label: tr("Routes") },
    { icon: Gauge, label: tr("Tracking") },
    { icon: Trophy, label: tr("Badges") },
    { icon: Shield, label: tr("Privacy") },
  ];

  return (
    <div className="w-full max-w-xs">
      <div className="grid grid-cols-3 gap-3">
        {features.map(({ icon: Icon, label }, i) => (
          <div 
            key={label}
            className="aspect-square frost rounded-2xl border border-border/30 flex flex-col items-center justify-center gap-2 animate-scale-in"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <Icon className="w-6 h-6 text-accent" />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 bg-accent/10 rounded-xl border border-accent/20 animate-slide-up delay-500">
        <p className="text-xs text-center text-accent">{tr("🔒 No sign-up required")}</p>
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
      <div className="frost rounded-2xl border border-border/30 p-5 animate-slide-up">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest text-center mb-3">
          {tr("Convoy Code")}
        </p>
        <button 
          onClick={onCopy}
          className="w-full flex items-center justify-center gap-3"
        >
          <span className="font-mono text-3xl font-semibold tracking-[0.15em]">{tr("XK7M9P")}</span>
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
          { icon: QrCode, label: tr("QR Join") },
          { icon: MessageSquare, label: tr("Lobby Chat") },
          { icon: Lock, label: tr("Crew Listed") },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl frost border border-border/30">
            <Icon className="w-4 h-4 text-accent" />
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Members Preview */}
      <div className="space-y-2 animate-slide-up delay-200">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          {tr("Members (4/8)")}
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
              member.isLeader ? "bg-accent/10 border border-accent/20" : "frost",
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

        {/* Turn banner — takes the search bar's slot while navigating */}
        <div className="absolute top-2 left-2 right-2 rounded-lg bg-card/95 border border-accent/60 flex items-center gap-2 px-2 py-1.5 animate-fade-in">
          <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
            <CornerUpRight className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-black leading-none tabular-nums">
              {Math.max(50, 450 - ((tick * 10) % 400))}
              <span className="text-[8px] text-muted-foreground ml-0.5">{tr("ft")}</span>
            </p>
            <p className="text-[9px] font-semibold truncate">{tr("Turn right onto Ridge Road")}</p>
          </div>
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
          <span className="text-[8px] text-muted-foreground">{tr("MPH")}</span>
        </div>

      </div>

      <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 animate-fade-in delay-300">
        <p className="text-xs text-center text-accent">{tr("Glows in their color when a rider talks · camera eyes warn you ahead")}</p>
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
  // Simulated friction circle: cornering from the lean (a leaning bike's tan(lean)), braking / drive random.
  const [gVec, setGVec] = useState(() => ({ lateral: 0, longitudinal: 0, ...emptyGVector() }));
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
      setGVec((prev) => {
        const leanNow = (Math.random() * 2 - 1) * 42;
        const lateral = Math.tan((leanNow * Math.PI) / 180) * 0.85;
        const longitudinal = Math.random() < 0.5 ? Math.random() * 0.75 : -Math.random() * 0.4;
        const envelope = prev.envelope.slice();
        const mag = Math.hypot(lateral, longitudinal);
        const bin = envelopeBin(lateral, longitudinal);
        envelope[bin] = Math.max(envelope[bin], mag);
        return {
          lateral,
          longitudinal,
          envelope,
          max: {
            left: Math.max(prev.max.left, -lateral),
            right: Math.max(prev.max.right, lateral),
            brake: Math.max(prev.max.brake, longitudinal),
            accel: Math.max(prev.max.accel, -longitudinal),
          },
        };
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
        <div className="frost rounded-xl px-4 py-2 border border-border/30">
          <p className="text-[9px] text-muted-foreground uppercase tracking-widest">{tr("Lean")}</p>
          <p className="font-mono text-base font-semibold text-accent transition-all duration-500">
            {Math.abs(lean)}°{lean < 0 ? tr(" L") : tr(" R")} <span className="text-[9px] text-muted-foreground">{tr("max")}{" "}{maxLean}°</span>
          </p>
          <div className="mt-1 h-1 w-24 rounded-full bg-secondary overflow-hidden relative">
            <div
              className="absolute top-0 h-full w-1.5 rounded-full bg-accent transition-all duration-500"
              style={{ left: `calc(${((lean + 45) / 90) * 100}% - 3px)` }}
            />
          </div>
        </div>
      </div>

      {/* G meter */}
      <div className="flex justify-center animate-slide-up delay-100">
        <GForceCircle lateral={gVec.lateral} longitudinal={gVec.longitudinal} envelope={gVec.envelope} max={gVec.max} className="w-52" />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 animate-slide-up delay-200">
        <div className="frost rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground mb-1">{tr("Distance")}</p>
          <p className="font-mono text-lg font-semibold">{formatDistance(distance, settings.distanceUnit)}</p>
          <p className="text-[10px] text-muted-foreground">{dLabel}</p>
        </div>
        <div className="frost rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground mb-1">{tr("Time")}</p>
          <p className="font-mono text-lg font-semibold">{mmss}</p>
        </div>
        <div className="frost rounded-xl p-3 border border-border/30">
          <p className="text-xs text-muted-foreground mb-1">{tr("Max")}</p>
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
              <span className="text-sm font-semibold text-white">{tr("J")}</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-destructive">{tr("Jake needs rescue!")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {tr("Location shared • 2.4 mi away")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <div className="flex-1 py-2 bg-destructive/20 rounded-xl text-center">
              <span className="text-xs font-medium text-destructive">{tr("Add Waypoint")}</span>
            </div>
            <div className="flex-1 py-2 bg-secondary/50 rounded-xl text-center">
              <span className="text-xs font-medium text-muted-foreground">{tr("Dismiss")}</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-center animate-fade-in delay-500 space-y-1">
        <p className="text-xs text-muted-foreground">
          {tr("Rescue alerts reach the whole convoy")}
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          {tr("Lives in the map control row — never next to End Ride")}
        </p>
      </div>
    </div>
  );
}



function MiniReceipt({ timeAttack }: { timeAttack?: boolean }) {
  const rows = timeAttack
    ? [
        [tr("Max Spd"), '118 MPH'],
        ['Distance', '29.5 MI'],
        ['Duration', '3:41'],
        ['Target', '3:58'],
        ['Delta', '-0:17'],
      ]
    : [
        [tr("Max Spd"), '104 MPH'],
        [tr("Max Lean"), '44°'],
        ['Distance', '45.2 MI'],
        ['Duration', '1:23:45'],
        [tr("Avg Spd"), '32 MPH'],
      ];
  return (
    <div className="w-full">
      <div className={cn('receipt-edge-top', timeAttack && 'receipt-edge-timeattack')} />
      <div className={cn('receipt px-4 py-3 font-receipt text-[--ink]', timeAttack && 'receipt-timeattack')}>
        <div className="text-center">
          <div className="text-xl font-bold tracking-[0.15em]">{tr("BLACKTOP STORE")}</div>
          <div className="text-[10px] tracking-[0.28em] opacity-70 mt-0.5">
            {timeAttack ? tr("— TIME ATTACK RECEIPT —") : tr("— RIDE RECEIPT —")}
          </div>
        </div>
        <div className="my-2 border-t-2 border-dashed border-[--ink] opacity-60" />
        <div className="space-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="receipt-row font-receipt !text-sm">
              <span className="uppercase tracking-wider">{label}</span>
              <span className="leader" aria-hidden />
              <span className="uppercase font-bold">{value}</span>
            </div>
          ))}
        </div>
        <div className="my-2 border-t-2 border-dashed border-[--ink] opacity-60" />
        {timeAttack ? (
          <div className="text-center">
            <div className="text-sm tracking-[0.2em] font-bold">{tr("WON · SPECTRE UNLOCKED")}</div>
            <div className="text-[10px] opacity-70 mt-0.5">{tr("RICO&rsquo;S PANIGALE · GOLD")}</div>
            <div className="text-[10px] opacity-70">{tr("3x SPEED DEMON")}</div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-sm tracking-[0.2em]">{tr("THANK YOU FOR THE RIDE")}</div>
            <div className="text-[10px] opacity-60 tracking-widest mt-0.5">{tr("ORDER #4C1A9F")}</div>
          </div>
        )}
        <div className="receipt-barcode mt-2" aria-hidden />
      </div>
      <div className={cn('receipt-edge-bottom', timeAttack && 'receipt-edge-timeattack')} />
    </div>
  );
}

function HistoryMockup() {
  const rides = [
    { date: 'Today', distance: '29.5 mi', time: '3:41', badge: '⏱️', tag: tr("Time attack") },
    { date: 'Yesterday', distance: '28.7 mi', time: '0:52:18', badge: '🛣️', tag: null },
    { date: 'Dec 14', distance: '62.1 mi', time: '2:05:33', badge: null, tag: null },
  ];

  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
        <div className="snap-center shrink-0 w-[15rem] space-y-3">
          {rides.map((ride, i) => (
            <div
              key={i}
              className="frost rounded-xl border border-border/30 p-4 animate-slide-up"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">{ride.date}</p>
                {ride.badge && <span className="text-lg">{ride.badge}</span>}
              </div>
              {ride.tag && (
                <span className="inline-flex items-center gap-1 mb-2 text-[10px] text-[hsl(330_81%_60%)] bg-[hsl(330_81%_60%)]/10 px-2 py-0.5 rounded-lg font-medium">
                  <Timer className="w-2.5 h-2.5" />
                  {ride.tag}
                </span>
              )}
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
        </div>
        <div className="snap-center shrink-0 w-[15rem]">
          <MiniReceipt />
        </div>
        <div className="snap-center shrink-0 w-[15rem]">
          <MiniReceipt timeAttack />
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 animate-fade-in delay-400">
        <Video className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{tr("Swipe: rides, receipt & pink time-attack receipt")}</p>
      </div>
    </div>
  );
}


function BlacktopWorldMockup() {
  const landmarks = [
    { label: tr("Crew Convoys"), top: '18%', left: '12%' },
    { label: tr("Crew Leaderboards"), top: '12%', right: '8%' },
    { label: tr("Join Crew"), bottom: '26%', left: '8%' },
    { label: tr("Crew QR"), bottom: '20%', right: '10%' },
    { label: tr("Speedshop"), top: '34%', right: '4%' },
    { label: tr("Blacktank"), bottom: '5%', left: '36%' },
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
            <span className="text-[8px] tracking-[0.2em] uppercase text-white/60">{tr("crew hub")}</span>
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
        {tr("Tap a landmark to jump in — long-press the home globe to launch")}
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
                <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="5.5" fill={r.color} opacity={fade} fontWeight="700">{tr("DEREZ!")}</text>
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
                <text x={pt.x} y={pt.y - 8} textAnchor="middle" fontSize="6" fill={winner.color} fontWeight="800">{tr("WINNER!")}</text>
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
          {t < 0.6 ? tr("3 riders live") : t < 0.68 ? tr("Pink derezzed!") : t < 0.78 ? tr("2 riders live") : t < 0.86 ? tr("Orange derezzed!") : tr("Blue wins!")}
        </div>
      </div>
      <p className="text-[10px] text-center text-muted-foreground">
        {tr("Leader draws the arena · riders leave coloured walls · hit a wall and you derez")}
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
function DerezTrail({ d, color, pct, opacity = 0.9 }: { d: string; color: string; pct: number; opacity?: number }) {
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
      opacity={opacity}
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
          {burned ? tr("✓ All data deleted") : tr("Ride history")}
        </div>
        <div className={cn(
          "py-2 px-4 rounded-xl text-sm transition-all duration-500 delay-100",
          burned ? "bg-[hsl(var(--burn))]/10 text-[hsl(var(--burn))]" : "bg-secondary text-muted-foreground"
        )}>
          {burned ? tr("✓ All data deleted") : tr("Statistics")}
        </div>
        <div className={cn(
          "py-2 px-4 rounded-xl text-sm transition-all duration-500 delay-200",
          burned ? "bg-[hsl(var(--burn))]/10 text-[hsl(var(--burn))]" : "bg-secondary text-muted-foreground"
        )}>
          {burned ? tr("✓ All data deleted") : tr("Convoy data")}
        </div>
      </div>

      <p className="text-xs text-muted-foreground animate-fade-in delay-500">
        {tr("Irreversible")}
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
          <span className="text-sm">{tr("No signup required")}</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Eye className="w-5 h-5 text-accent" />
          <span className="text-sm">{tr("No tracking or ads")}</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Phone className="w-5 h-5 text-accent" />
          <span className="text-sm">{tr("Data stays on device")}</span>
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
        <img src={shopAsset.url} alt={tr("Mecha-Nick's garage")} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/25" />
        <img src={demoBikeAsset.url} alt={tr("Red pixel-art bike")} className="absolute bottom-1 left-1/2 -translate-x-1/2 h-24 object-contain" />
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm border border-white/10">
          <span className="text-[8px] uppercase tracking-[0.2em] text-white/70">{tr("Mecha-Nick's")}</span>
        </div>
      </div>

      {bikes.map((bike, i) => (
        <div
          key={bike.name}
          className={cn(
            "rounded-2xl border p-4 animate-slide-up",
            bike.active
              ? "bg-accent/10 border-accent/40"
              : "frost border-border/30"
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
                  <span className="text-[10px] uppercase tracking-wide text-accent font-medium">{tr("Active")}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{bike.model}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{tr("Odometer")}</span>
              <span className="font-mono font-semibold">
                {formatDistance(bike.km, settings.distanceUnit)} {getDistanceLabel(settings.distanceUnit)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="w-3 h-3 text-muted-foreground" />
              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                <div className={cn("h-full", bike.active ? "bg-destructive" : "bg-accent")} style={{ width: bike.active ? '86%' : '34%' }} />
              </div>
              <span className="text-[9px] text-muted-foreground">{tr("Chain")}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}




function NearbyMockup() {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-accent/50 bg-card/80 p-3 overflow-hidden">
      <div className="relative h-24 rounded-xl bg-[#0b0b0d] border border-border overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-dashed border-accent/60 bg-accent/5 animate-pulse" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent" />
        <div className="absolute left-[62%] top-[34%] w-2.5 h-2.5 rounded-full bg-accent/50 shadow-[0_0_8px_hsl(var(--accent))]" />
        <div className="absolute left-[30%] top-[62%] w-2.5 h-2.5 rounded-full bg-accent/50 shadow-[0_0_8px_hsl(var(--accent))]" />
        <div className="absolute left-[24%] top-[70%] w-2.5 h-2.5 rounded-full bg-accent/50 shadow-[0_0_8px_hsl(var(--accent))]" />
        <div className="absolute right-2 top-2 w-8 h-8 rounded-full bg-accent/25 border border-accent text-accent flex items-center justify-center shadow-[0_0_14px_hsl(var(--accent)/0.7)]">
          <Handshake className="w-4 h-4" />
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center">32</span>
        </div>
      </div>
      <div className="mt-2 rounded-xl border border-border bg-card/95 divide-y divide-border/60">
        {[
          { name: 'Ben', sub: tr("400 ft"), cta: tr("Invite"), Icon: UserRound },
          { name: tr("Eve's convoy"), sub: tr("0.6 mi · 3 riders"), cta: tr("Merge"), Icon: Users },
        ].map(({ name, sub, cta, Icon }) => (
          <div key={name} className="flex items-center gap-2 px-2.5 py-2">
            <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium truncate">{name}</p>
              <p className="text-[9px] text-muted-foreground">{sub}</p>
            </div>
            <span className="px-2 py-1 rounded-md bg-accent text-accent-foreground text-[10px] font-semibold">{cta}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-xl border border-accent/60 bg-card/95 px-2.5 py-2">
        <p className="text-[11px] font-semibold">{tr("Ana wants to ride together")}</p>
        <div className="mt-1.5 flex gap-1.5">
          <span className="flex-1 text-center py-1 rounded-md bg-foreground text-background text-[10px] font-semibold">{tr("Accept")}</span>
          <span className="flex-1 text-center py-1 rounded-md bg-secondary text-[10px] font-semibold">{tr("Decline")}</span>
        </div>
      </div>
    </div>
  );
}

function PillionMockup() {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-accent/50 bg-card/80 p-3 overflow-hidden">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-background border border-border">
        <span className="h-7 rounded-md flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
          <Bike className="w-3 h-3" />{" "}{tr("Operator")}
        </span>
        <span className="h-7 rounded-md flex items-center justify-center gap-1 text-[10px] font-semibold bg-accent text-accent-foreground">
          <UserRound className="w-3 h-3" />{" "}{tr("Passenger")}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1.5 py-3">
        <div className="w-16 h-16 rounded-full bg-accent/20 border-2 border-accent/60 flex items-center justify-center">
          <MicOff className="w-7 h-7 text-accent" />
        </div>
        <p className="text-[10px] text-muted-foreground">{tr("Muted · tap to talk")}</p>
      </div>
      <div className="rounded-lg bg-foreground text-background text-center py-1.5 text-xs font-semibold">{tr("👋 Wave")}</div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {['👍', '🔥', '🛑', '⛽'].map((e) => (
          <div key={e} className="aspect-square rounded-lg bg-background border border-border flex items-center justify-center text-lg">
            {e}
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-lg border-2 border-destructive/60 text-destructive text-center py-1.5 text-[11px] font-semibold flex items-center justify-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />{" "}{tr("Request rescue")}
      </div>
    </div>
  );
}

function TrackPackMockup() {
  const sectors: [string, string][] = [['7.34', 'bg-[#7c3aed] text-white border-[#7c3aed]'], ['7.45', 'bg-[hsl(142_71%_45%)]/20 text-[hsl(142_71%_45%)] border-[hsl(142_71%_45%)]/50'], ['7.75', 'bg-warning/15 text-warning border-warning/50']];
  return (
    <div className="w-full max-w-xs rounded-2xl border border-accent/50 bg-card/80 p-3 overflow-hidden space-y-2">
      <div className="rounded-2xl border-2 border-accent bg-background py-2 text-center">
        <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">{tr("Lap 6")}</p>
        <p className="font-mono font-black tabular-nums text-3xl leading-none">1:32.418</p>
        <p className="font-mono font-black tabular-nums text-lg text-[hsl(142_71%_45%)]">−0.214</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {sectors.map(([t, c], i) => (
          <div key={i} className={`rounded-lg border text-center py-1 ${c}`}>
            <p className="text-[8px] font-bold uppercase tracking-widest opacity-80">{tr("S")}{i + 1}</p>
            <p className="font-mono font-bold tabular-nums text-xs">{t}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <svg viewBox="0 0 120 70" className="w-24 h-14 rounded-lg bg-background border border-border">
          <path d="M20 50 C 10 30, 30 12, 55 16 S 105 12, 108 34 S 80 62, 55 56 S 28 62, 20 50 Z" fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="5" />
          <path d="M20 50 C 10 30, 30 12, 55 16 S 105 12, 108 34" fill="none" stroke="hsl(var(--accent))" strokeWidth="2" />
          <line x1="14" y1="54" x2="26" y2="46" stroke="#fff" strokeWidth="2" />
          <circle cx="108" cy="34" r="4" fill="hsl(var(--accent))" stroke="#000" />
        </svg>
        <div className="flex-1 rounded-lg bg-black border-2 border-accent text-center py-2">
          <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-accent">{tr("Pit board")}</p>
          <p className="text-xl font-black text-white">{tr("PUSH")}</p>
        </div>
      </div>
    </div>
  );
}

function HazardMockup() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStage(1), 700);
    const b = setTimeout(() => setStage(2), 2600);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="grid grid-cols-2 gap-2 animate-scale-in">
        {[
          { label: tr("Road surface"), color: '#f59e0b', Icon: Route },
          { label: tr("Conditions"), color: '#38bdf8', Icon: CloudRain },
          { label: tr("Traffic"), color: '#ef4444', Icon: TrafficCone },
          { label: tr("Other"), color: '#a78bfa', Icon: AlertTriangle },
        ].map(({ label, color, Icon }) => (
          <div key={label} className="h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold" style={{ borderColor: `${color}99`, background: `${color}1f` }}>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color }}>
              <Icon className="w-4 h-4 text-white" />
            </span>
            {label}
          </div>
        ))}
      </div>
      {stage >= 1 && (
        <div className="flex items-center gap-3 rounded-2xl border-2 bg-card/95 px-3 py-2.5 animate-slide-up" style={{ borderColor: '#f59e0b' }}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#f59e0b' }}>
            <Droplets className="w-5 h-5 text-white" />
          </span>
          <span>
            <span className="block font-bold text-sm">{tr("Oil / diesel spill")}</span>
            <span className="block text-xs text-muted-foreground">{tr("300 m ahead")}</span>
          </span>
        </div>
      )}
      {stage >= 2 && (
        <div className="rounded-2xl border border-border bg-card/95 p-3 animate-slide-up">
          <p className="text-xs font-semibold text-center">{tr("Oil / diesel spill: still there?")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="h-9 rounded-xl bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold">{tr("Yes")}</div>
            <div className="h-9 rounded-xl border-2 border-border flex items-center justify-center text-xs font-bold">{tr("Gone")}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsMockup() {
  const items = [
    { icon: AlertTriangle, tint: 'text-destructive', title: tr("🚨 Rico needs rescue"), body: tr("Tap to see where they are."), when: 'now' },
    { icon: CloudLightning, tint: 'text-sky-300', title: tr("⛈️ Thunderstorms heading your way"), body: tr("Expected in about 2 hours around your last location."), when: '4m' },
    { icon: Ghost, tint: 'text-accent', title: tr("⏱️ Your time attack was beaten"), body: tr("Rico beat your V4 Ducati time: 3:41 vs your 3:58."), when: '1h' },
    { icon: Wrench, tint: 'text-warning', title: tr("🔧 Chain lube due soon"), body: tr("V4 Ducati: due in 150 mi."), when: '3h' },
  ];
  return (
    <div className="w-full max-w-xs rounded-[28px] border border-border/60 bg-gradient-to-b from-[hsl(230_30%_14%)] to-black p-3 space-y-2">
      <p className="text-center font-mono text-3xl font-light text-white/90 pt-1">9:41</p>
      <p className="text-center text-[10px] text-white/50 -mt-1 mb-1">{tr("Sunday")}</p>
      {items.map((n, i) => (
        <div key={n.title} className="rounded-2xl bg-white/10 backdrop-blur-md px-3 py-2 animate-slide-up" style={{ animationDelay: `${150 + i * 120}ms` }}>
          <div className="flex items-center gap-1.5 text-[9px] text-white/60">
            <n.icon className={cn('w-3 h-3', n.tint)} />{" "}{tr("BLACKTOP")}{" "}<span className="ml-auto">{n.when}</span>
          </div>
          <p className="text-[11px] font-semibold text-white leading-tight mt-0.5">{n.title}</p>
          <p className="text-[10px] text-white/70 leading-snug">{n.body}</p>
        </div>
      ))}
    </div>
  );
}

function SpeedshopMockup() {
  return (
    <div className="w-full max-w-xs space-y-2">
      <div className="relative h-44 rounded-2xl overflow-hidden border border-accent/60 bg-black">
        <img src={shopAsset.url} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 60%, transparent 35%, rgba(0,0,0,0.65) 100%)' }} />
        <div className="absolute top-2 left-2 rounded-lg bg-black/75 border border-white/10 px-2 py-1">
          <p className="text-[7px] uppercase tracking-[0.25em] text-accent">1 / 6</p>
          <p className="text-[10px] font-bold">{tr("Printed Vehicle Card")}</p>
        </div>
        <span className="absolute top-2 right-2 rounded bg-accent text-accent-foreground text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rotate-3">{tr("Coming soon")}</span>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-16 aspect-[5/7] rounded-md bg-gradient-to-br from-yellow-300 via-amber-500 to-yellow-700 border border-yellow-200/60 shadow-[0_10px_14px_rgba(0,0,0,0.8)] p-1">
          <div className="h-1/2 rounded-sm bg-black/25" />
          <div className="mt-1 grid grid-cols-2 gap-0.5">
            {[0, 1, 2, 3].map((k) => <div key={k} className="h-2 rounded-sm bg-black/25" />)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-8 w-10 rounded-xl border-2 border-accent/60 flex items-center justify-center"><ChevronRight className="w-4 h-4 rotate-180" /></span>
        <div className="flex-1 flex justify-center gap-1">
          {[0, 1, 2, 3, 4, 5].map((k) => <span key={k} className={cn('h-1.5 rounded-full', k === 0 ? 'w-4 bg-accent' : 'w-1.5 bg-muted-foreground/30')} />)}
        </div>
        <span className="h-8 w-10 rounded-xl border-2 border-accent/60 flex items-center justify-center"><ChevronRight className="w-4 h-4" /></span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-[10px] font-semibold text-center">
        <span className="rounded-xl bg-accent text-accent-foreground py-1.5">{tr("I'd buy it")}</span>
        <span className="rounded-xl border border-border py-1.5 text-muted-foreground">{tr("Maybe")}</span>
        <span className="rounded-xl border border-border py-1.5 text-muted-foreground">{tr("Not for me")}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold text-center">
        {['£5', '£10', '£15', '£20+'].map((p) => <span key={p} className={cn('rounded-lg border py-1', p === '£10' ? 'bg-accent text-accent-foreground border-accent' : 'border-border text-muted-foreground')}>{p}</span>)}
      </div>
    </div>
  );
}

function CardChallengeMockup() {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-accent/50 bg-card/80 p-3 overflow-hidden">
      <div className="relative h-40 rounded-xl bg-[#0b0b0d] border border-border overflow-hidden">
        <svg viewBox="0 0 240 150" className="absolute inset-0 w-full h-full">
          <path
            d="M24 122 C 60 118, 72 78, 108 72 S 176 60, 206 30"
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="6 5"
            opacity="0.45"
          />
          <path
            d="M24 122 C 60 118, 72 78, 108 72 S 176 60, 206 30"
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth="3"
            strokeLinecap="round"
            className="animate-demo-trail"
          />
          <circle cx="24" cy="122" r="5" fill="hsl(var(--accent))" />
          <circle cx="206" cy="30" r="5" fill="hsl(142 71% 45%)" />
        </svg>
        <span className="absolute left-2 bottom-2 text-[9px] font-bold uppercase tracking-widest text-accent">{tr("Start · card")}</span>
        <span className="absolute right-2 top-2 text-[9px] font-bold uppercase tracking-widest text-[hsl(142_71%_45%)]">{tr("Finish")}</span>
        <div className="absolute left-1/2 -translate-x-1/2 top-3 rounded-lg bg-card/95 border border-accent px-3 py-1 text-center">
          <p className="text-[8px] uppercase tracking-widest text-muted-foreground">{tr("Time attack")}</p>
          <p className="text-base font-black tabular-nums leading-tight">3:41</p>
          <p className="text-[9px] font-bold text-[hsl(142_71%_45%)] tabular-nums">{tr("Target 3:58 · -0:17")}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-secondary/50 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold">{tr("Challenge beaten")}</span>
        <span className="text-[10px] font-bold text-[hsl(142_71%_45%)]">{tr("3x Speed Demon + Spectre")}</span>
      </div>
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
                      {tr("VEHICLE")}
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
                        <div className="text-[10px] text-white/50 font-mono">{tr("PHOTO")}</div>
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
                    {t.label.toUpperCase()} · {t.minRides === 0 ? tr("0 RIDES") : tr("{0}+ RIDES", [t.minRides])}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center animate-fade-in delay-300">
        {tr("← swipe to see every tier from Bronze to Orion →")}
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
      <div className="rounded-2xl border border-border/30 frost p-4 animate-slide-up">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">{tr("Accent Colour")}</p>
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
      <div className="rounded-2xl border border-border/30 frost p-4 space-y-3 animate-slide-up delay-200">
        {[
          { icon: Gauge, label: tr("Ride metrics"), value: tr("Lean · G · Flyover") },
          { icon: AlertTriangle, label: tr("Safety"), value: tr("Alerts · Auto-rescue") },
          { icon: Play, label: tr("Demo"), value: tr("Replay tour") },
          { icon: MonitorSmartphone, label: tr("Car display"), value: 'Landscape' },
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

function RadioMockup() {
  const stations = [
    { name: tr("Night Ride"), hsl: '38 95% 55%' },
    { name: 'Backroads', hsl: '186 94% 50%' },
    { name: 'Redline', hsl: '0 84% 60%' },
    { name: 'Cruise', hsl: '262 83% 58%' },
  ];
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % stations.length), 2200);
    return () => clearInterval(id);
  }, [stations.length]);

  const step = 360 / stations.length;
  const current = stations[active];

  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="rounded-2xl border border-border/30 frost p-4 flex flex-col items-center animate-slide-up">
        <div className="relative w-40 h-40">
          <div className="absolute inset-0 rounded-full border border-border/50" />
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[9px] border-l-transparent border-r-transparent border-t-accent z-10" />
          <div
            className="absolute inset-0 transition-transform duration-700 ease-out"
            style={{ transform: `rotate(${-active * step}deg)` }}
          >
            {stations.map((s, i) => {
              const angle = i * step - 90; // -90 puts the first station at the top
              const rad = (angle * Math.PI) / 180;
              const x = Math.cos(rad) * 58; // orbit radius in px
              const y = Math.sin(rad) * 58;
              const isActive = i === active;
              return (
                <div
                  key={s.name}
                  className="absolute left-1/2 top-1/2 -ml-[18px] -mt-[18px] w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-500"
                  style={{
                    transform: `translate(${x}px, ${y}px) rotate(${active * step}deg)`,
                    backgroundColor: `hsl(${s.hsl} / ${isActive ? 0.35 : 0.1})`,
                    borderColor: `hsl(${s.hsl} / ${isActive ? 1 : 0.35})`,
                    color: `hsl(${s.hsl})`,
                    boxShadow: isActive ? `0 0 18px 4px hsl(${s.hsl} / 0.55)` : 'none',
                  }}
                >
                  <Music className="w-4 h-4" />
                </div>
              );
            })}
          </div>
          <div className="absolute inset-[50px] rounded-full bg-card border border-border flex flex-col items-center justify-center">
            <span className="text-[8px] uppercase tracking-widest text-muted-foreground">{tr("Station")}</span>
            <span className="text-[11px] font-bold text-center px-1 leading-tight">{current.name}</span>
          </div>
        </div>

      </div>

      <div className="rounded-2xl border border-border/30 frost p-4 space-y-2 animate-slide-up delay-200">
        <p className="text-xs font-semibold text-center truncate">{tr("Midnight Run — Track 04")}</p>
        <div className="h-1 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-accent animate-pulse" style={{ width: '42%' }} />
        </div>
        <div className="flex items-center justify-center gap-4 pt-1">
          <SkipForward className="w-4 h-4 text-muted-foreground rotate-180" />
          <span className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
            <Pause className="w-4 h-4" />
          </span>
          <SkipForward className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function PayUpMockup() {
  const [currency, setCurrency] = useState<'NIM' | 'USDT'>('USDT');
  const [amount, setAmount] = useState('5');

  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="rounded-2xl border border-border/40 frost p-4 animate-slide-up">
        <div className="flex items-center gap-2 mb-2">
          <Fuel className="w-4 h-4 text-accent" />
          <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Blacktank")}</p>
          <span className="ml-auto text-[10px] font-semibold text-foreground">{tr("4 riders · 12.5 USDT")}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          {tr("Your crew’s shared fuel pot. Withdrawals need a unanimous crew vote.")}
        </p>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-accent animate-pulse" style={{ width: '62%' }} />
        </div>
        <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
          <span>{tr("Chip in")}</span>
          <span>{tr("Request withdrawal · 4/4 votes to release")}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 animate-slide-up delay-100">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-accent" />
          <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Pay up")}</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {tr("Support the developer or send a friend fuel money.")}
        </p>

        <div className="rounded-xl border border-border/40 frost p-2 flex items-center justify-between mb-3">
          <span className="text-xs font-medium truncate">{tr("Developer")}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>

        <div className="flex gap-2">
          <div className="flex rounded-xl border border-border/40 overflow-hidden">
            {(['USDT', 'NIM'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  'px-3 h-10 text-xs font-semibold touch-target transition-colors',
                  currency === c ? 'bg-accent text-accent-foreground' : 'frost text-muted-foreground'
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            placeholder={tr("Amount")}
            className="flex-1 h-10 rounded-xl text-center font-semibold"
          />
        </div>

        <Button className="w-full h-10 mt-3 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-xl touch-target">
          <Heart className="w-4 h-4 mr-2" />
          {tr("Pay up")}
        </Button>
      </div>

      <div className="rounded-2xl border border-border/30 frost p-4 space-y-2 animate-slide-up delay-200">
        {[
          { icon: QrCode, label: tr("Scan friend QR") },
          { icon: Wallet, label: tr("NIM / Polygon USDT") },
          { icon: Users, label: tr("Saved payees") },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon className="w-4 h-4 text-accent flex-shrink-0" />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
