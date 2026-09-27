import { Link } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Play, Shield, BarChart2, Users, Mic, ShieldCheck, Map, Wrench, Globe2, Sparkles, Radio,
  Wallet, MonitorSmartphone, SlidersHorizontal, Flame, Navigation, Handshake, UsersRound, Timer, BookOpen, Ghost,
  BellRing, ShoppingBag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { BTLogo } from '@/components/BTLogo';

/**
 * First screen a new user sees. Above the fold: welcome, one-line summary,
 * Get started + Try the demo. Below: the full feature description as real,
 * indexable page content (headings + text), kept in sync with what the app
 * actually does — every line here is backed by a shipped feature.
 */

const FEATURES: { icon: React.ElementType; title: string; body: string }[] = [
  {
    icon: SlidersHorizontal,
    title: 'Set up for how you ride',
    body: 'Motorcycles, cars, bicycles, e-bikes and e-scooters. Tell Blacktop what you ride, who with and what you care about, and it hides everything else: solo riders never see convoy screens, drivers never see lean angle, cyclists get water stops instead of fuel.',
  },
  {
    icon: BarChart2,
    title: 'Ride tracking and stats',
    body: 'Distance, time, speed, lean angle and G-force for every ride, solo or in a group. Ride history with saveable ride receipts, 3D route flyovers, corner-by-corner reports, shareable recap cards and weekly or monthly Burn trips.',
  },
  {
    icon: Users,
    title: 'Live convoys',
    body: 'Start a convoy and share the code or QR. Everyone sees everyone on the map in real time, with a lobby chat, a shared destination and waypoints, leadership you can hand over mid-ride, and a status bar showing rider count, average speed, ETA and who has dropped behind, with a regroup prompt.',
  },
  {
    icon: Handshake,
    title: 'Nearby Riders',
    body: 'Riding near someone else on Blacktop? Send a handshake and ride together: you join the same convoy, map and voice chat, and whole convoys can merge and split again.',
  },
  {
    icon: Mic,
    title: 'In-ride voice chat',
    body: 'Talk to your convoy through your phone or Bluetooth headset and intercom. Voice is encrypted and never stored on a server.',
  },
  {
    icon: UsersRound,
    title: 'Pillion Mode',
    body: 'Passengers join the convoy on their own phone for voice chat, Wave and emoji reactions and rescue alerts, while the rider’s phone does the tracking.',
  },
  {
    icon: ShieldCheck,
    title: 'Crash rescue',
    body: 'Optional crash detection watches for a hard impact followed by a stop and asks if you’re okay. No answer and it alerts everyone in your convoy, your crew and your Discord with your location. Every rider gets a route to you, and whoever answers “I’m on my way” shows up on your screen.',
  },
  {
    icon: Map,
    title: 'Blacktop Map',
    body: 'Place search, multi-stop routes, a direct or twisty route choice, round-trip loop routes in Twisty, Scenic or Relaxed styles, rain radar with drier-route suggestions, speed camera warnings and offline map packs for when signal drops.',
  },
  {
    icon: Navigation,
    title: 'Turn-by-turn directions',
    body: 'Clear turn-by-turn guidance on the map with optional spoken directions, which lower your music and voice chat while they speak. It reroutes only when you leave the line.',
  },
  {
    icon: Timer,
    title: 'Track Pack',
    body: 'Lap timing for track days: walk or draw the track, set start/finish and sector lines, and time every lap. A pit crew phone links by QR for live timing, a track map and a pit board. Afterwards, compare laps with speed, lean and G traces and racing lines, then export as CSV or GPX.',
  },
  {
    icon: Wrench,
    title: 'Garage',
    body: 'Keep every vehicle in one place with photos, mileage and service reminders tuned to what it is: chain care for bikes, oil and filters for cars.',
  },
  {
    icon: BookOpen,
    title: 'Logbook and Vehicle Passport',
    body: 'Every vehicle gets a logbook of its ride and service history with a passport number. Selling it? Hand the logbook over phone to phone and the new keeper gets the full history.',
  },
  {
    icon: Globe2,
    title: 'Blacktop World',
    body: 'Opt in to a live globe of riders and crews: crew convoys, leaderboards, weekly and monthly challenges, arcade games and Blacktank, a shared crew fuel fund.',
  },
  {
    icon: Sparkles,
    title: 'Badges and trading cards',
    body: 'Earn badges from your rides, collect trading cards of other riders’ vehicles and hunt card drops hidden on the map. Set time attacks on your cards for others to race.',
  },
  {
    icon: Ghost,
    title: 'Ghost Cards',
    body: 'Beat someone’s time attack and you unlock a Spectre: a ghost edition of their card for your vault that can’t be traded.',
  },
  {
    icon: BellRing,
    title: 'Notifications',
    body: 'Optional alerts for rescue calls, heavy weather heading your way, service reminders, crew challenges and leaderboards, card pickups, time attacks and Blacktank votes.',
  },
  {
    icon: Radio,
    title: 'Blacktop Radio',
    body: 'Turn the music already on your phone into stations and flip between them from Home or mid-ride.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Car display mode',
    body: 'A large, low-clutter ride screen for Android phone mirroring to a car head unit.',
  },
  {
    icon: Wallet,
    title: 'Pay Up',
    body: 'Send a mate fuel money or tip with Nimiq Pay (NIM or USDT) by QR code. Payments happen in your own wallet.',
  },
  {
    icon: ShoppingBag,
    title: 'Speedshop (coming soon)',
    body: 'Printed vehicle cards, ride receipts, logbooks and merch are on the way. Tell us what you’d buy and what you’d pay.',
  },
  {
    icon: Flame,
    title: 'Private by default',
    body: 'No sign-up, no ads, no tracking SDKs. Your ride history lives on your phone, live convoy data is deleted when the ride ends, and the Burn button wipes everything in one tap.',
  },
];

