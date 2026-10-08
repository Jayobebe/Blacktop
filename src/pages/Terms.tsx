import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { tr } from '@/lib/i18n';
import { rescueDisclaimer } from '@/features/rescue';

export default function Terms() {
  const navigate = useNavigate();
  const { hasProfile } = useProfile();
  const handleBack = () => navigate(hasProfile ? '/settings' : '/');

  return (
    <div className="min-h-dvh safe-top safe-bottom">
      <div className="px-4 max-w-2xl mx-auto">
        <PageHeader sticky title={tr("Terms & Safety")} onBack={handleBack} backLabel={tr("Go back")} />
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">
        <p className="text-xs text-muted-foreground">
          {tr("Last updated: October 1, 2026")}
        </p>

        <section className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-base font-semibold text-destructive">{tr("Safety first")}</h2>
          </div>
          <p className="text-muted-foreground">
            {tr("Riding and driving are inherently dangerous. Blacktop is a logging and communication tool — it is")}{" "}<span className="text-foreground font-medium">{tr("not")}</span>{" "}{tr("a safety device, racing tool, navigation system you should rely on exclusively, or a substitute for skill, training, attention, or protective gear.")}
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>{tr("Do not interact with the app while operating a vehicle.")}</li>
            <li>{tr("Set up your ride and convoy before you start riding.")}</li>
            <li>{tr("Always obey local traffic laws, speed limits, and licensing rules.")}</li>
            <li>{tr("Speed and lean-angle data are informational only — not for racing or competition on public roads.")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Eligibility")}</h2>
          <p className="text-muted-foreground">
            {tr("You must be at least 16 years old and legally allowed to ride or drive your vehicle in your jurisdiction, with a valid license where one is required. By using Blacktop you confirm you meet these requirements.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Acceptable use")}</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>{tr("No illegal racing, stunting on public roads, or evading law enforcement.")}</li>
            <li>{tr("No harassment, hate, or threats in convoy chat or voice channels.")}</li>
            <li>{tr("No using the app to commit, plan, or assist any crime.")}</li>
            <li>{tr("No false or malicious hazard reports, and no false or prank rescue calls.")}</li>
            <li>{tr("No reverse engineering, scraping, or abusing the backend.")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Disclaimer of warranties")}</h2>
          <p className="text-muted-foreground">
            {tr("Blacktop is provided")}{" "}<span className="text-foreground font-medium">{tr("\"as is\"")}</span>{" "}{tr("without warranties of any kind. We do not guarantee uptime, accuracy of GPS or speed data, delivery of rescue pings, voice channel reliability, or availability of any feature.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Limitation of liability")}</h2>
          <p className="text-muted-foreground">
            {tr("To the maximum extent permitted by law, the app owner, contributors, and infrastructure providers are not liable for any death, injury, property damage, lost data, legal consequence, or other harm arising from your use of Blacktop. You ride at your own risk.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Rescue & crash detection")}</h2>
          <p className="text-muted-foreground">
            {tr("The rescue ping and auto-rescue features are best-effort notifications to whoever you choose in Settings → Safety: your convoy, your crew, a Discord channel, and riders nearby who have opted in to help. They are")}{" "}<span className="text-foreground font-medium">{tr("not")}</span>{" "}{tr("emergency services, delivery isn't guaranteed, and riders who receive a call are volunteers with no obligation to respond. In a real emergency, call your local emergency number.")}
          </p>
          <p className="text-foreground font-medium">{rescueDisclaimer()}</p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>{tr("Crash detection is off until you turn it on, and turning it on asks you to confirm that you understand this notice.")}</li>
            <li>{tr("Your phone can miss a real crash (for example if it's thrown clear, switched off or has no signal) and can mistake a dropped phone or a hard jolt for one.")}</li>
            <li>{tr("Crash detection looks for a hard impact while you're moving, followed by a stop. It can miss a fall at low speed, a crash without a hard impact, or one where your phone keeps moving.")}</li>
            <li>{tr("After a possible crash your phone asks \"Are you okay?\" on a countdown. If nobody answers before it ends, the rescue call is sent.")}</li>
            <li>{tr("Pressing the rescue button asks \"Are you okay?\" first and sends the call only when you answer No. If that question goes unanswered, nothing is sent.")}</li>
            <li>{tr("When crash detection sends a call by itself, your phone sounds a loud siren through its speaker so people nearby notice. The Stop siren button silences it.")}</li>
            <li>{tr("Agree with the people you ride with how they should respond to a call, and don't rely on Blacktop to get you help.")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Anti-theft alarm")}</h2>
          <p className="text-muted-foreground">
            {tr("The anti-theft alarm is a deterrent, not a security system. It relies on your phone's motion sensors, battery and the app staying open; it can miss movement or go off by mistake, it doesn't contact anyone, and closing the app switches it off. Don't sound the siren where that would be unlawful or unsafe. We're not liable for the theft of, or damage to, anything it was guarding.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Public Road Privacy")}</h2>
          <p className="text-muted-foreground">
            {tr("Public Road Privacy hides your peak figures on screen and keeps them out of anything you share. It is a display setting: the figures are still recorded on your phone, and anyone who knows your unlock pattern can show them again. It doesn't change what you're responsible for on the road.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Hazard reports")}</h2>
          <p className="text-muted-foreground">
            {tr("Hazard reports come from other riders. They can be wrong, late or already gone, and a warning (or the lack of one) says nothing about what's actually on the road. Always ride to the conditions you can see.")}
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>{tr("Only report when it's safe: stopped, or as a passenger. Never take your attention off the road to report.")}</li>
            <li>{tr("Only report what you've genuinely seen. Reports are anonymous to other riders, but abuse can still be limited or removed.")}</li>
            <li>{tr("Some countries restrict sharing where police or speed checks are. You are responsible for following your local law when using the \"Hi-vis\" report.")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Navigation, places and maps")}</h2>
          <p className="text-muted-foreground">
            {tr("Routes, turn-by-turn directions, places, speed cameras and weather come from public and third-party data (such as OpenStreetMap) and may be incomplete, out of date or wrong. Road signs, closures and the law always take priority over anything on screen.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Track Day")}</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>{tr("Only use lap timing on a closed circuit or private ground with the owner's permission, never on public roads.")}</li>
            <li>{tr("Lap and sector times come from your phone's GPS. They are approximate and not official timing.")}</li>
            <li>{tr("The circuit library is built from public OpenStreetMap data (© OpenStreetMap contributors, ODbL). Layouts, lengths and directions may be inaccurate. Blacktop isn't affiliated with any circuit; circuit names belong to their owners.")}</li>
            <li>{tr("Spoken pit board calls and the pit crew link are aids, not a replacement for circuit marshals, flags or official signals.")}</li>
            <li>{tr("Track leaderboards and dog tags are for circuits only. Blacktop has no timed challenges on public roads: never race, chase a time or try to beat anyone on a public road.")}</li>
            <li>{tr("Leaderboard times are unofficial GPS times, checked only for plausibility. We may remove any time or rider from a board. A place on a board is not a record recognised by any circuit or governing body.")}{" "}{tr("Laps must have their sectors and enough GPS behind them to count, and a lap far quicker than the rest of its board is held back from other riders.")}</li>
            <li>{tr("You are solely responsible for your riding on track and for following the circuit's rules. The app owner and contributors accept")}<span className="text-foreground font-medium">{" "}{tr("no liability")}{" "}</span>{tr("for any collision, injury or damage arising from chasing a lap time or a leaderboard place.")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Burning your data")}</h2>
          <p className="text-muted-foreground">
            {tr("The Burn Button permanently deletes your data on your device and on our servers, and it can't be undone. Burning the demo account deletes nothing and returns you to your own account.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Languages")}</h2>
          <p className="text-muted-foreground">
            {tr("Blacktop is available in several languages. Translations are provided for convenience; if a translation of these terms or the privacy policy differs from the English, the English version applies.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Voice recording consent")}</h2>
          <p className="text-muted-foreground">
            {tr("The optional Voice Channel Recording setting mixes convoy voice into a rider's locally recorded ride overlay video. Enabling it means you consent to your voice being included in other riders' recordings. If you leave it off, your voice is excluded from everyone else's recordings — only riders who have opted in can be heard. Recordings stay on the recording rider's device and are their responsibility to share lawfully.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Blacktop Arcade — Hit Heavy")}</h2>
          <p className="text-muted-foreground">
            {tr("Hit Heavy is a novelty \"punch machine\" mini-game that measures the peak G-force registered by your phone's accelerometer. It is entertainment only —")}{" "}<span className="text-foreground font-medium">{tr("not")}</span>{" "}{tr("a calibrated impact meter, fitness device, or strength test.")}
          </p>
          <p className="text-muted-foreground">
            {tr("By playing Hit Heavy you acknowledge and agree that:")}
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>
              {tr("You are solely responsible for any damage to your device, case, screen, mounts, accessories, or anything your device strikes or is struck by during play. The app owner and contributors accept")}
              <span className="text-foreground font-medium">{" "}{tr("no liability")}{" "}</span>
              {tr("for cracked screens, broken phones, dropped devices, damaged furniture, walls, vehicles, or any other property.")}
            </li>
            <li>
              {tr("You are solely responsible for any injury to yourself or others caused by punching, swinging, throwing, or otherwise striking with a device in hand. Do not play near people, pets, glass, hard surfaces, or while operating a vehicle.")}
            </li>
            <li>
              {tr("Do not strike your device against hard objects. The game is designed to be played by swinging your arm through the air with the phone held securely — not by hitting a target.")}
            </li>
            <li>
              {tr("Manufacturer warranties (Apple, Samsung, Google, etc.) typically do")}{" "}<span className="text-foreground font-medium">{tr("not")}</span>{" "}{tr("cover impact damage. Playing Hit Heavy may void your warranty or insurance coverage. Check before you play.")}
            </li>
            <li>
              {tr("You waive any claim against the app owner, contributors, and infrastructure providers for device damage, personal injury, or property damage arising from Hit Heavy or any other Blacktop Arcade game.")}
            </li>
          </ul>
          <p className="text-muted-foreground">
            {tr("If you are not willing to accept these risks, do not play Hit Heavy.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Payments — Pay Up &amp; Blacktank")}</h2>
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">{tr("Pay Up")}</span>{" "}{tr("lets you display your own wallet QR or scan another rider's to send NIM or Polygon USDT via your own Nimiq Pay wallet. Blacktop is not a payment processor: we never hold, route or take custody of funds, we never see your keys, and every transaction is final and irreversible once confirmed in your wallet. You are solely responsible for checking the recipient address before sending.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">{tr("Blacktank")}</span>{" "}{tr("is a crew's shared fuel-pot pledge ledger. Pledges are promises between crew members, not deposits — no money is pooled or held by the app. Withdrawal requests require a unanimous vote from the rest of the crew and expire unanswered. Approved requests are settled directly wallet-to-wallet through Nimiq Pay. The app owner and contributors accept")}<span className="text-foreground font-medium">{" "}{tr("no liability")}{" "}</span>
            {tr("for disputes, unpaid pledges, misdirected payments or losses arising from Pay Up or Blacktank.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Blacktop Arcade — Derez Legacy")}</h2>
          <p className="text-muted-foreground">
            {tr("Derez Legacy is a multiplayer light-trail game played while riding real vehicles. It is")}{" "}<span className="text-foreground font-medium">{tr("not")}</span>{" "}{tr("a racing tool and must never be treated as one. By playing you acknowledge and agree that:")}
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>
              {tr("Only ever play on private property or closed lots (e.g. an empty car park) with the landowner's permission. Never play on public roads, in traffic, or anywhere other vehicles or pedestrians may be present.")}
              </li>
            <li>
              {tr("Keep speeds low. The game works at walking pace — there is no advantage to going faster, and doing so defeats the point and endangers you and others.")}
            </li>
            <li>
              {tr("Eyes up. Glance at the screen only when stationary or moving slowly; your attention belongs on your surroundings, not your trail.")}
            </li>
            <li>
              {tr("You are solely responsible for your riding, for every other player's conduct, and for any collision, injury, or property damage arising from play. The app owner and contributors accept")}
              <span className="text-foreground font-medium">{" "}{tr("no liability")}{" "}</span>
              {tr("for harm arising from Derez Legacy or any other Blacktop Arcade game.")}
            </li>
            <li>
              {tr("GPS trails are approximate. Collision detection and arena boundaries are informational only and must never be relied on for safety.")}
            </li>
          </ul>
          <p className="text-muted-foreground">
            {tr("If you cannot play slowly, legally, and with permission, do not play.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Accessibility")}</h2>
          <p className="text-muted-foreground">
            {tr("Blacktop aims to follow WCAG 2.1 AA guidance where practical: a high-contrast dark theme, semantic markup, keyboard-operable controls, screen-reader labels on interactive elements, and respect for the OS text-size and reduce-motion settings.")}
          </p>
          <p className="text-muted-foreground">
            {tr("Some features are intentionally motion- or orientation-based (lean-angle sensor, G-force gauge, globe long-press) and cannot be made fully equivalent for every user. In-ride controls are deliberately large and sparse and are not designed to be operated while the vehicle is moving.")}
          </p>
          <p className="text-muted-foreground">
            {tr("If you hit an accessibility barrier, please report it via the Discord invite in Settings so it can be prioritised.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Changes")}</h2>
          <p className="text-muted-foreground">
            {tr("We may update these terms. Continued use of the app after an update means you accept the new terms.")}
          </p>
        </section>
      </main>
    </div>
  );
}
