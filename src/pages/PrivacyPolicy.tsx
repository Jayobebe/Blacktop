import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const { hasProfile } = useProfile();
  const handleBack = () => navigate(hasProfile ? '/settings' : '/');

  return (
    <div className="min-h-dvh bg-background safe-top safe-bottom">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 p-4 max-w-2xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="touch-target"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent" />
            <h1 className="text-lg font-semibold">Privacy Policy</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">
        <p className="text-xs text-muted-foreground">
          Last updated: September 4, 2026 · Maintained by the Blacktop team.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">The short version</h2>
          <p className="text-muted-foreground">
            Blacktop is built privacy-first. Your rides, stats, garage, and history
            live on your device. We do not run analytics, advertising, profiling,
            or behavioral tracking. We do not sell or share your data.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">What we store on your device</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>Your chosen display name</li>
            <li>Your ride history (distance, speed, route, photos)</li>
            <li>Your garage, settings, and preferences</li>
          </ul>
          <p className="text-muted-foreground">
            Tap <span className="text-foreground font-medium">Burn All Data</span> in
            Settings at any time to permanently erase everything.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">What touches our server (temporarily)</h2>
          <p className="text-muted-foreground">
            When you join a convoy, the following ephemeral data is sent to our
            backend purely so other riders can see you live:
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>An anonymous identifier (no email, no phone, no real name required)</li>
            <li>Your current GPS coordinates and speed</li>
            <li>Convoy chat messages and shared waypoints</li>
          </ul>
          <p className="text-muted-foreground">
            The moment a ride ends, a server-side trigger automatically erases all
            of this — coordinates, speed, distance, messages, waypoints — without
            human intervention. The only persistent server-side metric is the total
            number of profiles created. No per-user history is retained.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Voice communication</h2>
          <p className="text-muted-foreground">
            Convoy voice uses peer-to-peer WebRTC. Audio is never recorded, never
            stored, and never passes through a server we can listen to. When the
            convoy ends, the connection is gone.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Blacktop World (opt-in)</h2>
          <p className="text-muted-foreground">
            Blacktop World is the crew hub of the app — a spinning globe with landmarks for crew
            convoys, crew leaderboards, crew QR joining, your card collection and the arcade,
            plus an anonymous glow showing where riders are active. It is{' '}
            <span className="text-foreground">off by default</span>, fully voluntary, and can be
            toggled on or off at any time in Settings. No features outside of Blacktop World
            require it.
          </p>

          <p className="text-muted-foreground">
            <span className="text-foreground">What gets shared when you enable it and start a ride:</span> your
            precise GPS coordinates and a timestamp are written to our server every 30 seconds
            while you are actively riding. This data powers the live rider count and the
            country-level glow on the globe — other riders see how many people are riding globally
            and which countries are active, not your individual pin or identity.
            No display name, speed, route history, or device identifier is included.
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">When it is removed:</span> your location record is
            deleted from our servers the moment you end your ride. If your ride is interrupted
            (app crash, phone dies, signal lost) the record expires automatically within 10 minutes
            based on a freshness check — it is never retained beyond your active session.
            Disabling Blacktop World in Settings stops any further writes immediately.
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">Collector cards:</span> opting in also unlocks the
            ability to flip your custom vehicle stats card to reveal a shareable QR code. The QR
            contains your display name, vehicle info, tier, and ride stats — nothing else. Other
            riders can scan it to add your card to their local{' '}
            <span className="text-foreground">Card Collection</span>. Collected cards are stored
            entirely on the scanning rider's device and are never uploaded anywhere. Stats on a
            collected card are frozen at the moment of scan and only update if the owner
            explicitly shares an updated QR and the collector chooses to rescan it. You can
            delete any card from your collection at any time, and the Burn Button wipes the
            entire collection instantly.
          </p>
          <p className="text-muted-foreground">
            Public event markers on the globe (storms, wildfires, volcanoes, floods) come from
            NASA EONET open data feeds and contain no personal information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Card drops & collections</h2>
          <p className="text-muted-foreground">
            Card drops are part of <span className="text-foreground">Blacktop World</span> and are
            only active while you have opted into it in Settings. With Blacktop
            World off, no drops are listed, planted, collected or synced. When
            you plant a collector card on the map, the drop is stored on
            our server so other riders nearby can find and collect it. Unlike
            convoy data, a drop is <span className="text-foreground">persistent</span> — it
            stays live until you remove it. Each drop contains:
          </p>

          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>Your display name and vehicle info (name, make/model, tier)</li>
            <li>Your ride stats as they were at the moment of the drop</li>
            <li>The GPS coordinates where you planted the card</li>
            <li>Your card photo, if the card has one</li>
          </ul>
          <p className="text-muted-foreground">
            When another rider collects one of your drops, the collection is
            recorded server-side (with the collector's display name) so you can
            be credited a badge-point kickback, and so area "card king" rankings
            can be computed. Cards you collect from others are stored on your
            device only. Deleting a drop (or burning your data) removes your
            card from the map permanently.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Card challenges (time attack)</h2>
          <p className="text-muted-foreground">
            Card challenges are also part of <span className="text-foreground">Blacktop World</span> and
            only work while it is switched on. If you attach a challenge to a
            card you drop, you ready up, a five-second countdown runs, and the
            route you then ride is recorded. Five seconds are deducted from your
            recorded time to account for stopping to set the finish line. The
            challenge route, its distance, the time to beat and the finish-line
            coordinates are stored on our server alongside the drop, and are
            visible to any rider who can see that card.
          </p>
          <p className="text-muted-foreground">
            When you take on someone else's challenge, your position is compared
            against the stored route while the run is live so we can detect the
            finish line and off-route deviations. Only the outcome (your display
            name, your time and whether you won, lost or were voided) is stored
            server-side; the raw track of your attempt stays on your device as a
            normal ride in your history. Removing the drop, or burning your
            data, removes the challenge and its attempts.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Crews & challenges</h2>
          <p className="text-muted-foreground">
            Joining a crew stores your display name alongside the crew's code on
            our server so crew members can see each other. If you take part in
            weekly crew challenges, summary ride stats (weekly distance, top
            speed, number of night rides, longest single ride) are uploaded
            under your display name to power the crew leaderboard. These
            persist from week to week. Leaving a crew removes your membership
            and scores. Badges themselves are banked locally on your device.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Derez Legacy (multiplayer arcade)</h2>
          <p className="text-muted-foreground">
            When you create or join a Derez Legacy lobby, your display name and
            assigned accent colour are stored in the lobby on our server.
            During a round your GPS position is broadcast at high frequency to
            the other players so their screens can draw your light trail — this
            trail data is ephemeral and is never written to the database. Lobby
            rows are removed when the lobby is closed. Win tallies are stored
            locally on your device.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Stats overlay video</h2>
          <p className="text-muted-foreground">
            During each ride, the app draws your live stats (speed, distance,
            lean angle) onto a transparent video file generated locally on your
            device. It does not use your camera, microphone, or any cloud
            service — it's a file you can later layer over your own action-cam
            footage in a video editor. It lives in local storage and is erased
            by the Burn Button along with everything else.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Permissions we ask for</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li><span className="text-foreground">Location</span> — required, used only during active rides for tracking and convoy sync</li>
            <li><span className="text-foreground">Microphone</span> — optional, used only for live voice chat in convoys</li>
            <li><span className="text-foreground">Motion sensors</span> — optional, for lean angle visualization and crash detection</li>
            <li><span className="text-foreground">Photos / Files</span> — optional, only when you choose to attach a photo to a ride in your history. Photos stay on your device.</li>
            <li><span className="text-foreground">Camera</span> — optional, used only to scan QR codes for sharing and joining convoys. Images are processed locally on-device and never stored or uploaded.</li>
          </ul>
          <p className="text-muted-foreground">
            We never collect location in the background outside of an active ride.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Third parties</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li><span className="text-foreground">Lovable Cloud</span> — hosts the realtime convoy backend</li>
            <li><span className="text-foreground">OpenStreetMap / Nominatim / Overpass</span> — used for location search</li>
            <li><span className="text-foreground">Discord</span> — only if you opt in by adding a webhook in your account</li>
            <li><span className="text-foreground">Nimiq Pay</span> — only if you send a tip; payments happen in your own wallet and we never see your keys</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Your rights</h2>
          <p className="text-muted-foreground">
            Because your data lives on your device, you already control it. You can
            view it, export it (via screenshots/share), and erase it instantly with
            the Burn Button. There is no account to delete.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Age requirement</h2>
          <p className="text-muted-foreground">
            Blacktop is intended for users 16 years or older who hold a valid
            license to operate a motor vehicle in their jurisdiction.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Contact</h2>
          <p className="text-muted-foreground">
            For privacy questions or requests, contact the app owner via the
            support link on blacktoplive.com.
          </p>
        </section>

        <div className="pt-4">
          <Button
            variant="outline"
            onClick={() => navigate('/terms')}
            className="w-full h-11 rounded-xl touch-target"
          >
            View Terms of Service
          </Button>
        </div>
      </main>
    </div>
  );
}
