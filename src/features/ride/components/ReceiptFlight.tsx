import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isThermal } from '@/lib/thermal';
import { eventSound } from '@/lib/appSound';
import { tr } from '@/lib/i18n';
import type { BadgeType } from '@/types/convoy';
import { RideSummary } from './RideSummary';
import { useRideHistory } from '../hooks/useRideHistory';
import { landReceipt, useReceiptFlight } from '../lib/receiptFlight';
import { markRidesSeen } from '../lib/historySeen';
import { Button } from '@/components/ui/button';
import { setMotionHeld } from '@/lib/homeHold';

/** After the page warp into Home has let go, and Home's moving things have braked to a halt (lib/homeHold). */
const ARRIVE_MS = 850;
/** The printer jumps down into view from the top of the screen. */
const PRINTER_IN_MS = 520;
/** The paper feeds out of the slot in steps, in time with the print sound (14 squawks). */
const PRINT_MS = 1050;
const PRINT_STEPS = 14;
/** Printed: a moment, then the printer jumps back up out of view. */
const AFTER_PRINT_MS = 550;
const PRINTER_OUT_MS = 420;
/** The receipt on its own a moment, long enough to see what the ride was, then it whizzes into History. */
const HOLD_MS = 900;
const FLY_MS = 520;

/** The printer: its height, its distance from the top of the screen, and its slot's middle up from its bottom (px). */
const PRINTER_H = 76;
const PRINTER_TOP = 10;
const SLOT_FROM_BOTTOM = 19;
/** Room kept clear at the bottom for Home's nav bar. */
const NAV_ROOM = 96;

/**
 * A ride's receipt arriving on Home, as in the demo tour's After the ride: a
 * till printer jumps down into view at the top of the screen, the receipt
 * feeds out of its slot top first in steps (with the print sound), the printer
 * jumps back up out of view, and the receipt whizzes down into the History
 * button on the nav bar (which gives a little bounce as it lands). A tap on it
 * opens the ride instead. With no History button on screen (another card of
 * Home's deck) it just fades; under Thermal mode and reduced motion there's no
 * printer: the receipt is there at once and fades without moving. A tap on the
 * receipt at any point stops it all and shows it in full in the middle of the
 * screen, over a dimmed Home, with Close and Open ride; that counts as the ride
 * being seen, so History doesn't glow for it.
 */
