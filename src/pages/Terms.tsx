import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

export default function Terms() {
  const navigate = useNavigate();
  const { hasProfile } = useProfile();
  const handleBack = () => navigate(hasProfile ? '/settings' : '/');

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 p-4 max-w-2xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="touch-target"
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
          Last updated: June 26, 2026
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
