import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

export default function Terms() {
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
            <AlertTriangle className="w-5 h-5 text-accent" />
            <h1 className="text-lg font-semibold">Terms & Safety</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">
        <p className="text-xs text-muted-foreground">
          Last updated: September 4, 2026
        </p>

        <section className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-base font-semibold text-destructive">Safety first</h2>
          </div>
          <p className="text-muted-foreground">
            Motorcycling is inherently dangerous. Blacktop is a logging and
            communication tool — it is <span className="text-foreground font-medium">not</span> a
            safety device, racing tool, navigation system you should rely on
            exclusively, or a substitute for skill, training, attention, or
            protective gear.
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>Do not interact with the app while operating a vehicle.</li>
            <li>Set up your ride and convoy before you start riding.</li>
            <li>Always obey local traffic laws, speed limits, and licensing rules.</li>
            <li>Speed and lean-angle data are informational only — not for racing or competition on public roads.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Eligibility</h2>
          <p className="text-muted-foreground">
            You must be at least 16 years old and hold a valid license to operate
            a motor vehicle in your jurisdiction. By using Blacktop you confirm
            you meet these requirements.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Acceptable use</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>No illegal racing, stunting on public roads, or evading law enforcement.</li>
            <li>No harassment, hate, or threats in convoy chat or voice channels.</li>
            <li>No using the app to commit, plan, or assist any crime.</li>
            <li>No reverse engineering, scraping, or abusing the backend.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Disclaimer of warranties</h2>
          <p className="text-muted-foreground">
            Blacktop is provided <span className="text-foreground font-medium">"as is"</span> without
            warranties of any kind. We do not guarantee uptime, accuracy of GPS or
            speed data, delivery of rescue pings, voice channel reliability, or
            availability of any feature.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Limitation of liability</h2>
          <p className="text-muted-foreground">
            To the maximum extent permitted by law, the app owner, contributors,
            and infrastructure providers are not liable for any death, injury,
            property damage, lost data, legal consequence, or other harm arising
            from your use of Blacktop. You ride at your own risk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Rescue & crash detection</h2>
          <p className="text-muted-foreground">
            The rescue ping and auto-rescue features are best-effort
            notifications to your convoy leader (and optionally a Discord
            channel). They are <span className="text-foreground font-medium">not</span> emergency
            services. In a real emergency, call your local emergency number.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Blacktop Arcade — Hit Heavy</h2>
          <p className="text-muted-foreground">
            Hit Heavy is a novelty "punch machine" mini-game that measures the
            peak G-force registered by your phone's accelerometer. It is
            entertainment only — <span className="text-foreground font-medium">not</span> a
            calibrated impact meter, fitness device, or strength test.
          </p>
          <p className="text-muted-foreground">
            By playing Hit Heavy you acknowledge and agree that:
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>
              You are solely responsible for any damage to your device, case,
              screen, mounts, accessories, or anything your device strikes or is
              struck by during play. The app owner and contributors accept
              <span className="text-foreground font-medium"> no liability </span>
              for cracked screens, broken phones, dropped devices, damaged
              furniture, walls, vehicles, or any other property.
            </li>
            <li>
              You are solely responsible for any injury to yourself or others
              caused by punching, swinging, throwing, or otherwise striking with
              a device in hand. Do not play near people, pets, glass, hard
              surfaces, or while operating a vehicle.
            </li>
            <li>
              Do not strike your device against hard objects. The game is
              designed to be played by swinging your arm through the air with
              the phone held securely — not by hitting a target.
            </li>
            <li>
              Manufacturer warranties (Apple, Samsung, Google, etc.) typically
              do <span className="text-foreground font-medium">not</span> cover
              impact damage. Playing Hit Heavy may void your warranty or
              insurance coverage. Check before you play.
            </li>
            <li>
              You waive any claim against the app owner, contributors, and
              infrastructure providers for device damage, personal injury, or
              property damage arising from Hit Heavy or any other Blacktop
              Arcade game.
            </li>
          </ul>
          <p className="text-muted-foreground">
            If you are not willing to accept these risks, do not play Hit Heavy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Card challenges (time attack)</h2>
          <p className="text-muted-foreground">
            Card challenges are a game layer inside Blacktop World, not a race.
            By setting or taking one you agree that:
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>
              Both setting and taking a challenge start only after you press
              Ready up and a five-second countdown finishes. Never ready up
              while moving, in traffic, or anywhere it is unsafe to stop.
            </li>
            <li>
              Five seconds are deducted from a setter's recorded time to allow
              for stopping to mark the finish line. Times, routes and results
              are approximate and derived from GPS.
            </li>
            <li>
              Speed limits, traffic law and road conditions always take priority
              over any time on screen. A faster time is never worth breaking the
              law or riding beyond your ability.
            </li>
            <li>
              You are solely responsible for your riding during a challenge. The
              app owner and contributors accept
              <span className="text-foreground font-medium"> no liability </span>
              for any collision, injury, penalty or damage arising from setting
              or attempting a challenge.
            </li>
          </ul>
        </section>


        <section className="space-y-2">
          <h2 className="text-base font-semibold">Blacktop Arcade — Derez Legacy</h2>
          <p className="text-muted-foreground">
            Derez Legacy is a multiplayer light-trail game played while riding
            real vehicles. It is <span className="text-foreground font-medium">not</span> a
            racing tool and must never be treated as one. By playing you
            acknowledge and agree that:
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>
              Only ever play on private property or closed lots (e.g. an empty
              car park) with the landowner's permission. Never play on public
              roads, in traffic, or anywhere other vehicles or pedestrians may
              be present.
              </li>
            <li>
              Keep speeds low. The game works at walking pace — there is no
              advantage to going faster, and doing so defeats the point and
              endangers you and others.
            </li>
            <li>
              Eyes up. Glance at the screen only when stationary or moving
              slowly; your attention belongs on your surroundings, not your
              trail.
            </li>
            <li>
              You are solely responsible for your riding, for every other
              player's conduct, and for any collision, injury, or property
              damage arising from play. The app owner and contributors accept
              <span className="text-foreground font-medium"> no liability </span>
              for harm arising from Derez Legacy or any other Blacktop Arcade
              game.
            </li>
            <li>
              GPS trails are approximate. Collision detection and arena
              boundaries are informational only and must never be relied on for
              safety.
            </li>
          </ul>
          <p className="text-muted-foreground">
            If you cannot play slowly, legally, and with permission, do not
            play.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Accessibility</h2>
          <p className="text-muted-foreground">
            Blacktop aims to follow WCAG 2.1 AA guidance where practical: a
            high-contrast dark theme, semantic markup, keyboard-operable
            controls, screen-reader labels on interactive elements, and
            respect for the OS text-size and reduce-motion settings.
          </p>
          <p className="text-muted-foreground">
            Some features are intentionally motion- or orientation-based
            (lean-angle sensor, G-force gauge, globe long-press) and cannot
            be made fully equivalent for every user. In-ride controls are
            deliberately large and sparse and are not designed to be operated
            while the vehicle is moving.
          </p>
          <p className="text-muted-foreground">
            If you hit an accessibility barrier, please report it via the
            Discord invite in Settings so it can be prioritised.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Changes</h2>
          <p className="text-muted-foreground">
            We may update these terms. Continued use of the app after an update
            means you accept the new terms.
          </p>
        </section>
      </main>
    </div>
  );
}
