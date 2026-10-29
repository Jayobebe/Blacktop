/**
 * What's new: a short card on Home after an update, the same lines kept in
 * Blacktop Console's notifications, and every release listed on `/whats-new`
 * (Settings, under Burn). Until that list has been opened since the newest
 * release, Home's Settings button glows, and so does What's new in Settings.
 *
 * Releases are written here by hand, newest first, each with its version (the
 * next one up), a few short lines each. The list goes back to Blacktop's first
 * ride (December 2025), worked out from the project's history; nothing about
 * payments goes in (the store build carries none). Lines
 * (every line is translated, so keep them short). A release with nothing worth
 * telling riders gets no entry. A rider who set up after the newest release
 * sees neither the card nor the glow (they get the tour).
 *
 * Kept on the phone (`blacktop_whats_new`, left out of backups): the newest
 * release whose card was shown, and the newest whose list was opened.
 */
import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';

export type ReleaseIcon =
  | 'fuel' | 'medical' | 'calendar' | 'storage' | 'console' | 'trip' | 'route' | 'pixels' | 'shape' | 'back' | 'search' | 'bell'
  | 'ride' | 'convoy' | 'voice' | 'map' | 'rescue' | 'garage' | 'cards' | 'globe' | 'arcade' | 'crew' | 'radio' | 'track'
  | 'language' | 'alarm' | 'sound' | 'privacy' | 'phone' | 'tour' | 'speed' | 'parking' | 'hazard' | 'enterprise' | 'backup'
  | 'video' | 'lean' | 'gauge' | 'sticker' | 'tips' | 'battery' | 'eye';

export interface ReleaseLine {
  icon: ReleaseIcon;
  text: string;
  /** Where its link goes, and what the link says. */
  to?: string;
  link?: string;
}
export interface Release {
  /** The day it went out, YYYY-MM-DD, with a letter for a second release that day. */
  id: string;
  /** Its version number, as shown on the list ("1.22"). */
  version: string;
  lines: ReleaseLine[];
}

