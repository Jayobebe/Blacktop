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
          Last updated: June 27, 2026 · Maintained by the Blacktop team.
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
            <li><span className="text-foreground">Stripe</span> — only if you tip; we never see your card details</li>
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
