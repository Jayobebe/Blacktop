import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { markTipsSeen, skipAllTips, useTipsDue } from '../lib/guideStore';

export interface PageTip {
  /** What it points at: a CSS selector, usually `[data-tip="name"]`. A tip whose target isn't on screen is passed over. */
  target: string;
  text: string;
}

/** At most this many to a page: only what isn't obvious. */
export const TIPS_PER_PAGE = 3;
const GAP = 10;

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

/**
 * The control a tip is about. It may be on the page twice (a copy for each way
 * up, one of them hidden): the first with any size that isn't off to one side.
 * `anywhere`: one that's scrolled out of view up or down still counts.
 */
function find(selector: string, anywhere: boolean): HTMLElement | null {
  let below: HTMLElement | null = null;
  for (const candidate of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const rect = candidate.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4 || rect.right < 0 || rect.left > window.innerWidth) continue;
    if (rect.bottom >= 0 && rect.top <= window.innerHeight) return candidate;
    below ??= candidate;
  }
  return anywhere ? below : null;
}

function locate(selector: string): Spot | null {
  const el = find(selector, false);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12, Math.min(r.width, r.height) / 2);
  return { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12, radius: radius + 6 };
}

/** The page whose tips are up. A page can mount two sets (History, the Garage, Track Day); they take turns. */
let busy: string | null = null;

/**
 * A page's first-time tips. Mount it on the page with up to three tips; the
 * first time the page is open (and `when` holds) it dims the screen, lights
 * the control each tip is about and says one sentence, with Next and Skip all.
 * Nothing shows again once they've been through or skipped. It waits for the
 * page to settle, and for any dialog to be out of the way, before starting.
 */
export function PageTips({ page, tips, when = true, max = TIPS_PER_PAGE, onShowing, scroll = false }: { page: string; tips: PageTip[]; /** Hold the tips back (and hide them at once) while this is false. */ when?: boolean; /** More than the usual three, for a page that walks through a toolbar. */ max?: number; /** Told when the tips come up and when they're put away (the ride screen pauses its clock meanwhile). */ onShowing?: (showing: boolean) => void; /** On a page that scrolls: a tip about something further down brings it into view first. Not for Home, which must never scroll. */ scroll?: boolean }) {
  const due = useTipsDue(page);
  const list = tips.slice(0, max);
  const [step, setStep] = useState<number | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(120);
  const tipsRef = useRef(list);
  tipsRef.current = list;

  /** The first tip from `from` whose target is on screen. */
  const next = (from: number): number | null => {
    for (let i = from; i < tipsRef.current.length; i++) if (find(tipsRef.current[i].target, scroll)) return i;
    return null;
  };

  // Start once the page has settled and nothing else is asking for attention.
  useEffect(() => {
    if (!due || !when || step !== null) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (busy !== null || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const first = next(0);
      if (first !== null) {
        window.clearInterval(timer);
        // Taken here and now: the other set's timer may fire before this one has drawn.
        busy = page;
        setStep(first);
      } else if (++tries > 12) {
        // Nothing here to point at: don't keep looking.
        window.clearInterval(timer);
      }
    }, 700);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, when, step]);

  // Held back mid-way (the rider set off, a dialog opened): put them away; they'll start again later.
  useEffect(() => {
    if ((!when || !due) && step !== null) setStep(null);
  }, [when, due, step]);

  useLayoutEffect(() => {
    if (step === null) return;
    const place = () => setSpot(locate(tipsRef.current[step]?.target ?? ''));
    if (scroll) {
      const el = find(tipsRef.current[step]?.target ?? '', true);
      const r = el?.getBoundingClientRect();
      if (el && r && (r.top < 70 || r.bottom > window.innerHeight - 170)) el.scrollIntoView({ block: 'center' });
    }
    place();
    window.addEventListener('resize', place);
    const again = window.setInterval(place, 500);
    return () => {
      window.removeEventListener('resize', place);
      window.clearInterval(again);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
  }, [step, spot]);

  const showing = due && when && step !== null;
  const tell = useRef(onShowing);
  tell.current = onShowing;
  useEffect(() => {
    if (!showing) return;
    tell.current?.(true);
    return () => tell.current?.(false);
  }, [showing]);
  // Hand over to the page's other set once these are done, put away or gone with the page.
  useEffect(() => {
    if (step === null) return;
    busy = page;
    return () => {
      if (busy === page) busy = null;
    };
  }, [step, page]);

  if (!due || !when || step === null || !spot) return null;
  const tip = list[step];
  if (!tip) return null;
  // "4 of 11": counting only the tips whose control is on this rider's screen.
  const position = list.slice(0, step + 1).filter((t, i) => i === step || find(t.target, scroll)).length;
  const shown = position + list.slice(step + 1).filter((t) => find(t.target, scroll)).length;
  const last = next(step + 1) === null;

  const advance = () => {
    haptics.light();
    const to = next(step + 1);
    if (to === null) {
      markTipsSeen(page);
      setStep(null);
    } else setStep(to);
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw - 24);
  const left = Math.min(vw - width - 12, Math.max(12, spot.x + spot.w / 2 - width / 2));
  // Under the control where there's room, else above it, else wherever fits.
  const below = spot.y + spot.h + GAP;
  const top = below + cardH <= vh - 12 ? below : spot.y - GAP - cardH >= 12 ? spot.y - GAP - cardH : Math.max(12, vh - cardH - 12);

  return createPortal(
    <div className="fixed inset-0 z-[8000]" role="dialog" aria-modal="true" aria-label={tr("Tip")} data-no-pull onClick={advance}>
      {/* The lit control: everything else is dimmed by its shadow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h, borderRadius: spot.radius, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.72), 0 0 0 2px hsl(var(--accent))' }}
      />
      <div
        ref={card}
        className="absolute rounded-2xl border border-accent/50 bg-[hsl(240_6%_9%)] p-3.5 shadow-2xl"
        style={{ left, top, width }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm leading-snug text-foreground">{tip.text}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">{tr("{0} of {1}", [position, shown])}</span>
          <button
            type="button"
            className="ml-auto min-h-11 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              skipAllTips();
              setStep(null);
            }}
          >
            {tr("Skip all tips")}
          </button>
          <button type="button" className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground" onClick={advance}>
            {last ? tr("Got it") : tr("Next")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
