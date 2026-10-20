import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isThermal } from '@/lib/thermal';
import { tr } from '@/lib/i18n';
import type { BadgeType } from '@/types/convoy';
import { RideSummary } from './RideSummary';
import { useRideHistory } from '../hooks/useRideHistory';
import { landReceipt, useReceiptFlight } from '../lib/receiptFlight';

/** After the page warp into Home has let go. */
const ARRIVE_MS = 550;
/** On screen long enough to see what the ride was. */
const HOLD_MS = 1900;
const FLY_MS = 700;

/**
 * A ride's receipt arriving on Home: it prints in the middle of the screen,
 * holds a moment, then shrinks into the History button on the nav bar (which
 * gives a little bounce as it lands). A tap on it opens the ride instead.
 * With no History button on screen (another card of Home's deck) it just
 * fades; under Thermal mode and reduced motion it fades without moving.
 */
export function ReceiptFlight() {
  const flight = useReceiptFlight();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { updateRideBadges } = useRideHistory();
  const boxRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  const onHome = pathname === '/';

  // Convoy badges are worked out by the receipt as it mounts.
  const rideId = flight?.rideId;
  const onBadgesEarned = useCallback(
    (badges: BadgeType[]) => {
      if (rideId && badges.length > 0) updateRideBadges(rideId, badges);
    },
    [rideId, updateRideBadges],
  );

  // Fit the receipt to the screen before it's shown.
  const fitScale = () => {
    const el = boxRef.current;
    if (!el) return 0.8;
    const h = el.offsetHeight || 1;
    return Math.min(0.82, (window.innerHeight * 0.72) / h, (window.innerWidth * 0.86) / (el.offsetWidth || 1));
  };

  useLayoutEffect(() => {
    if (flight) setStyle({ opacity: 0, transform: 'translate(-50%, -50%) scale(0.7)' });
  }, [flight]);

  useEffect(() => {
    if (!flight || !onHome) return;
    const still = isThermal() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    at(ARRIVE_MS, () => {
      const s = fitScale();
      setStyle({
        opacity: 1,
        transform: `translate(-50%, -50%) scale(${s})`,
        transition: still ? 'opacity 200ms' : 'opacity 300ms ease-out, transform 450ms cubic-bezier(0.2, 1.4, 0.4, 1)',
      });
    });
    at(ARRIVE_MS + HOLD_MS, () => {
      const target = [...document.querySelectorAll<HTMLElement>('[data-nav="history"]')].find((b) => b.offsetParent !== null);
      const r = target?.getBoundingClientRect();
      const visible = r && r.width > 0 && r.top < window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
      if (still || !r || !visible) {
        setStyle((p) => ({ ...p, opacity: 0, transition: 'opacity 300ms' }));
        return;
      }
      const el = boxRef.current;
      const scale = Math.max(0.02, Math.min(r.width / (el?.offsetWidth || 360), r.height / (el?.offsetHeight || 600)) * 1.2);
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      setStyle({
        opacity: 0.15,
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(-8deg)`,
        transition: `left ${FLY_MS}ms cubic-bezier(0.55, 0, 0.75, 0.4), top ${FLY_MS}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${FLY_MS}ms cubic-bezier(0.5, 0, 0.75, 0), opacity ${FLY_MS}ms ease-in`,
      });
      at(FLY_MS - 60, () => {
        target!.classList.add('nav-catch');
        window.setTimeout(() => target!.classList.remove('nav-catch'), 500);
      });
    });
    at(ARRIVE_MS + HOLD_MS + FLY_MS + 50, landReceipt);
    return () => timers.forEach(clearTimeout);
  }, [flight, onHome]);

  // Anywhere but Home (the rider went straight on): it isn't needed, the ride is in History.
  useEffect(() => {
    if (flight && !onHome) {
      const t = window.setTimeout(landReceipt, ARRIVE_MS + 200);
      return () => clearTimeout(t);
    }
  }, [flight, onHome]);

  if (!flight || !onHome) return null;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={tr("Open this ride")}
      onClick={() => {
        landReceipt();
        navigate(`/ride/${flight.rideId}`);
      }}
      data-no-ui-sound
      className="fixed z-[60] w-[360px] text-left origin-center"
      style={{ left: '50%', top: '50%', ...style }}
    >
      <div ref={boxRef} className="drop-shadow-2xl">
        <RideSummary
          variant="embedded"
          hideActions
          members={flight.members}
          currentUserId={flight.currentUserId}
          rideStats={flight.rideStats}
          bikeName={flight.bikeName}
          bikePhoto={flight.bikePhoto}
          gForceSamples={flight.gForceSamples}
          convoy={flight.convoy}
          leg={flight.leg}
          onBadgesEarned={onBadgesEarned}
        />
      </div>
    </div>
  );
}
