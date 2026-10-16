import { useEffect, useState } from 'react';
import { Building2, Check, MessageSquare, SquareParking } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useExperience } from '@/features/experience';
import { cleanPhone, emergencySmsHref, safeArrivalMessage } from '@/features/rescue';
import { Textarea } from '@/components/ui/textarea';
import { useSettings } from '@/features/settings';
import { tr } from '@/lib/i18n';
import { setParkedLevel, setParkedSpot } from '@/lib/parkedSpot';
import { formatDuration } from '@/lib/format';
import { milesText } from '@/lib/units';
import { placeName } from '../lib/rideNames';

interface RideWrapUpProps {
  riderName: string;
  /** The ride's distance, in miles. */
  distance: number;
  duration: number;
  /** Where a planned route went ("Brighton Marina, Brighton"), if one was set. */
  targetName: string | null;
  /** Where the ride ended, when the parking question is on (Settings → Navigation). */
  endSpot: { lat: number; lng: number } | null;
  onContinue: () => void;
}

type Parking = 'ask' | 'storey' | 'level' | 'done';

/**
 * Between a ride ending and Home: the two things a rider may want before
 * walking off, on one card. The safe-arrival text (opt-in, Settings → Safety,
 * with an emergency contact) opens the phone's own messages app with "back
 * safe at … after …" written. The parking question: save where you parked?
 * Yes asks whether it's a multi-storey (GPS can't tell its floors apart), and
 * yes to that takes the floor and bay. Once parking is answered the card goes
 * on to Home by itself (where the receipt flies into History), unless the
 * text is still on offer, which keeps a Continue button.
 */
export function RideWrapUp({ riderName, distance, duration, targetName, endSpot, onContinue }: RideWrapUpProps) {
  const { settings } = useSettings();
  const { terms } = useExperience();
  const [place, setPlace] = useState<string | null>(targetName ? targetName.split(',')[0].trim() : null);
  const [texted, setTexted] = useState(false);
  const [parking, setParking] = useState<Parking>(endSpot ? 'ask' : 'done');
  const [floor, setFloor] = useState('');
  const [bay, setBay] = useState('');

  const offerText = settings.safeArrivalText;
  useEffect(() => {
    if (!offerText || place || !endSpot) return;
    let gone = false;
    void placeName(endSpot.lat, endSpot.lng).then((p) => !gone && p && setPlace(p));
    return () => {
      gone = true;
    };
    // Looked up once, from where the ride ended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerText]);

  const phone = offerText ? cleanPhone(settings.emergencyContactPhone ?? '') : '';
  const contact = settings.emergencyContactName?.trim();
  // The text, written for them and theirs to change: the default follows the town until they type.
  const suggested = safeArrivalMessage(riderName, milesText(distance), place);
  const [message, setMessage] = useState<string | null>(null);
  const body = message ?? suggested;
  const href = phone ? emergencySmsHref(phone, body) : null;

  const parkingAnswered = () => {
    setParking('done');
    // Nothing else on the card: straight on to Home.
    if (!href) onContinue();
  };

  return (
    <div className="fixed inset-0 z-50 safe-frame bg-background/95 backdrop-blur-md flex flex-col items-center p-4 overflow-y-auto animate-fade-in">
      <div className="w-full max-w-[360px] my-auto space-y-3">
        <div className="text-center mb-2">
          <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("{0} saved", [terms.Ride])}</p>
          <p className="text-2xl font-bold text-foreground font-mono mt-1">
            {milesText(distance)} · {formatDuration(duration)}
          </p>
        </div>

        {endSpot && parking !== 'done' && (
          <div className="rounded-2xl bg-card border border-border/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              {parking === 'ask' ? <SquareParking className="w-4 h-4 text-accent" /> : <Building2 className="w-4 h-4 text-accent" />}
              <p className="text-sm font-semibold text-foreground">
                {parking === 'ask' ? tr("Save where you parked?") : parking === 'storey' ? tr("In a multi-storey car park?") : tr("Which floor and bay?")}
              </p>
            </div>
            {parking === 'level' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={floor} onChange={(e) => setFloor(e.target.value.slice(0, 12))} placeholder={tr("Floor")} aria-label={tr("Floor")} autoComplete="off" autoFocus />
                  <Input value={bay} onChange={(e) => setBay(e.target.value.slice(0, 12))} placeholder={tr("Bay")} aria-label={tr("Bay")} autoComplete="off" />
                </div>
                <Button
                  className="w-full h-12 text-base font-semibold mt-3"
                  onClick={() => {
                    setParkedLevel({ floor, bay });
                    parkingAnswered();
                  }}
                >
                  {tr("Done")}
                </Button>
              </>
            ) : (
              <>
                {parking === 'storey' && (
                  <p className="text-xs text-muted-foreground -mt-2 mb-3">{tr("GPS can't tell the floors apart, so the floor and bay help you find it.")}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-12 text-base font-semibold" onClick={parkingAnswered}>
                    {tr("No")}
                  </Button>
                  <Button
                    className="h-12 text-base font-semibold"
                    onClick={() => {
                      if (parking === 'ask') {
                        setParkedSpot(endSpot.lat, endSpot.lng);
                        setParking('storey');
                      } else {
                        setParking('level');
                      }
                    }}
                  >
                    {tr("Yes")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {href && (
          <div className="rounded-2xl bg-card border border-border/40 p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-accent" />
              <p className="text-sm font-semibold text-foreground">
                {contact ? tr("Arrived safe? Let {0} know!", [contact]) : tr("Arrived safe? Let your contact know!")}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{tr("Change the message if you like. It opens in your messages app, and nothing is sent until you press send.")}</p>
            <Textarea
              value={body}
              onChange={(e) => setMessage(e.target.value.slice(0, 300))}
              aria-label={tr("Message")}
              rows={3}
              className="mb-3 text-sm resize-none"
            />
            <Button
              className="w-full h-12 text-base font-semibold gap-2"
              variant={texted ? 'outline' : 'default'}
              disabled={!body.trim()}
              onClick={() => {
                setTexted(true);
                window.location.href = href;
              }}
            >
              {texted ? <Check className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              {texted ? tr("Text opened") : contact ? tr("Text {0}", [contact]) : tr("Text emergency contact")}
            </Button>
          </div>
        )}

        {(href || parking === 'done') && (
          <Button className="w-full h-12 text-base font-semibold" variant={href && !texted ? 'outline' : 'default'} onClick={onContinue}>
            {tr("Continue")}
          </Button>
        )}
      </div>
    </div>
  );
}
