import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 p-4 max-w-2xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="touch-target"
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
          Last updated: June 21, 2026 · Maintained by the Blacktop team.
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
          <h2 className="text-base font-semibold">Permissions we ask for</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li><span className="text-foreground">Location</span> — required, used only during active rides for tracking and convoy sync</li>
            <li><span className="text-foreground">Microphone</span> — optional, used only for live voice chat in convoys</li>
            <li><span className="text-foreground">Motion sensors</span> — optional, for lean angle visualization and crash detection</li>
            <li><span className="text-foreground">Photos / Files</span> — optional, only when you choose to attach a photo to a ride in your history. Photos stay on your device.</li>
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