interface WelcomeScreenProps {
  onStart: () => void;
}

export function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  const start = () => {
    haptics.light();
    onStart();
  };

  return (
    <main className="relative isolate h-dvh overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth page-in-fade">

      {/* Above the fold */}
      <section className="relative min-h-dvh flex flex-col items-center px-6 pt-10 landscape:pt-4 pb-4 landscape:pb-2 safe-top text-center">
        {/* Hero + actions centred in the space above the scroll prompt */}
        <div className="flex-1 flex flex-col landscape:flex-row items-center justify-center gap-8 landscape:gap-12 w-full">
        <div className="max-w-sm animate-slide-up landscape:text-left">
          <BTLogo size="lg" className="mx-auto mb-6 landscape:hidden rounded-2xl" />
          <p className="text-[13px] font-medium text-accent mb-2 landscape:mb-1.5">Welcome to Blacktop</p>
          <h1 className="text-[40px] landscape:text-3xl font-semibold tracking-[-0.035em] leading-[1.02] mb-4 landscape:mb-3">
            Every road.<br />Your way.
          </h1>
          <p className="text-muted-foreground text-[15px] landscape:text-sm leading-relaxed">
            Track your rides, ride together with live convoys and voice chat, and get help if you crash.
            Built for motorcycles, cars, bikes and scooters, and shaped around how you ride.
          </p>
        </div>

        <div className="w-full max-w-sm landscape:max-w-xs space-y-3 animate-slide-up" style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}>
          <Button onClick={start} className="w-full h-14 text-base font-semibold rounded-2xl touch-target">
            Get started
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
          <Button asChild variant="outline" className="w-full h-12 text-[15px] font-semibold rounded-2xl touch-target">
            <Link to="/demo">
              <Play className="w-4 h-4 mr-1" />
              Try the demo
            </Link>
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
            <Shield className="w-3.5 h-3.5 text-accent" />
            Free · No sign-up · No ads
          </p>
        </div>
        </div>

        <a
          href="#about"
          className="flex flex-col items-center gap-1 pt-4 landscape:pt-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground animate-fade-in"
          style={{ animationDelay: '500ms', animationFillMode: 'backwards' }}
        >
          What Blacktop does
          <ChevronDown className="w-4 h-4 animate-bounce-subtle" />
        </a>
      </section>

      {/* Full description — real content for people and search engines */}
      <section id="about" aria-labelledby="about-heading" className="relative px-6 pt-6 pb-12 max-w-2xl mx-auto safe-bottom">
        <h2 id="about-heading" className="text-2xl font-semibold tracking-tight mb-2">
          What Blacktop does
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          Blacktop is a free ride companion app for riders and drivers. It works in the browser and installs to your home
          screen on iPhone and Android, with no account to create.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-[20px] frost p-4">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="rounded-lg bg-accent/10 p-1.5">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
                <h3 className="text-sm font-semibold">{title}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 space-y-3 text-center">
          <Button onClick={start} className="w-full sm:w-auto sm:px-10 h-12 font-semibold rounded-2xl touch-target">
            Get started
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
          <p className="text-xs text-muted-foreground">
            <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>
            {' · '}
            <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">Terms &amp; Safety</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
