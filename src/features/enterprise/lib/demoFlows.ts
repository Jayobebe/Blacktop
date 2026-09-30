import {
  BedDouble,
  Bell,
  Bike,
  BookOpen,
  Calendar,
  CalendarClock,
  Camera,
  Check,
  ClipboardList,
  Clock,
  Flag,
  Fuel,
  Gauge,
  Image as ImageIcon,
  LifeBuoy,
  Mail,
  Map as MapIcon,
  MapPin,
  Mic,
  Mountain,
  Navigation,
  Palette,
  QrCode,
  Radio,
  Repeat,
  Route,
  Share2,
  Shield,
  Signal,
  Store,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  UserPlus,
  Users,
  Volume2,
  WifiOff,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { tr } from '@/lib/i18n';
import type { EnterpriseTier } from '../types';
import { tierName } from './tiers';

/**
 * The package demo pages (/enterprise/demo/:tier): for each package, a
 * walkthrough for the business and one for its customers. Every step is a
 * short explanation plus the phone screen it happens on (EnterpriseDemo draws
 * the screen from this data). Organisation names are made up, like the demo
 * mode's Mecha-Nick's Garage, and stay in English.
 */
export type DemoTone = 'accent' | 'ok' | 'warn' | 'bad' | 'muted';

export interface DemoRow {
  icon: LucideIcon;
  label: string;
  value?: string;
  tone?: DemoTone;
}

export interface DemoScreen {
  title: string;
  status: { label: string; tone: DemoTone };
  rows: DemoRow[];
  /** The screen's main button, if it has one. */
  action?: string;
}

export interface DemoStep {
  title: string;
  body: string;
  screen: DemoScreen;
}

export interface DemoFlow {
  /** Who this walkthrough follows ("The instructor"). */
  who: string;
  steps: DemoStep[];
}

export interface TierDemo {
  org: string;
  business: DemoFlow;
  customer: DemoFlow;
}

/** Figures in the rider's own units. */
export interface DemoUnits {
  speed: (kmh: number) => string;
  /** Short distances (metres in, m or ft out). */
  near: (m: number) => string;
  /** Road distances (km in, km or mi out). */
  far: (km: number) => string;
}

export function tierDemo(tier: EnterpriseTier, u: DemoUnits): TierDemo {
  switch (tier) {
    case 'academy':
      return {
        org: 'Northgate Rider Training',
        business: {
          who: tr("The instructor"),
          steps: [
            {
              title: tr("Print the day's student pass"),
              body: tr("Before the lesson, the instructor makes an 8-hour guest QR for the group. Students need no account and no payment."),
              screen: {
                title: tr("Guest pass"),
                status: { label: tr("Active"), tone: 'ok' },
                rows: [
                  { icon: QrCode, label: tr("Valid for"), value: tr("8 hours") },
                  { icon: Users, label: tr("Students joined"), value: '3' },
                  { icon: Clock, label: tr("Expires"), value: '17:30' },
                ],
                action: tr("Show QR code"),
              },
            },
            {
              title: tr("Keep the group on the tether"),
              body: tr("Tether Radar shows each student's distance and bearing. Falling back turns them amber; leaving the route turns them red."),
              screen: {
                title: tr("Tether Radar"),
                status: { label: tr("1 falling back"), tone: 'warn' },
                rows: [
                  { icon: User, label: tr("Student A"), value: u.near(40), tone: 'ok' },
                  { icon: User, label: tr("Student B"), value: u.near(180), tone: 'warn' },
                  { icon: User, label: tr("Student C"), value: u.near(60), tone: 'ok' },
                ],
              },
            },
            {
              title: tr("Talk over everything"),
              body: tr("God-Mode Comms cuts through student chatter and navigation, so an instruction always lands."),
              screen: {
                title: tr("Instructor God-Mode Comms"),
                status: { label: tr("Live"), tone: 'bad' },
                rows: [
                  { icon: Mic, label: tr("Priority voice"), value: tr("On") },
                  { icon: Volume2, label: tr("Navigation"), value: tr("Lowered") },
                  { icon: Users, label: tr("Listening"), value: '3' },
                ],
                action: tr("Hold to talk"),
              },
            },
            {
              title: tr("Time the emergency stop"),
              body: tr("Speed Trap Mode sets a virtual timing box. Every run gets an instant audio call: PASS or TOO SLOW."),
              screen: {
                title: tr("Mod 1 Speed Trap Mode"),
                status: { label: tr("Ready"), tone: 'accent' },
                rows: [
                  { icon: Gauge, label: tr("Target speed"), value: u.speed(50) },
                  { icon: User, label: tr("Student A"), value: tr("PASS"), tone: 'ok' },
                  { icon: User, label: tr("Student B"), value: tr("TOO SLOW"), tone: 'bad' },
                ],
              },
            },
            {
              title: tr("Send the report cards"),
              body: tr("After the session every student gets a branded report: braking, speed compliance, lean and a route recap."),
              screen: {
                title: tr("Student Report Cards"),
                status: { label: tr("Sent"), tone: 'ok' },
                rows: [
                  { icon: Gauge, label: tr("Braking"), value: tr("Firm") },
                  { icon: Check, label: tr("Speed compliance"), value: '96%' },
                  { icon: Route, label: tr("Route recap"), value: u.far(38) },
                ],
                action: tr("Email to student"),
              },
            },
          ],
        },
        customer: {
          who: tr("The student"),
          steps: [
            {
              title: tr("Scan in"),
              body: tr("The student scans the instructor's QR and the school's workspace appears on their phone, with no sign-up."),
              screen: {
                title: 'Northgate Rider Training',
                status: { label: tr("Guest pass"), tone: 'accent' },
                rows: [
                  { icon: QrCode, label: tr("Joined as"), value: tr("Student") },
                  { icon: Shield, label: tr("Your own rides"), value: tr("Stay private") },
                  { icon: Clock, label: tr("Access ends"), value: '17:30' },
                ],
                action: tr("Start lesson"),
              },
            },
            {
              title: tr("Hear the instructor"),
              body: tr("Instructions come straight into the helmet, over the music and the directions."),
              screen: {
                title: tr("On the road"),
                status: { label: tr("Instructor talking"), tone: 'bad' },
                rows: [
                  { icon: Mic, label: tr("Instructor"), value: tr("Live") },
                  { icon: Navigation, label: tr("Next turn"), value: u.near(400) },
                  { icon: Users, label: tr("Group"), value: '4' },
                ],
              },
            },
            {
              title: tr("Get the call"),
              body: tr("Every emergency stop is called out at once, so the student knows where they stand long before the test."),
              screen: {
                title: tr("Mod 1 Speed Trap Mode"),
                status: { label: tr("PASS"), tone: 'ok' },
                rows: [
                  { icon: Gauge, label: tr("Entry speed"), value: u.speed(52) },
                  { icon: Flag, label: tr("Result"), value: tr("PASS"), tone: 'ok' },
                  { icon: Repeat, label: tr("Runs today"), value: '3' },
                ],
              },
            },
            {
              title: tr("Take the report home"),
              body: tr("The report card lands in the student's inbox, and the workspace leaves their phone when the pass runs out."),
              screen: {
                title: tr("Your report"),
                status: { label: tr("In your inbox"), tone: 'ok' },
                rows: [
                  { icon: Mail, label: tr("Report card"), value: tr("Sent") },
                  { icon: TrendingUp, label: tr("Since last lesson"), value: '+12%' },
                  { icon: Clock, label: tr("Workspace removed"), value: '17:30' },
                ],
              },
            },
          ],
        },
      };

    case 'showroom':
      return {
        org: 'Apex Motorcycles',
        business: {
          who: tr("The dealer"),
          steps: [
            {
              title: tr("Check out a demo vehicle"),
              body: tr("Staff hand over a test ride with a guest QR that runs out on its own after 45 minutes or 2 hours."),
              screen: {
                title: tr("1-Tap Test-Ride Checkout"),
                status: { label: tr("Ready"), tone: 'accent' },
                rows: [
                  { icon: Bike, label: tr("Demo vehicle"), value: '#3' },
                  { icon: Timer, label: tr("Pass length"), value: tr("45 minutes") },
                  { icon: User, label: tr("Customer"), value: tr("Guest") },
                ],
                action: tr("Show QR code"),
              },
            },
            {
              title: tr("Watch the fleet"),
              body: tr("Fleet Radar shows every demo vehicle live. Leave the zone or pass the safety limit and the console alerts at once."),
              screen: {
                title: tr("Live Geofencing & Fleet Radar"),
                status: { label: tr("1 alert"), tone: 'bad' },
                rows: [
                  { icon: Bike, label: '#1', value: tr("On route"), tone: 'ok' },
                  { icon: Bike, label: '#3', value: tr("Outside the zone"), tone: 'bad' },
                  { icon: Bike, label: '#4', value: tr("Returning"), tone: 'accent' },
                ],
              },
            },
            {
              title: tr("Capture the lead"),
              body: tr("The customer's Hype Sheet carries your branding, and every share brings the lead back to you."),
              screen: {
                title: tr("Post-Ride Hype Sheet"),
                status: { label: tr("Shared"), tone: 'ok' },
                rows: [
                  { icon: Share2, label: tr("Shares"), value: '4' },
                  { icon: UserPlus, label: tr("New leads"), value: '1' },
                  { icon: Route, label: tr("Test route"), value: u.far(18) },
                ],
                action: tr("Follow up"),
              },
            },
            {
              title: tr("Keep the fleet healthy"),
              body: tr("Mileage logs itself on every ride, and service and battery checks are scheduled for you."),
              screen: {
                title: tr("Fleet Health & Mileage Log"),
                status: { label: tr("1 due"), tone: 'warn' },
                rows: [
                  { icon: Gauge, label: tr("Fleet distance"), value: u.far(12480) },
                  { icon: Wrench, label: tr("Service due"), value: '#2', tone: 'warn' },
                  { icon: Zap, label: tr("Battery check"), value: '#5' },
                ],
              },
            },
          ],
        },
        customer: {
          who: tr("The customer"),
          steps: [
            {
              title: tr("Scan for the keys"),
              body: tr("The customer scans the dealer's QR: no account, no forms, and the ride timer starts."),
              screen: {
                title: 'Apex Motorcycles',
                status: { label: tr("Test ride"), tone: 'accent' },
                rows: [
                  { icon: Bike, label: tr("Your vehicle"), value: '#3' },
                  { icon: Timer, label: tr("Time left"), value: '45:00' },
                  { icon: Shield, label: tr("Your own rides"), value: tr("Stay private") },
                ],
                action: tr("Start ride"),
              },
            },
            {
              title: tr("Ride the best road"),
              body: tr("Turn-by-turn follows the dealer's own test route, picked to show the vehicle at its best."),
              screen: {
                title: tr("Curated Test Route Guidance"),
                status: { label: tr("Guiding"), tone: 'accent' },
                rows: [
                  { icon: Navigation, label: tr("Next turn"), value: u.near(600) },
                  { icon: Route, label: tr("Route left"), value: u.far(12) },
                  { icon: Clock, label: tr("Back by"), value: '15:45' },
                ],
              },
            },
            {
              title: tr("Keep the Hype Sheet"),
              body: tr("Back at the dealer, the customer gets a brag card with peak lean, acceleration and the route map, ready to share."),
              screen: {
                title: tr("Post-Ride Hype Sheet"),
                status: { label: tr("Ready"), tone: 'ok' },
                rows: [
                  { icon: Gauge, label: tr("Peak lean"), value: '41°' },
                  { icon: Zap, label: tr("Hardest acceleration"), value: '0.9 G' },
                  { icon: Route, label: tr("Route"), value: u.far(18) },
                ],
                action: tr("Share"),
              },
            },
          ],
        },
      };

    case 'workshop':
      return {
        org: "Mecha-Nick's Garage",
        business: {
          who: tr("The workshop"),
          steps: [
            {
              title: tr("Book the vehicle in"),
              body: tr("The rider scans the shop's QR and says what needs doing. A ticket opens on both sides, linked to the vehicle in their garage."),
              screen: {
                title: tr("Scan-In Service Tickets"),
                status: { label: tr("Checked in"), tone: 'accent' },
                rows: [
                  { icon: Bike, label: tr("Vehicle"), value: tr("From the rider's garage") },
                  { icon: ClipboardList, label: tr("Job"), value: tr("Annual service") },
                  { icon: Clock, label: tr("Promised for"), value: '16:00' },
                ],
                action: tr("Accept job"),
              },
            },
            {
              title: tr("Quote extra work with photos"),
              body: tr("Found worn pads? Send photos and the price. The rider's answer is kept on the ticket."),
              screen: {
                title: tr("Photo Quotes & Approvals"),
                status: { label: tr("Awaiting approval"), tone: 'warn' },
                rows: [
                  { icon: Camera, label: tr("Photos"), value: '2' },
                  { icon: Wrench, label: tr("Front brake pads"), value: tr("Worn"), tone: 'warn' },
                  { icon: Timer, label: tr("Extra labour"), value: tr("40 minutes") },
                ],
                action: tr("Send quote"),
              },
            },
            {
              title: tr("Update the job"),
              body: tr("Every status change reaches the rider straight away, with a notification and an email when it's ready."),
              screen: {
                title: tr("Live Job Status & Alerts"),
                status: { label: tr("In progress"), tone: 'accent' },
                rows: [
                  { icon: Check, label: tr("Checked in"), value: '09:02', tone: 'ok' },
                  { icon: Check, label: tr("Approved"), value: '10:15', tone: 'ok' },
                  { icon: Wrench, label: tr("In progress"), value: tr("Now"), tone: 'accent' },
                ],
                action: tr("Mark as ready"),
              },
            },
            {
              title: tr("Stamp the service history"),
              body: tr("The work goes straight into the rider's maintenance log and logbook, stamped by the shop, with the next service set by date or distance."),
              screen: {
                title: tr("Automatic Service History"),
                status: { label: tr("Stamped"), tone: 'ok' },
                rows: [
                  { icon: BookOpen, label: tr("Logbook entry"), value: tr("Added") },
                  { icon: CalendarClock, label: tr("Next service"), value: tr("In 12 months") },
                  { icon: Gauge, label: tr("Or after"), value: u.far(6000) },
                ],
                action: tr("Close ticket"),
              },
            },
          ],
        },
        customer: {
          who: tr("The rider"),
          steps: [
            {
              title: tr("Scan at the counter"),
              body: tr("Say what's wrong, scan the QR, and follow the job from the ticket on your phone."),
              screen: {
                title: "Mecha-Nick's Garage",
                status: { label: tr("Checked in"), tone: 'accent' },
                rows: [
                  { icon: Bike, label: tr("Your vehicle"), value: tr("Linked") },
                  { icon: ClipboardList, label: tr("Job"), value: tr("Annual service") },
                  { icon: Clock, label: tr("Ready by"), value: '16:00' },
                ],
              },
            },
            {
              title: tr("Approve from anywhere"),
              body: tr("Photos and a price arrive in the app. Approve or decline in one tap, without a phone call."),
              screen: {
                title: tr("Approval needed"),
                status: { label: tr("Waiting for you"), tone: 'warn' },
                rows: [
                  { icon: Camera, label: tr("Photos"), value: '2' },
                  { icon: Wrench, label: tr("Front brake pads"), value: tr("Worn"), tone: 'warn' },
                  { icon: Timer, label: tr("Extra labour"), value: tr("40 minutes") },
                ],
                action: tr("Approve"),
              },
            },
            {
              title: tr("Know when it's ready"),
              body: tr("A notification and an email land the moment the job is done."),
              screen: {
                title: tr("Ready to collect"),
                status: { label: tr("Ready"), tone: 'ok' },
                rows: [
                  { icon: Bell, label: tr("Notification"), value: tr("Sent") },
                  { icon: Mail, label: tr("Email"), value: tr("Sent") },
                  { icon: MapPin, label: tr("Collect from"), value: "Mecha-Nick's Garage" },
                ],
              },
            },
            {
              title: tr("Keep the history"),
              body: tr("The service appears in your garage's logbook with the shop's stamp, and Blacktop reminds you when the next one is due."),
              screen: {
                title: tr("Your logbook"),
                status: { label: tr("Updated"), tone: 'ok' },
                rows: [
                  { icon: BookOpen, label: tr("Annual service"), value: tr("Stamped"), tone: 'ok' },
                  { icon: Bell, label: tr("Reminder"), value: tr("Set") },
                  { icon: Repeat, label: tr("Rebook"), value: tr("One tap") },
                ],
                action: tr("Rebook"),
              },
            },
          ],
        },
      };

    case 'touring':
      return {
        org: 'Alpine Moto Tours',
        business: {
          who: tr("The tour guide"),
          steps: [
            {
              title: tr("Build the tour pack"),
              body: tr("Waypoints, GPX corridors, offline maps, hotels and fuel stops go into one 7-day pack behind a single QR."),
              screen: {
                title: tr("Single-QR 7-Day Tour Pack"),
                status: { label: tr("7 days"), tone: 'accent' },
                rows: [
                  { icon: MapPin, label: tr("Waypoints"), value: '64' },
                  { icon: BedDouble, label: tr("Hotels"), value: '6' },
                  { icon: Fuel, label: tr("Fuel stops"), value: '14' },
                ],
                action: tr("Show QR code"),
              },
            },
            {
              title: tr("Talk to the whole tour"),
              body: tr("Master Broadcast reaches every rider, across split sub-groups, with one press."),
              screen: {
                title: tr("Tour Leader Master Broadcast"),
                status: { label: tr("Live"), tone: 'bad' },
                rows: [
                  { icon: Users, label: tr("Group A"), value: '8' },
                  { icon: Users, label: tr("Group B"), value: '7' },
                  { icon: Mic, label: tr("Broadcasting to"), value: tr("Every rider") },
                ],
                action: tr("Hold to talk"),
              },
            },
            {
              title: tr("Watch the tail"),
              body: tr("Sweep Radar keeps the live distance to the last rider, even with no signal, so nobody is left behind on a pass."),
              screen: {
                title: tr("Sweep & Tail-End-Charlie Radar"),
                status: { label: tr("All together"), tone: 'ok' },
                rows: [
                  { icon: Navigation, label: tr("Tail rider"), value: u.far(1.2) },
                  { icon: Clock, label: tr("Gap"), value: tr("2 minutes") },
                  { icon: WifiOff, label: tr("Offline maps"), value: tr("Ready"), tone: 'ok' },
                ],
              },
            },
            {
              title: tr("Answer a ping"),
              body: tr("When a rider presses Guide Ping, their position goes straight to the sweep and the leader."),
              screen: {
                title: tr("1-Tap Guide Ping"),
                status: { label: tr("A rider needs help"), tone: 'bad' },
                rows: [
                  { icon: User, label: tr("Rider 9"), value: tr("Stopped"), tone: 'bad' },
                  { icon: MapPin, label: tr("Distance behind"), value: u.far(3.4) },
                  { icon: Navigation, label: tr("Sweep"), value: tr("On the way"), tone: 'accent' },
                ],
                action: tr("Navigate to rider"),
              },
            },
          ],
        },
        customer: {
          who: tr("The rider on tour"),
          steps: [
            {
              title: tr("One scan before you leave"),
              body: tr("Scan the tour QR at the hotel and the whole week downloads, maps included, for the valleys with no signal."),
              screen: {
                title: 'Alpine Moto Tours',
                status: { label: tr("Downloaded"), tone: 'ok' },
                rows: [
                  { icon: Calendar, label: tr("Days"), value: '7' },
                  { icon: MapIcon, label: tr("Offline maps"), value: tr("Ready"), tone: 'ok' },
                  { icon: Route, label: tr("Today"), value: u.far(210) },
                ],
              },
            },
            {
              title: tr("Hear the guide"),
              body: tr("The guide's broadcasts come through in every sub-group, over the music."),
              screen: {
                title: tr("On tour"),
                status: { label: tr("Guide talking"), tone: 'bad' },
                rows: [
                  { icon: Mic, label: tr("Guide"), value: tr("Live") },
                  { icon: Fuel, label: tr("Next fuel"), value: u.far(38) },
                  { icon: BedDouble, label: tr("Tonight"), value: tr("Hotel pinned") },
                ],
              },
            },
            {
              title: tr("Press once for help"),
              body: tr("Lost or in trouble? One big glove-friendly button sends your position to the sweep and the leader."),
              screen: {
                title: tr("1-Tap Guide Ping"),
                status: { label: tr("Sent"), tone: 'ok' },
                rows: [
                  { icon: LifeBuoy, label: tr("Your position"), value: tr("Sent"), tone: 'ok' },
                  { icon: Navigation, label: tr("Sweep"), value: tr("On the way"), tone: 'accent' },
                  { icon: Clock, label: tr("Arriving in"), value: tr("4 minutes") },
                ],
                action: tr("Guide Ping"),
              },
            },
          ],
        },
      };

    case 'track_pro':
      return {
        org: 'Ridgeline Racing Club',
        business: {
          who: tr("Race control and the pit wall"),
          steps: [
            {
              title: tr("Run the meeting"),
              body: tr("Entries, grid, sessions, the start and results all live in the Race Organiser Console."),
              screen: {
                title: tr("Race Organiser Console"),
                status: { label: tr("Qualifying"), tone: 'accent' },
                rows: [
                  { icon: Users, label: tr("Entries"), value: '24' },
                  { icon: Flag, label: tr("Session"), value: 'Q2' },
                  { icon: Timer, label: tr("Time left"), value: '08:12' },
                ],
                action: tr("Publish grid"),
              },
            },
            {
              title: tr("Throw the flags"),
              body: tr("Yellow, red and chequered flags show on every cockpit the moment race control calls them."),
              screen: {
                title: tr("Virtual Race Control & Flagging"),
                status: { label: tr("Yellow flag"), tone: 'warn' },
                rows: [
                  { icon: Flag, label: tr("Sector 1"), value: tr("Green"), tone: 'ok' },
                  { icon: Flag, label: tr("Sector 2"), value: tr("Yellow"), tone: 'warn' },
                  { icon: Flag, label: tr("Sector 3"), value: tr("Green"), tone: 'ok' },
                ],
                action: tr("Red flag"),
              },
            },
            {
              title: tr("Read the telemetry"),
              body: tr("The pit wall sees sector times, live delta, lean and the G circle for every entry."),
              screen: {
                title: tr("Live Pit-Wall Telemetry"),
                status: { label: tr("Live"), tone: 'accent' },
                rows: [
                  { icon: Timer, label: tr("Last lap"), value: '1:32.418' },
                  { icon: TrendingDown, label: tr("Delta"), value: '-0.4', tone: 'ok' },
                  { icon: Gauge, label: tr("Max lean"), value: '54°' },
                ],
              },
            },
            {
              title: tr("Make the call"),
              body: tr("Pit board calls like Box box or Push now are spoken straight into the rider's helmet."),
              screen: {
                title: tr("Cockpit Pit Board Calls"),
                status: { label: tr("Sent"), tone: 'ok' },
                rows: [
                  { icon: Radio, label: tr("Call"), value: tr("Push now") },
                  { icon: TrendingDown, label: tr("Delta"), value: '-0.4', tone: 'ok' },
                  { icon: Flag, label: tr("Laps left"), value: '3' },
                ],
                action: tr("Send call"),
              },
            },
          ],
        },
        customer: {
          who: tr("Racers and spectators"),
          steps: [
            {
              title: tr("Ready up"),
              body: tr("Racers join the meeting from a QR and their phone becomes the timing, the dash and the radio."),
              screen: {
                title: 'Ridgeline Racing Club',
                status: { label: tr("Grid slot 7"), tone: 'accent' },
                rows: [
                  { icon: Flag, label: tr("Session"), value: tr("Race 1") },
                  { icon: Timer, label: tr("Start in"), value: '04:30' },
                  { icon: Radio, label: tr("Pit crew"), value: tr("Linked"), tone: 'ok' },
                ],
              },
            },
            {
              title: tr("Hear the pit wall"),
              body: tr("Calls and flags come into the helmet, so eyes stay on the track."),
              screen: {
                title: tr("Cockpit"),
                status: { label: tr("Yellow flag"), tone: 'warn' },
                rows: [
                  { icon: Radio, label: tr("Pit call"), value: tr("Push now") },
                  { icon: TrendingDown, label: tr("Delta"), value: '-0.4', tone: 'ok' },
                  { icon: Flag, label: tr("Lap"), value: '7 / 10' },
                ],
              },
            },
            {
              title: tr("Follow from the fence"),
              body: tr("Spectators open live timing on their own phone: positions on the circuit map, lap times and the running order."),
              screen: {
                title: tr("Spectator Live Timing"),
                status: { label: tr("Lap {0} of {1}", ['7', '10']), tone: 'accent' },
                rows: [
                  { icon: Trophy, label: tr("Position {0}", ['1']), value: '#12' },
                  { icon: Trophy, label: tr("Position {0}", ['2']), value: '#7' },
                  { icon: Trophy, label: tr("Position {0}", ['3']), value: '#31' },
                ],
              },
            },
          ],
        },
      };

    case 'billion':
      return {
        org: 'Vanta Factory Racing',
        business: {
          who: tr("The organisation"),
          steps: [
            {
              title: tr("Every module in one place"),
              body: tr("TrackPack, Showroom, Workshop, Academy and Touring run side by side under one account."),
              screen: {
                title: 'Vanta Factory Racing',
                status: { label: tr("Every module"), tone: 'accent' },
                rows: [
                  { icon: Flag, label: tierName('track_pro'), value: tr("On"), tone: 'ok' },
                  { icon: Store, label: tierName('showroom'), value: tr("On"), tone: 'ok' },
                  { icon: Wrench, label: tierName('workshop'), value: tr("On"), tone: 'ok' },
                ],
              },
            },
            {
              title: tr("Make it yours"),
              body: tr("Your map accents, splash screen and audio chimes, on every phone in the team."),
              screen: {
                title: tr("Custom branding"),
                status: { label: tr("Applied"), tone: 'ok' },
                rows: [
                  { icon: Palette, label: tr("Map accent"), value: tr("Custom") },
                  { icon: ImageIcon, label: tr("Splash screen"), value: tr("Custom") },
                  { icon: Bell, label: tr("Audio chimes"), value: tr("Custom") },
                ],
              },
            },
            {
              title: tr("No seat limits"),
              body: tr("Staff seats, fleet vehicles and guest QR codes are unlimited."),
              screen: {
                title: tr("Unlimited seats"),
                status: { label: tr("Unlimited"), tone: 'ok' },
                rows: [
                  { icon: Users, label: tr("Staff"), value: '∞' },
                  { icon: Bike, label: tr("Fleet"), value: '∞' },
                  { icon: QrCode, label: tr("Guest passes"), value: '∞' },
                ],
              },
            },
            {
              title: tr("Priority comms"),
              body: tr("A dedicated high-priority TURN relay keeps team voice up when the network is busy."),
              screen: {
                title: tr("Priority comms relay"),
                status: { label: tr("Priority"), tone: 'accent' },
                rows: [
                  { icon: Radio, label: tr("Relay"), value: tr("Dedicated") },
                  { icon: Signal, label: tr("Link quality"), value: tr("Excellent"), tone: 'ok' },
                  { icon: Users, label: tr("On the net"), value: '38' },
                ],
              },
            },
          ],
        },
        customer: {
          who: tr("Your riders and customers"),
          steps: [
            {
              title: tr("One workspace for everything"),
              body: tr("A customer can test-ride on Saturday, book a service on Monday and join a tour in June, all in the same branded workspace."),
              screen: {
                title: 'Vanta Factory Racing',
                status: { label: tr("Member"), tone: 'accent' },
                rows: [
                  { icon: Store, label: tr("Test ride"), value: tr("Saturday") },
                  { icon: Wrench, label: tr("Service"), value: tr("Monday") },
                  { icon: Mountain, label: tr("Tour"), value: tr("June") },
                ],
              },
            },
            {
              title: tr("Your brand all the way"),
              body: tr("Everything they see carries your colours and sounds, from the splash screen to the chimes."),
              screen: {
                title: tr("Welcome"),
                status: { label: tr("Your brand"), tone: 'accent' },
                rows: [
                  { icon: Palette, label: tr("Colours"), value: tr("Yours") },
                  { icon: Bell, label: tr("Sounds"), value: tr("Yours") },
                  { icon: Shield, label: tr("Their own rides"), value: tr("Stay private") },
                ],
              },
            },
            {
              title: tr("Nothing to buy"),
              body: tr("Customers join from a QR code with no account and no payment, and your seats never run out."),
              screen: {
                title: tr("Guest pass"),
                status: { label: tr("Joined"), tone: 'ok' },
                rows: [
                  { icon: QrCode, label: tr("Scan"), value: tr("Done"), tone: 'ok' },
                  { icon: User, label: tr("Account needed"), value: tr("No") },
                  { icon: Clock, label: tr("Access"), value: tr("Set by you") },
                ],
              },
            },
          ],
        },
      };
  }
}
