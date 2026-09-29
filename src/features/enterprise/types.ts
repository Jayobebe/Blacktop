import { tr } from '@/lib/i18n';

// Blacktop Enterprise. Tiers and roles mirror the CHECK constraints in
// supabase/migrations/20261002000000_enterprise_core.sql (tiers: 20261003090000_enterprise_workshop.sql): keep them in sync.

export type EnterpriseTier = 'academy' | 'showroom' | 'workshop' | 'touring' | 'track_pro' | 'billion';

/** Account members (organization_members). */
export type EnterpriseMemberRole = 'owner' | 'admin' | 'staff' | 'instructor' | 'driver';
/** QR guests (enterprise_guest_sessions). */
export type EnterpriseGuestRole = 'student' | 'guest_rider' | 'customer';
export type EnterpriseRole = EnterpriseMemberRole | EnterpriseGuestRole;

export interface OrganizationBranding {
  logo_url?: string | null;
  accent_color?: string | null;
  welcome_message?: string | null;
}

/** The public face of an organisation: what verify_enterprise_token returns. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  tier: EnterpriseTier;
  branding: OrganizationBranding;
}

/** A workspace mounted on this phone. */
export interface EnterpriseSession {
  org: Organization;
  kind: 'member' | 'guest';
  role: EnterpriseRole;
  callsign: string | null;
  /** Guests only: when access ends (ISO). */
  expiresAt: string | null;
  /** Guests only: the token, to re-check the session. */
  token: string | null;
  mountedAt: string;
  /** Demo mode's sample workspace: shown, never stored, can't be signed out of. */
  demo?: boolean;
}

/** What a scanned QR or deep link carries. */
export interface GuestSessionPayload {
  /** Organisation slug or id, if the code names one (a hint; the server decides). */
  org: string | null;
  /** Guest session token or invite code. */
  token: string;
  /** Role hint printed on the code (the server decides). */
  role: EnterpriseRole | null;
}

export const ENTERPRISE_TIERS: EnterpriseTier[] = ['academy', 'showroom', 'workshop', 'touring', 'track_pro', 'billion'];
export const ENTERPRISE_ROLES: EnterpriseRole[] = ['owner', 'admin', 'staff', 'instructor', 'driver', 'student', 'guest_rider', 'customer'];

// ---- Packages -------------------------------------------------------------------

export interface EnterpriseTierFeature {
  title: string;
  detail: string;
}

export interface EnterpriseTierInfo {
  id: EnterpriseTier;
  /** Package name: translated, except the words Blacktop and TrackPack. */
  name: string;
  /** Who it's for. */
  target: string;
  tagline: string;
  features: EnterpriseTierFeature[];
}

/**
 * The five Blacktop Enterprise packages. Built on demand so the text is in the
 * app's language (tr() is ready before anything calls this).
 */