/** Newest first. Read through a function so the lines are in the rider's language. */
export function releases(): Release[] {
  return [
    {
      id: '2026-10-29f',
      version: '1.35',
      lines: [
        { icon: 'map', text: tr("Miss a turn and the map reroutes at the junction, not halfway down the wrong road, and it notices if you turn round.") },
        { icon: 'map', text: tr("New routes carry on the way you're going instead of starting with a U-turn.") },
      ],
    },
    {
      id: '2026-10-29e',
      version: '1.34',
      lines: [
        { icon: 'map', text: tr("Satellite view has everything the normal map has: roads in their colours, railways, names, places, pins, rain radar and wind, and the water wears its BLACKTOP wordmark.") },
        { icon: 'map', text: tr("The map's credits glide along when they don't fit, instead of running off the screen.") },
      ],
    },
    {
      id: '2026-10-29d',
      version: '1.33',
      lines: [
        { icon: 'language', text: tr("Notifications arrive in your language too: rescue calls, crew results, weather warnings and the rest.") },
        { icon: 'map', text: tr("The speed limit sign now shows on slower roads and in towns too, and it checks the road when you turn onto a new one.") },
      ],
    },
    {
      id: '2026-10-29c',
      version: '1.32',
      lines: [
        { icon: 'map', text: tr("Search and routes keep going when a map server is down or slow: Blacktop asks the next one, and the quickest answers first.") },
        { icon: 'language', text: tr("Every weekly and monthly crew challenge has its name in your language now.") },
      ],
    },
    {
      id: '2026-10-29b',
      version: '1.31',
      lines: [
        { icon: 'track', text: tr("Over 2,000 kart tracks around the world in Track Day's library, laps and pit lanes ready to time.") },
        { icon: 'map', text: tr("The letter on your map pin is black or white, whichever stands out on your accent.") },
        { icon: 'language', text: tr("Blacktop World and Blacktop Console are in your language now, and icons on the Console take your second colour.") },
      ],
    },
    {
      id: '2026-10-29',
      version: '1.30',
      lines: [
        { icon: 'video', text: tr("3D flyover videos are made frame by frame: a smooth 30 a second in full HD, with the roads' colours steady.") },
        { icon: 'map', text: tr("The flyover's hills only show on rides that have them, and a car's flyover no longer shows lean.") },
        { icon: 'route', text: tr("Your pin and trail keep to the roads you rode in the flyover, however fast the video.") },
        { icon: 'pixels', text: tr("Two new accent colours: Pearl, all white, and Eclipse, black with a glowing white edge.") },
        { icon: 'tips', text: tr("Glows sit inside their buttons now, so none are cut off, and the demo shows off the Garage and History glows.") },
      ],
    },
    {
      id: '2026-10-28c',
      version: '1.29',
      lines: [
        { icon: 'battery', text: tr("Home runs smoother and easier on the battery, and holds still while a ride's receipt prints, then picks back up.") },
        { icon: 'map', text: tr("Looking round a place on the map, drag it away to let go, or press Back as before.") },
        { icon: 'cards', text: tr("Your own card can be picked back up from a hot-spot, and your spare copies count up straight away.") },
        { icon: 'lean', text: tr("Stats shows your max lean when lean is switched on.") },
      ],
    },
    {
      id: '2026-10-28b',
      version: '1.28',
      lines: [
        { icon: 'tips', text: tr("After a ride, its receipt prints out of a till printer, then whizzes into History. Tap it any time to stop and read it.") },
        { icon: 'tips', text: tr("History glows while a ride hasn't been opened, and the Garage while a service is due. Clear all on the Console clears every glow.") },
        { icon: 'map', text: tr("In someone else's convoy, riders and passengers can search the map and ask the leader to go somewhere. The leader picks twisty or direct.") },
        { icon: 'track', text: tr("Track Day's library has kart tracks now, laps and pit lanes ready to time, Teesside Autodrome among them.") },
      ],
    },
    {
      id: '2026-10-28',
      version: '1.27',
      lines: [
        { icon: 'map', text: tr("Your pin keeps to the road: it follows the route or the road you're on, and holds still when you stop.") },
        { icon: 'map', text: tr("Speed limits come from the router now, so they still show when the map server is down, in your own units.") },
        { icon: 'map', text: tr("The + and − buttons zoom without losing you, and coming back to the app while navigating picks straight back up.") },
        { icon: 'map', text: tr("Search finds a place by its name wherever it is, not only places near you.") },
        { icon: 'map', text: tr("Every alarm button is held for a second to arm, like rescue. On the map the R and the siren have swapped places.") },
      ],
    },
    {
      id: '2026-10-27b',
      version: '1.26',
      lines: [
        { icon: 'radio', text: tr("Home's header is a tuner now: sunset, a year ago today, this year's distance, your bests, cheap fuel and riders near you. Drag it, tap one, hold it to choose.") },
        { icon: 'radio', text: tr("Blacktop Radio is a head unit: a band to tune with static between stations, six presets (hold one to save), and what's playing on live stations.") },
        { icon: 'console', text: tr("Crash check, the alarm and rescue live on the Console now, a swipe from Home.") },
        { icon: 'tips', text: tr("Wrapped: your week, month, year or all time as slides, with a card to share. Stats glows when a new one is ready."), to: '/stats', link: tr("Open Stats") },
      ],
    },
    {
      id: '2026-10-27',
      version: '1.25',
      lines: [
        { icon: 'map', text: tr("Night map: after sunset the map dims, so a bright screen doesn't spoil your night vision. Pick burn orange instead, or turn it off, in Settings."), to: '/settings?section=navigation', link: tr("Open Settings") },
        { icon: 'map', text: tr("Map looks: draw the map in infrared, night vision, CRT or noir. The night map darkens whichever you pick."), to: '/settings?section=navigation', link: tr("Open Settings") },
        { icon: 'video', text: tr("The 3D flyover has the same looks, in the video you download too. It starts on your map's look.") },
        { icon: 'route', text: tr("Wind warnings: strong side gusts on your route show on the map, on a place's card and as you ride up to them. The wind can go on the map as arrows too."), to: '/settings?section=navigation', link: tr("Open Settings") },
      ],
    },
    {
      id: '2026-10-26',
      version: '1.24',
      lines: [
        { icon: 'map', text: tr("The map keeps you low on the screen, just above your speed, so you see more of the road ahead, in landscape too.") },
        { icon: 'speed', text: tr("At amber and red speeds the map pulls out a little. Zoom to keep your own view; recentre hands it back.") },
        { icon: 'map', text: tr("Your pin and the map glide smoothly between GPS fixes, and in 3D names and pins stay above the buildings.") },
        { icon: 'speed', text: tr("The road's speed limit shows on your speed, and your speed turns amber over it and red at 10 % over. Your own set points are in Settings."), to: '/settings?section=safety', link: tr("Open Settings") },
        { icon: 'fuel', text: tr("Pausing at a fuel station just asks today's price there, for everyone's map. The fuel log has left the logbook.") },
      ],
    },
    {
      id: '2026-10-21d',
      version: '1.23',
      lines: [
        { icon: 'rescue', text: tr("Crash detection is now Crash check, marked as a beta, with plain words on what it can and can't do."), to: '/settings?section=safety', link: tr("Open Settings") },
        { icon: 'route', text: tr("Save a route opens its map even with no signal.") },
      ],
    },
    {
      id: '2026-10-21c',
      version: '1.22',
      lines: [
        { icon: 'hazard', text: tr("Hazards near you on the Console open the map on them, listed like a quick search. Tap Hazards to go back.") },
        { icon: 'fuel', text: tr("Fuel searches find independent stations too, not only the big brands.") },
        { icon: 'pixels', text: tr("Loading is drawn in pixels now, and the card you swipe to comes out of them.") },
        { icon: 'back', text: tr("Crew boards and convoys opened from the Console go straight back to it.") },
      ],
    },
    {
      id: '2026-10-21b',
      version: '1.21',
      lines: [
        { icon: 'fuel', text: tr("The logbook keeps a ledger: fill-ups, costs and parts. Pause a ride at the pump and it asks what you put in.") },
        { icon: 'fuel', text: tr("Fuel prices on the map, from riders who share what they paid. Opt in when you fill up.") },
        { icon: 'medical', text: tr("Medical ID: what someone helping you after a crash should know, on the crash screens."), to: '/settings?section=safety', link: tr("Set it up") },
        { icon: 'storage', text: tr("Storage: see what's using space on your phone and clear it."), to: '/storage', link: tr("Open Storage") },
        { icon: 'pixels', text: tr("Swipe between Home, Console and Enterprise and the page breaks into pixels.") },
        { icon: 'shape', text: tr("Every button is the same shape, and selectors slide to your choice.") },
        { icon: 'back', text: tr("Back from anything opened on the Console takes you back to the Console.") },
      ],
    },
    {
      id: '2026-10-21',
      version: '1.20',
      lines: [
        { icon: 'calendar', text: tr("Blacktop Calendar: your rides, plans, reminders, services and crew plans, with a clock and stopwatch."), to: '/calendar', link: tr("Open the calendar") },
        { icon: 'trip', text: tr("Trip receipts list every leg: its date, distance, time and speeds, and the best of the trip.") },
        { icon: 'bell', text: tr("Up next on the Console: what's coming in the next two weeks, with the weather.") },
      ],
    },
    {
      id: '2026-10-20',
      version: '1.19',
      lines: [
        { icon: 'console', text: tr("Blacktop Console, to the left of Home: live cards, quick actions, search and notifications.") },
        { icon: 'route', text: tr("Save a route with as many stops as you like, and ride it in legs over several days."), to: '/routes/new', link: tr("Plan a route") },
        { icon: 'search', text: tr("Twisty or Direct: pick how to get anywhere you choose on the map.") },
      ],
    },
    {
      id: '2026-10-19',
      version: '1.18',
      lines: [
        { icon: 'tour', text: tr("The demo tour is narrated, with real roads, real detours and a rescue."), to: '/demo', link: tr("Watch the tour") },
        { icon: 'map', text: tr("Places you pick on the map fly in with a new camera and show their opening hours and how dear they are.") },
        { icon: 'rescue', text: tr("A rescue R on the map, held for a second to call for help from wherever you are.") },
        { icon: 'convoy', text: tr("Your convoy's QR code is on the ride screen, so anyone can join mid-ride.") },
      ],
    },
    {
      id: '2026-10-17',
      version: '1.17',
      lines: [
        { icon: 'tour', text: tr("The demo tour is one short film in ten chapters.") },
        { icon: 'tips', text: tr("First-time tips on every screen.") },
        { icon: 'phone', text: tr("Mid-ride, the screen holds the way it's turned, so leaning can't flip it.") },
      ],
    },
    {
      id: '2026-10-16',
      version: '1.16',
      lines: [
        { icon: 'voice', text: tr("Voice chat hears talking, not wind and engines, and goes to your intercom by itself.") },
        { icon: 'map', text: tr("A mini map on the ride screen: tap the G meter to turn it over.") },
        { icon: 'parking', text: tr("Save where you parked after a ride, floor and bay included, and walk back to it.") },
        { icon: 'eye', text: tr("Your crew can spectate a convoy live on the map.") },
      ],
    },
    {
      id: '2026-10-13',
      version: '1.15',
      lines: [
        { icon: 'phone', text: tr("Blacktop runs as an Android app.") },
        { icon: 'lean', text: tr("Lean reads true in portrait, whatever angle your phone is mounted at.") },
        { icon: 'speed', text: tr("Every distance and speed is in your own units, Mecha-Nick included.") },
      ],
    },
    {
      id: '2026-10-12',
      version: '1.14',
      lines: [
        { icon: 'speed', text: tr("Live speed ignores GPS spikes: no more bicycles at motorway speeds.") },
        { icon: 'ride', text: tr("On the move? Blacktop can ask to start a ride when you set off with the app open.") },
        { icon: 'convoy', text: tr("An unlocked solo ride becomes a convoy the moment your crew joins.") },
      ],
    },
    {
      id: '2026-10-08',
      version: '1.13',
      lines: [
        { icon: 'rescue', text: tr("Crash detection catches impacts at speed, and asks if you're okay before sending anything.") },
        { icon: 'backup', text: tr("Back up your phone to a file, and make a recovery code to get your account back on a new one."), to: '/settings', link: tr("Open Settings") },
        { icon: 'cards', text: tr("The vault: cards that lift out and turn over, and finishes that catch the light by tier.") },
      ],
    },
    {
      id: '2026-10-07',
      version: '1.12',
      lines: [
        { icon: 'cards', text: tr("Redline cards and the Wildcard dog tag in SwitchBack.") },
        { icon: 'cards', text: tr("The Blacktop Marketplace: sell cards on a coin flip, or trade five up.") },
        { icon: 'pixels', text: tr("Pixel-art cards: your own vehicle's photo redrawn in the SwitchBack look.") },
      ],
    },
    {
      id: '2026-10-06',
      version: '1.11',
      lines: [
        { icon: 'sticker', text: tr("Stickers: every card in your vault has one to stick on Home.") },
        { icon: 'pixels', text: tr("Pages change in pixels.") },
        { icon: 'globe', text: tr("Blacktop World's globe glows where riders are, country by country.") },
      ],
    },
    {
      id: '2026-10-05',
      version: '1.10',
      lines: [
        { icon: 'cards', text: tr("SwitchBack: a card battler in the Arcade, with real cars and bikes and dog tags."), to: '/arcade/switchback', link: tr("Play SwitchBack") },
        { icon: 'radio', text: tr("Live radio stations in Blacktop Radio.") },
        { icon: 'phone', text: tr("Every screen fits every phone: notches, home bars, landscape and small screens.") },
      ],
    },
    {
      id: '2026-10-01',
      version: '1.9',
      lines: [
        { icon: 'crew', text: tr("Be in up to four crews at once.") },
        { icon: 'track', text: tr("Track Day: pit lane timing, track records and dog tags for the riders you beat.") },
        { icon: 'rescue', text: tr("A rescue drill, and a text to your emergency contact from the crash screen.") },
        { icon: 'map', text: tr("Share your ETA, or hand the route to Google Maps, Apple Maps or Waze.") },
      ],
    },
    {
      id: '2026-09-30',
      version: '1.8',
      lines: [
        { icon: 'sound', text: tr("App sounds: clicks, switches and dialogs, with a switch to turn them off.") },
        { icon: 'battery', text: tr("Thermal mode: black and white, no animations, for long hot rides.") },
        { icon: 'privacy', text: tr("Public Road Privacy: keep your top speed and peak G to yourself.") },
      ],
    },
    {
      id: '2026-09-29',
      version: '1.7',
      lines: [
        { icon: 'alarm', text: tr("Anti-theft alarm: a pattern lock and a siren if your parked vehicle is moved.") },
        { icon: 'voice', text: tr("Everything Blacktop says sounds like a fighter-pilot radio, with an optional pilot voice.") },
        { icon: 'gauge', text: tr("A friction-circle G meter, everywhere G is shown.") },
        { icon: 'enterprise', text: tr("Blacktop Enterprise: workspaces for schools, dealers, tour operators and race teams.") },
      ],
    },
    {
      id: '2026-09-28',
      version: '1.6',
      lines: [
        { icon: 'hazard', text: tr("Report hazards on the map, and hear about them before you reach them.") },
        { icon: 'track', text: tr("A circuit library of 173 tracks for Track Day, or ride your own lap.") },
        { icon: 'language', text: tr("Blacktop speaks 18 languages.") },
      ],
    },
    {
      id: '2026-09-27',
      version: '1.5',
      lines: [
        { icon: 'ride', text: tr("Blacktop shapes itself to you: motorcycles, cars, bicycles, e-bikes and e-scooters.") },
        { icon: 'map', text: tr("Turn-by-turn directions on the Blacktop map.") },
        { icon: 'convoy', text: tr("Nearby riders, passenger mode and a convoy status bar with regroup.") },
        { icon: 'garage', text: tr("A logbook for every vehicle, handed over with it when it's sold.") },
      ],
    },
    {
      id: '2026-09-06',
      version: '1.4',
      lines: [
        { icon: 'radio', text: tr("Blacktop Radio: stations from your own music, a tap away anywhere in the app.") },
      ],
    },
    {
      id: '2026-09-04',
      version: '1.3',
      lines: [
        { icon: 'cards', text: tr("Drop your card on the map for other riders to pick up.") },
        { icon: 'ride', text: tr("Badges for how you ride, kept in a wallet on your Stats.") },
        { icon: 'arcade', text: tr("Gridlock: a light-trail game in the Arcade, played on real streets.") },
      ],
    },
    {
      id: '2026-09-03',
      version: '1.2',
      lines: [
        { icon: 'video', text: tr("Relive any ride as a 3D flyover, and save it as a video.") },
        { icon: 'route', text: tr("Twisty routes and round-trip loops, and offline maps for where there's no signal.") },
        { icon: 'map', text: tr("Weather on your route, with a dry way round when rain's coming.") },
      ],
    },
    {
      id: '2026-09-02',
      version: '1.1',
      lines: [
        { icon: 'crew', text: tr("Crews: leaderboards, weekly challenges and your crew's convoys to join.") },
        { icon: 'map', text: tr("Speed camera warnings on the map.") },
      ],
    },
    {
      id: '2026-06-27',
      version: '1.0',
      lines: [
        { icon: 'globe', text: tr("Blacktop World: a globe of riders, your cards and the Arcade.") },
        { icon: 'arcade', text: tr("The Arcade: Hit Heavy and Petrol Head.") },
        { icon: 'map', text: tr("Stops on the way, and saved places on the map.") },
      ],
    },
    {
      id: '2026-06-25',
      version: '0.9',
      lines: [
        { icon: 'gauge', text: tr("Live G-force, and a receipt for every ride in History.") },
        { icon: 'globe', text: tr("A globe on Home that opens the map.") },
        { icon: 'cards', text: tr("Scan other riders' vehicle cards to collect them.") },
      ],
    },
    {
      id: '2026-06-24',
      version: '0.8',
      lines: [
        { icon: 'map', text: tr("The Blacktop map: search, routes and a rain radar, with your convoy on it.") },
        { icon: 'privacy', text: tr("Burn deletes your account and everything in it, for good.") },
      ],
    },
    {
      id: '2026-06-20',
      version: '0.7',
      lines: [
        { icon: 'rescue', text: tr("Crash detection: a hard impact and a stop asks if you're okay, then calls for help.") },
      ],
    },
    {
      id: '2026-06-18',
      version: '0.6',
      lines: [
        { icon: 'garage', text: tr("The Garage, with Mecha-Nick: your vehicles, their stats and maintenance.") },
        { icon: 'cards', text: tr("A trading card for each of your vehicles, built from how you ride it.") },
      ],
    },
    {
      id: '2026-06-17',
      version: '0.5',
      lines: [
        { icon: 'convoy', text: tr("Discord: convoys and rescue calls posted to your server.") },
      ],
    },
    {
      id: '2025-12-26',
      version: '0.4',
      lines: [
        { icon: 'video', text: tr("A live overlay video of your ride: speed, lean and G, to lay over your footage.") },
      ],
    },
    {
      id: '2025-12-22',
      version: '0.3',
      lines: [
        { icon: 'lean', text: tr("Lean angle, live on the ride screen.") },
        { icon: 'ride', text: tr("Solo rides get a lobby of their own.") },
      ],
    },
    {
      id: '2025-12-17',
      version: '0.2',
      lines: [
        { icon: 'rescue', text: tr("Rescue calls to your convoy.") },
        { icon: 'route', text: tr("Waypoints for the whole convoy, set by the leader.") },
        { icon: 'shape', text: tr("Pick your accent colour.") },
      ],
    },
    {
      id: '2025-12-16',
      version: '0.1',
      lines: [
        { icon: 'ride', text: tr("Blacktop's first ride: tracking, history and stats.") },
        { icon: 'convoy', text: tr("Convoys: ride together with live positions and voice chat.") },
      ],
    },
  ];
}