export function ReceiptFlight() {
  const flight = useReceiptFlight();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { updateRideBadges } = useRideHistory();
  const boxRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  /** The paper: still in the printer, or fed out. */
  const [fed, setFed] = useState(false);
  /** The printer: up out of view, or down in it. */
  const [printerIn, setPrinterIn] = useState(false);
  const [still, setStill] = useState(false);
  /** Tapped: shown in full, in the middle, until closed. */
  const [opened, setOpened] = useState(false);
  const onHome = pathname === '/';

  // Convoy badges are worked out by the receipt as it mounts.
  const rideId = flight?.rideId;
  const onBadgesEarned = useCallback(
    (badges: BadgeType[]) => {
      if (rideId && badges.length > 0) updateRideBadges(rideId, badges);
    },
    [rideId, updateRideBadges],
  );

  /** Where the paper comes out: the slot's middle, from the top of the screen. */
  const slotY = () => {
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
    return safeTop + PRINTER_TOP + PRINTER_H - SLOT_FROM_BOTTOM;
  };
  const printerW = () => Math.min(window.innerWidth * 0.94, 440);

  // The receipt fitted between the slot and the nav bar, and narrower than the slot.
  const fitScale = () => {
    const el = boxRef.current;
    if (!el) return 0.8;
    const room = window.innerHeight - slotY() - NAV_ROOM;
    return Math.max(0.3, Math.min(0.82, room / (el.offsetHeight || 1), (printerW() - 56) / (el.offsetWidth || 1)));
  };

  useLayoutEffect(() => {
    if (!flight) return;
    const quiet = isThermal() || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setStill(quiet);
    setFed(quiet);
    setPrinterIn(false);
    setOpened(false);
    setStyle({ opacity: 0, top: slotY(), transform: 'translate(-50%, 0) scale(0.8)' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  useEffect(() => {
    if (!flight || !onHome || opened) return;
    const quiet = isThermal() || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    // Down it jumps, and the paper (all still inside it) is placed under its slot.
    at(ARRIVE_MS, () => {
      if (!quiet) setPrinterIn(true);
      setStyle({ opacity: 1, top: slotY(), transform: `translate(-50%, 0) scale(${fitScale()})`, transition: quiet ? 'opacity 200ms' : undefined });
    });
    const printAt = ARRIVE_MS + PRINTER_IN_MS;
    if (!quiet) {
      at(printAt, () => {
        setFed(true);
        eventSound('print');
      });
      at(printAt + PRINT_MS + AFTER_PRINT_MS, () => setPrinterIn(false));
    }
    const flyAt = quiet ? ARRIVE_MS + 2400 : printAt + PRINT_MS + AFTER_PRINT_MS + PRINTER_OUT_MS + HOLD_MS;
    at(flyAt, () => {
      const target = [...document.querySelectorAll<HTMLElement>('[data-nav="history"]')].find((b) => b.offsetParent !== null);
      const r = target?.getBoundingClientRect();
      const visible = r && r.width > 0 && r.top < window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
      if (quiet || !r || !visible) {
        setStyle((p) => ({ ...p, opacity: 0, transition: 'opacity 300ms' }));
        return;
      }
      const el = boxRef.current;
      const h = el?.offsetHeight || 600;
      const scale = Math.max(0.02, Math.min(r.width / (el?.offsetWidth || 360), r.height / h) * 1.2);
      eventSound('whoosh');
      // Whizzes: slow to leave, then fast into the button (scaled from its top, so its top lands just above the
      // middle). Only the transform moves: animating left / top laid the whole receipt out again every frame.
      const dx = r.left + r.width / 2 - window.innerWidth / 2;
      const dy = r.top + r.height / 2 - (h * scale) / 2 - slotY();
      setStyle({
        opacity: 0.2,
        top: slotY(),
        transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(${scale}) rotate(-8deg)`,
        transition: `transform ${FLY_MS}ms cubic-bezier(0.6, 0, 0.9, 0.3), opacity ${FLY_MS}ms ease-in`,
      });
      at(FLY_MS - 60, () => {
        target!.classList.add('nav-catch');
        window.setTimeout(() => target!.classList.remove('nav-catch'), 500);
      });
    });
    at(flyAt + FLY_MS + 50, landReceipt);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight, onHome, opened]);

  // Tapped: everything stops (the effect above lets go of its timers), the printer goes up, and the
  // receipt comes to the middle in full.
  const open = () => {
    if (!flight || opened) return;
    setOpened(true);
    setFed(true);
    setPrinterIn(false);
    markRidesSeen([flight.rideId]);
    const el = boxRef.current;
    const s = Math.max(0.3, Math.min(0.92, (window.innerHeight - 170) / (el?.offsetHeight || 600), (window.innerWidth * 0.92) / (el?.offsetWidth || 360)));
    setStyle({
      opacity: 1,
      left: '50%',
      top: '46%',
      transformOrigin: '50% 50%',
      transform: `translate(-50%, -50%) scale(${s})`,
      transition: 'top 300ms ease-out, left 300ms ease-out, transform 300ms ease-out, opacity 200ms',
    });
  };
  const close = () => landReceipt();
  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && landReceipt();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opened]);

  // Home's backdrop, globe and tuner brake to a halt while the receipt is up and spin back up once it has
  // landed (or been closed): on a phone they and the receipt fought for frames.
  useEffect(() => {
    if (!flight || !onHome) return;
    setMotionHeld(true);
    return () => setMotionHeld(false);
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
    <>
      {opened && <div className="fixed inset-0 z-[59] bg-black/70 animate-fade-in" onClick={close} aria-hidden />}
      {/* The till printer: light grey, a thick dark slot, jumping down from the top of the screen and back up. */}
      {!still && (
        <div
          aria-hidden
          className="fixed z-[60] left-1/2 rounded-2xl border border-white/50 shadow-[0_10px_30px_rgba(0,0,0,0.55)] pointer-events-none"
          style={{
            top: `calc(var(--safe-top) + ${PRINTER_TOP}px)`,
            width: printerW(),
            height: PRINTER_H,
            background: 'linear-gradient(180deg, #d6d6dc 0%, #b4b4bc 55%, #9c9ca5 100%)',
            transform: `translate(-50%, ${printerIn ? '0' : `calc(-100% - ${PRINTER_TOP + 40}px)`})`,
            transition: printerIn
              ? `transform ${PRINTER_IN_MS}ms cubic-bezier(0.34, 1.7, 0.6, 1)`
              : `transform ${PRINTER_OUT_MS}ms cubic-bezier(0.5, -0.6, 0.75, 0.2)`,
          }}
        >
          {/* The lid's edge, the light and the slot. */}
          <span className="absolute left-3 right-3 top-[18px] h-px bg-black/15" />
          <span className="absolute right-5 top-[7px] w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          <span
            className="absolute left-[22px] right-[22px] rounded-full bg-[#0b0b0d] shadow-[inset_0_2px_4px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.5)]"
            style={{ bottom: SLOT_FROM_BOTTOM - 6, height: 12 }}
          />
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label={opened ? tr("Ride receipt") : tr("Show the receipt")}
        onClick={open}
        data-no-ui-sound
        className="fixed z-[61] w-[360px] text-left will-change-transform"
        style={{ left: '50%', transformOrigin: '50% 0', ...style }}
      >
        {/* The paper, out of the slot top first: it stays put and is shown from the top down, in steps, lying
            over the printer's front below the slot, so it comes out of the slot itself. A window slides down
            over it while the paper inside slides back by as much, both by transform, so nothing is painted
            again as it prints (a clip-path over a drop-shadow filter re-drew the whole receipt every step).
            The window is wider and taller than the paper by the shadow's reach. */}
        <div
          className="-mx-6 px-6 pb-8 overflow-hidden will-change-transform"
          style={{
            transform: fed ? 'translateY(0)' : 'translateY(-100%)',
            transition: still || opened ? undefined : `transform ${PRINT_MS}ms steps(${PRINT_STEPS}, end)`,
          }}
        >
        <div
          ref={boxRef}
          className="will-change-transform shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
          style={{
            transform: fed ? 'translateY(0)' : 'translateY(calc(100% + 2rem))',
            transition: still || opened ? undefined : `transform ${PRINT_MS}ms steps(${PRINT_STEPS}, end)`,
          }}
        >
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
      </div>
      {opened && (
        <div className="fixed z-[62] left-1/2 -translate-x-1/2 bottom-[calc(1.25rem+var(--safe-bottom))] flex gap-2 animate-fade-in">
          <Button variant="outline" className="h-12 px-5 rounded-2xl bg-card no-frost" onClick={close}>
            {tr("Close")}
          </Button>
          <Button
            className="h-12 px-5 rounded-2xl font-semibold"
            onClick={() => {
              landReceipt();
              navigate(`/ride/${flight.rideId}`);
            }}
          >
            {tr("Open ride")}
          </Button>
        </div>
      )}
    </>
  );
}