export function enterpriseTiers(): EnterpriseTierInfo[] {
  return [
    {
      id: 'academy',
      name: tr("Blacktop Academy"),
      target: tr("CBT & DAS motorcycle training schools, RoSPA/IAM advanced rider groups, driving academies."),
      tagline: tr("Real-time instructor radar, god-mode comms, and student debriefs."),
      features: [
        { title: tr("Instructor God-Mode Comms"), detail: tr("Priority one-way voice override that cuts through student chatter or navigation.") },
        { title: tr("Tether Radar"), detail: tr("Live distance and bearing alert when a student falls back (over 150 m amber, route divergence red).") },
        { title: tr("Mod 1 Speed Trap Mode"), detail: tr("Virtual timing box checking the 50 km/h emergency stop and hazard avoidance, with an instant audio call (\"PASS\" / \"TOO SLOW\").") },
        { title: tr("Student Report Cards"), detail: tr("Branded post-session report (braking firmness, speed compliance, lean angles, route recap) emailed to the student.") },
        { title: tr("1-Tap Student Join"), detail: tr("8-hour guest QR code: students scan in with no account and no payment.") },
      ],
    },
    {
      id: 'showroom',
      name: tr("Blacktop Showroom"),
      target: tr("Motorcycle dealerships, car showrooms, brand demo fleets."),
      tagline: tr("Turn test rides into closed sales with live fleet telemetry and customer hype sheets."),
      features: [
        { title: tr("1-Tap Test-Ride Checkout"), detail: tr("Quick guest QR pass with an auto-expiry timer (45 min / 2 h).") },
        { title: tr("Curated Test Route Guidance"), detail: tr("Turn-by-turn over the dealer's best route, showing off the vehicle's strengths.") },
        { title: tr("Live Geofencing & Fleet Radar"), detail: tr("Instant console alerts if a customer leaves the zone or goes past safety limits.") },
        { title: tr("Post-Ride Hype Sheet"), detail: tr("Customer brag card with peak lean, acceleration, route map and dealership branding, for easy sharing and lead capture.") },
        { title: tr("Fleet Health & Mileage Log"), detail: tr("Automatic mileage tracking and battery and service scheduling.") },
      ],
    },
    {
      id: 'workshop',
      name: tr("Blacktop Workshop"),
      target: tr("Motorcycle and car workshops, dealership service departments, tyre and MOT centres, mobile mechanics."),
      tagline: tr("Service tickets by QR, live job updates, and service history written straight to the rider's garage."),
      features: [
        { title: tr("Scan-In Service Tickets"), detail: tr("The rider says what needs doing and scans the shop's QR code: a ticket opens for both sides, linked to that bike in their garage.") },
        { title: tr("Photo Quotes & Approvals"), detail: tr("Found more work? Send photos and a price; the rider approves or declines in the app, and the answer is kept on the ticket.") },
        { title: tr("Live Job Status & Alerts"), detail: tr("Checked in, awaiting approval, in progress, ready: the rider follows along and gets a notification and an email the moment it's done.") },
        { title: tr("Automatic Service History"), detail: tr("The work the shop records goes straight into the rider's maintenance log and logbook, stamped by the shop for a trusted service history.") },
        { title: tr("Service Reminders & Rebooking"), detail: tr("The shop sets the next service by date or mileage; Blacktop reminds the rider and rebooks in one tap.") },
      ],
    },
    {
      id: 'touring',
      name: tr("Blacktop Touring"),
      target: tr("Guided tour operators, motorcycle expedition organisers, rally organisers (Alps, Pyrenees, NC500)."),
      tagline: tr("Bulletproof convoy management for multi-day expeditions in zero-signal zones."),
      features: [
        { title: tr("Single-QR 7-Day Tour Pack"), detail: tr("One scan before departure downloads every waypoint, GPX corridor, offline map, hotel pin and fuel stop.") },
        { title: tr("Tour Leader Master Broadcast"), detail: tr("Broadcast audio to every rider across split sub-groups.") },
        { title: tr("Sweep & Tail-End-Charlie Radar"), detail: tr("Live bearing and distance to the tail rider, so guides never leave anyone stranded on a mountain pass.") },
        { title: tr("1-Tap Guide Ping"), detail: tr("A lost or distressed rider presses one glove-friendly button to send their position to the sweep and the leader.") },
      ],
    },
    {
      id: 'track_pro',
      // A product name like Blacktop: one word, not translated.
      name: 'TrackPack',
      target: tr("Race organisers, racers, pit crews and spectators: from club race meetings and track days to paddock coaching."),
      tagline: tr("Run an entire race on one platform: timing, race control, the pit wall and live coverage for spectators."),
      features: [
        { title: tr("Race Organiser Console"), detail: tr("Entry lists, grid, sessions, the start and results in one place: a whole race meeting can be run on TrackPack.") },
        { title: tr("Live Pit-Wall Telemetry"), detail: tr("Real-time sector times, live delta, lean angle and friction-circle G-force streamed to pit crew screens.") },
        { title: tr("Cockpit Pit Board Calls"), detail: tr("Audio calls (\"Box box\", \"Push now\", \"Delta -0.4\") spoken straight into the rider's helmet.") },
        { title: tr("Virtual Race Control & Flagging"), detail: tr("Instant digital yellow, red and chequered flags on every active cockpit.") },
        { title: tr("Spectator Live Timing"), detail: tr("Live positions on the circuit map, lap times and the running order on any spectator's phone.") },
        { title: tr("Team Ghost & Sector Analysis"), detail: tr("Compare telemetry against teammates or benchmark laps.") },
      ],
    },
    {
      id: 'billion',
      name: tr("Blacktop Billion"),
      target: tr("Premier multi-discipline teams, factory racing divisions and global mobility brands."),
      tagline: tr("The complete, unrestricted Blacktop master suite."),
      features: [
        { title: tr("Every module"), detail: tr("Unrestricted access to every enterprise module (TrackPack, Showroom, Workshop, Academy and Touring).") },
        { title: tr("Custom branding"), detail: tr("Custom map accents, tailored splash screens and bespoke audio chimes.") },
        { title: tr("Unlimited seats"), detail: tr("Unlimited staff seats, fleet vehicles and guest QR codes.") },
        { title: tr("Priority comms relay"), detail: tr("Dedicated high-priority TURN relay allocation for comms.") },
      ],
    },
  ];
}