const KEY = 'blacktop_whats_new';
interface Kept {
  /** Newest release whose card has been shown. */
  seen?: string;
  /** Newest release whose list has been opened. */
  opened?: string;
}

function read(): Kept {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' ? (v as Kept) : {};
  } catch {
    return {};
  }
}
let kept: Kept = typeof window !== 'undefined' ? read() : {};
const listeners = new Set<() => void>();
function write(next: Kept) {
  kept = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}

export const latestRelease = () => releases()[0]?.id ?? '';

/** A rider who set up after the newest release has nothing to catch up on. */
export function settleForNewRider(createdAt: string | undefined) {
  const latest = latestRelease();
  if (!latest || kept.seen || kept.opened || !createdAt) return;
  if (createdAt.slice(0, 10) >= latest.slice(0, 10)) write({ seen: latest, opened: latest });
}
export function markWhatsNewSeen() {
  const latest = latestRelease();
  if (kept.seen !== latest) write({ ...kept, seen: latest });
}
export function markWhatsNewOpened() {
  const latest = latestRelease();
  if (kept.seen !== latest || kept.opened !== latest) write({ seen: latest, opened: latest });
}

export function useWhatsNew(): { card: boolean; unread: boolean } {
  const k = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => kept,
    () => kept,
  );
  const latest = latestRelease();
  return { card: !!latest && k.seen !== latest, unread: !!latest && k.opened !== latest };
}

/** "21 October 2026" from a release id. */
export function releaseDate(id: string): string {
  const d = new Date(`${id.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "December 2025" from a release id. */
export function releaseMonth(id: string): string {
  const d = new Date(`${id.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString(document.documentElement.lang || undefined, { month: 'long', year: 'numeric' });
}
