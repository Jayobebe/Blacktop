import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { tr } from '@/lib/i18n';

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const { hasProfile } = useProfile();
  const handleBack = () => navigate(hasProfile ? '/settings' : '/');

  return (
    <div className="min-h-dvh safe-top safe-bottom">
      <div className="px-4 max-w-2xl mx-auto">
        <PageHeader sticky title={tr("Privacy Policy")} onBack={handleBack} backLabel={tr("Go back")} />
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">
        <p className="text-xs text-muted-foreground">
          {tr("Last updated: September 28, 2026 · Maintained by the Blacktop team.")}
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("The short version")}</h2>
          <p className="text-muted-foreground">
            {tr("Blacktop is built privacy-first. Your rides, stats, garage, and history live on your device. We do not run analytics, advertising, profiling, or behavioral tracking. We do not sell or share your data.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("What we store on your device")}</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>{tr("Your chosen display name")}</li>
            <li>{tr("Your ride history (distance, speed, route, photos)")}</li>
            <li>{tr("Your garage, settings, language and preferences")}</li>
            <li>{tr("Your Track Pack tracks, sessions and lap times")}</li>
            <li>{tr("Your saved places, recent destinations and where the map was last centred")}</li>
            <li>{tr("Offline map areas you download")}</li>
          </ul>
          <p className="text-muted-foreground">
            {tr("Tap")}{" "}<span className="text-foreground font-medium">{tr("Burn All Data")}</span>{" "}{tr("in Settings at any time to permanently erase everything, on your device and on our servers (see Your rights).")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("What touches our server (temporarily)")}</h2>
          <p className="text-muted-foreground">
            {tr("When you join a convoy, the following ephemeral data is sent to our backend purely so other riders can see you live:")}
          </p>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>{tr("An anonymous identifier (no email, no phone, no real name required)")}</li>
            <li>{tr("Your current GPS coordinates and speed")}</li>
            <li>{tr("Convoy chat messages and shared waypoints")}</li>
          </ul>
          <p className="text-muted-foreground">
            {tr("The moment a ride ends, a server-side trigger automatically erases all of this — coordinates, speed, distance, messages, waypoints — without human intervention. The only persistent server-side metric is the total number of profiles created. No per-user history is retained.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Voice communication")}</h2>
          <p className="text-muted-foreground">
            {tr("Convoy voice uses WebRTC and is encrypted end to end (DTLS-SRTP). Phones connect directly when the network allows it. On most mobile data connections a direct link isn't possible, so the encrypted audio is forwarded through a Cloudflare TURN relay, which cannot decrypt or listen to it. Audio is never stored on any server. When the convoy ends, the connection is gone.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Voice channel recording")}</span>{" "}{tr("is an optional, off-by-default setting that lets you mix convoy voice into your own locally recorded ride overlay video. It doubles as a consent flag: your voice is only ever included in another rider's recording if")}{" "}<span className="text-foreground">{tr("you")}</span>{" "}{tr("have this toggle on. If you have it off, your voice is excluded from everyone else's recordings; if every rider in the convoy has it on, everyone can be heard. Recordings are generated and stored locally on the recording rider's device only, are never uploaded, and are erased by the Burn Button.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Blacktop World (opt-in)")}</h2>
          <p className="text-muted-foreground">
            {tr("Blacktop World is the crew hub of the app — a spinning globe with landmarks for crew convoys, crew leaderboards, crew QR joining, your card collection and the arcade, plus an anonymous glow showing where riders are active. It is")}{' '}
            <span className="text-foreground">{tr("off by default")}</span>{tr(", fully voluntary, and can be toggled on or off at any time in Settings. No features outside of Blacktop World require it.")}
          </p>

          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("What gets shared when you enable it and start a ride:")}</span>{" "}{tr("your precise GPS coordinates and a timestamp are written to our server every 30 seconds while you are actively riding. Only you can read that record. It powers the live rider count and the glow on the globe: other riders see positions rounded to whole degrees of latitude and longitude (about 110 km), with no name or ID, never your individual pin or identity. No display name, speed, route history, or device identifier is included.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("When it is removed:")}</span>{" "}{tr("your location record is deleted from our servers the moment you end your ride. If your ride is interrupted (app crash, phone dies, signal lost) the record expires automatically within 10 minutes based on a freshness check — it is never retained beyond your active session. Disabling Blacktop World in Settings stops any further writes immediately.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Logbook hand-over:")}</span>{" "}{tr("when you hand a vehicle to another rider, its logbook (vehicle name, photo, service items, keepers and that vehicle's ride summaries, without GPS tracks) is sent straight to their phone over a one-off realtime channel opened by the QR code. It passes through our realtime relay but is never stored on our servers.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Notifications (opt-in, Settings → Notifications):")}</span>{" "}{tr("if you turn them on, we store this device's push address and keys (issued by your browser's push service, e.g. Google or Apple), which kinds of notification you've switched on and your crew code, linked to your anonymous account. For heavy-weather alerts we also keep your last location rounded to about 11 km (from where your last ride ended, or your phone's location if you've allowed it) and check the forecast there with Open-Meteo. If you switch on")}{' '}
            <span className="text-foreground">{tr("Riders near me who need help")}</span>{tr(", the same rounded location (about 11 km) is kept so a nearby rider's rescue call can reach you. For time-based maintenance reminders we keep the reminder text (service item and vehicle name) and its date until it's sent. Notifications are encrypted end to end to your phone; the push service only delivers them. A rescue call sends your name and location to whoever you've chosen in Settings → Safety: your convoy, your crew, your Discord, and riders nearby (within the distance you pick) who have opted in to help. With Blacktop World on, your crew-board totals and this week's challenge stats are also published after each ride, so your crew can be told when the board changes. Turning notifications off, or using the Burn Button, deletes the device and its reminders from our server.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Speedshop survey:")}</span>{" "}{tr("nothing is sold yet. When you answer whether you'd buy an item and what you'd pay, or send a suggestion, we store that answer linked to your anonymous account. Other riders only ever see anonymous totals, and the survey table in the app's demo mode shows those totals and the suggestion text (never who sent them). The Burn Button deletes your answers.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Track Pack (opt-in):")}</span>{" "}{tr("tracks, lap times and session data stay on your device. While Track Pack is open, anyone who scans your pairing QR receives your display name, live position, speed, lean, lap and sector times, and pit board messages over a temporary realtime channel keyed by that QR, along with the track you've selected (its name, outline and timing lines). Rider ⇄ crew voice is peer-to-peer, and pit board calls are spoken by your phone's own text-to-speech. Nothing is stored on our servers, and the link closes when you leave Track Pack. The circuit library is a file of public OpenStreetMap circuit data served with the app: searching it happens on your phone and sends nothing. Building a track from the map sends only the corners of the box you draw to our search service, which asks OpenStreetMap (Overpass) for the roads inside it.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Nearby Riders (separate opt-in, Settings → Navigation):")}</span>{" "}{tr("while you ride with it on, your display name, precise position, speed and convoy (if any) are shared live with other riders who have also turned it on and are within a few kilometres. Nothing is stored on our servers: it is sent over a temporary realtime channel and disappears when you stop riding or turn it off. Joining up or merging convoys always needs both sides to accept, and you can block a rider from the prompt.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Collector cards:")}</span>{" "}{tr("opting in also unlocks the ability to flip your custom vehicle stats card to reveal a shareable QR code. The QR contains your display name, vehicle info, tier, and ride stats — nothing else. Other riders can scan it to add your card to their local")}{' '}
            <span className="text-foreground">{tr("Card Collection")}</span>{tr(". Collected cards are stored entirely on the scanning rider's device and are never uploaded anywhere. Stats on a collected card are frozen at the moment of scan and only update if the owner explicitly shares an updated QR and the collector chooses to rescan it. You can delete any card from your collection at any time, and the Burn Button wipes the entire collection instantly.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Card drops & collections")}</h2>
          <p className="text-muted-foreground">
            {tr("Card drops are part of")}{" "}<span className="text-foreground">{tr("Blacktop World")}</span>{" "}{tr("and are only active while you have opted into it in Settings. With Blacktop World off, no drops are listed, planted, collected or synced. When you plant a collector card on the map, the drop is stored on our server so other riders nearby can find and collect it. Unlike convoy data, a drop is")}{" "}<span className="text-foreground">{tr("persistent")}</span>{" "}{tr("— it stays live until you remove it. Each drop contains:")}
          </p>

          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>{tr("Your display name and vehicle info (name, make/model, tier)")}</li>
            <li>{tr("Your ride stats as they were at the moment of the drop")}</li>
            <li>{tr("The GPS coordinates where you planted the card")}</li>
            <li>{tr("Your card photo, if the card has one")}</li>
          </ul>
          <p className="text-muted-foreground">
            {tr("When another rider collects one of your drops, the collection is recorded server-side (with the collector's display name) so you can be credited a badge-point kickback, and so area \"card king\" rankings can be computed. Cards you collect from others are stored on your device only. Deleting a drop (or burning your data) removes your card from the map permanently.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Card challenges (time attack)")}</h2>
          <p className="text-muted-foreground">
            {tr("Card challenges are also part of")}{" "}<span className="text-foreground">{tr("Blacktop World")}</span>{" "}{tr("and only work while it is switched on. If you attach a challenge to a card you drop, you ready up, a five-second countdown runs, and the route you then ride is recorded. Five seconds are deducted from your recorded time to account for stopping to set the finish line. The challenge route, its distance, the time to beat and the finish-line coordinates are stored on our server alongside the drop, and are visible to any rider who can see that card.")}
          </p>
          <p className="text-muted-foreground">
            {tr("When you take on someone else's challenge, your position is compared against the stored route while the run is live so we can detect the finish line and off-route deviations. Only the outcome (your display name, your time and whether you won, lost or were voided) is stored server-side; the raw track of your attempt stays on your device as a normal ride in your history. Removing the drop, or burning your data, removes the challenge and its attempts.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Crews & challenges")}</h2>
          <p className="text-muted-foreground">
            {tr("Joining a crew stores your display name alongside the crew's code on our server so crew members can see each other. If you take part in weekly crew challenges, summary ride stats (weekly distance, top speed, number of night rides, longest single ride) are uploaded under your display name to power the crew leaderboard. Opening the crew leaderboard publishes your all-time totals (distance, top speed, max lean, number of rides and arcade high scores) the same way. These persist from week to week. Leaving a crew removes your membership and scores. Badges themselves are banked locally on your device.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Derez Legacy (multiplayer arcade)")}</h2>
          <p className="text-muted-foreground">
            {tr("When you create or join a Derez Legacy lobby, your display name and assigned accent colour are stored in the lobby on our server. During a round your GPS position is broadcast at high frequency to the other players so their screens can draw your light trail — this trail data is ephemeral and is never written to the database. Lobby rows are removed when the lobby is closed. Win tallies are stored locally on your device.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Hazard reports")}</h2>
          <p className="text-muted-foreground">
            {tr("When you report a hazard, we store its type, the position where you reported it, your direction of travel, when it was reported and when it expires. It's linked to your anonymous account only so we can limit how often one rider can report, merge duplicate reports and let you remove your own; other riders never see who reported anything. \"Still there?\" answers are stored the same way (one per rider per report). To warn you about hazards ahead, the app downloads the reports around where you are and does the checking on your phone; your position isn't sent to us for this. When one of your reports or answers changes, the app sends other riders viewing that area a rough position (about 100 m) so they refresh. Reports are deleted a day after they expire, and the Burn Button deletes yours and your answers.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Map, places and search")}</h2>
          <p className="text-muted-foreground">
            {tr("The places, icons and names on the Blacktop map come from the map tiles themselves, so showing them sends nothing extra. Searching first looks through the map already on your phone; it then sends what you typed, with your approximate area, to our search service, which asks OpenStreetMap's Nominatim and Photon and returns the results. We don't keep your searches. Your recent destinations, saved places and last map position stay on your device.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Stats overlay video")}</h2>
          <p className="text-muted-foreground">
            {tr("During each ride, the app draws your live stats (speed, distance, lean angle) onto a transparent video file generated locally on your device. It does not use your camera, microphone, or any cloud service — it's a file you can later layer over your own action-cam footage in a video editor. It lives in local storage and is erased by the Burn Button along with everything else.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Permissions we ask for")}</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li><span className="text-foreground">{tr("Location")}</span>{" "}{tr("— required, used only during active rides for tracking and convoy sync")}</li>
            <li><span className="text-foreground">{tr("Microphone")}</span>{" "}{tr("— optional, used only for live voice chat in convoys")}</li>
            <li><span className="text-foreground">{tr("Motion sensors")}</span>{" "}{tr("— optional, for lean angle visualization and crash detection")}</li>
            <li><span className="text-foreground">{tr("Photos / Files")}</span>{" "}{tr("— optional, only when you choose to attach a photo to a ride in your history. Photos stay on your device.")}</li>
            <li><span className="text-foreground">{tr("Camera")}</span>{" "}{tr("— optional, used only to scan QR codes for sharing and joining convoys. Images are processed locally on-device and never stored or uploaded.")}</li>
          </ul>
          <p className="text-muted-foreground">
            {tr("We never collect location in the background outside of an active ride.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Third parties")}</h2>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
            <li><span className="text-foreground">{tr("Lovable Cloud")}</span>{" "}{tr("— hosts the realtime convoy backend")}</li>
            <li><span className="text-foreground">{tr("OpenStreetMap / Nominatim / Overpass / Photon (komoot)")}</span>{" "}{tr("— location search, the roads for building tracks, and the circuit library (© OpenStreetMap contributors, ODbL)")}</li>
            <li><span className="text-foreground">{tr("OpenFreeMap, Esri World Imagery, AWS Open Data terrain")}</span>{" "}{tr("— map, satellite and elevation tiles (they see which map areas you load)")}</li>
            <li><span className="text-foreground">{tr("RainViewer / Open-Meteo")}</span>{" "}{tr("— rain radar and route weather, only if you turn those on")}</li>
            <li><span className="text-foreground">{tr("Google and Cloudflare STUN")}</span>{" "}{tr("— help two phones find each other for voice chat (they see your IP address)")}</li>
            <li><span className="text-foreground">{tr("Cloudflare TURN")}</span>{" "}{tr("— relays encrypted voice audio when phones can't connect directly (typical on mobile data)")}</li>
            <li><span className="text-foreground">{tr("Discord")}</span>{" "}{tr("— only if you opt in by adding a webhook in your account")}</li>
            <li><span className="text-foreground">{tr("Nimiq Pay")}</span>{" "}{tr("— only if you use Pay Up or Blacktank; payments happen in your own wallet and we never see your keys")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Payments — Pay Up &amp; Blacktank")}</h2>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Pay Up")}</span>{" "}{tr("lets you show your own wallet QR or scan someone else's to send NIM or Polygon USDT. Your wallet address is stored only on your device, and all transactions are handled by your own Nimiq Pay wallet — we never see, hold or route your funds or keys.")}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">{tr("Blacktank")}</span>{" "}{tr("is a crew's shared fuel-pot ledger: pledges, withdrawal requests and votes are stored on our backend under your crew code so crew members can see and approve them. It is a pledge record only — no money is ever pooled or held by the app, and approved payouts are settled directly wallet-to-wallet via Nimiq Pay.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Your rights")}</h2>
          <p className="text-muted-foreground">
            {tr("Because your data lives on your device, you already control it. You can view it, export it (via screenshots/share), and erase it with the Burn Button. Burning deletes your anonymous account and everything linked to it on our servers (crew membership and scores, card drops and challenges, hazard reports and answers, survey answers, notification devices and reminders, card photos), then everything Blacktop kept on your device, including offline maps. Burning the demo account deletes nothing: it just takes you back to your own.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Age requirement")}</h2>
          <p className="text-muted-foreground">
            {tr("Blacktop is intended for users 16 years or older who hold a valid license to operate a motor vehicle in their jurisdiction.")}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">{tr("Contact")}</h2>
          <p className="text-muted-foreground">
            {tr("For privacy questions or requests, contact the app owner via the support link on blacktoplive.com.")}
          </p>
        </section>

        <div className="pt-4">
          <Button
            variant="outline"
            onClick={() => navigate('/terms')}
            className="w-full h-11 rounded-xl touch-target"
          >
            {tr("View Terms of Service")}
          </Button>
        </div>
      </main>
    </div>
  );
}
