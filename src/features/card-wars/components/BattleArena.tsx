import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CloudRain, Flag, Loader2, Swords, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { eventSound } from '@/lib/appSound';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { isThermal } from '@/lib/thermal';
import { cn } from '@/lib/utils';
import { CATEGORY_ICON, CATEGORY_ORDER, categoryLabel } from '../lib/ratings';
import { TAG_ICON, TAG_ORDER, tagEffect, tagName } from '../lib/tags';
import type { BattleCard as Card, Category, DogTag, TagPower } from '../types';
import { CardBurn } from './CardBurn';
import type { RoundEvent } from '../lib/events';
import { EVENT_ICON, eventEffect, eventName } from '../lib/eventText';
import { CwCard, StatBars } from './CwCard';

/** One settled round, played back: the two cards, the category drawn and what it did. */
export interface Reveal {
  id: string;
  player: Card;
  opponent: Card;
  category: Category;
  /** Second chance replayed the round: the category it was lost in first. */
  first?: Category;
  damage: number;
  /** 0: the player, 1: the rival, null: level. */
  winner: number | null;
  /** Health after the round, and before the hit (after any Pit medic). */
  hp: number[][];
  beforeHp?: number[][];
  /** What was compared, after dog tags, wear and rain. Null when the server didn't say. */
  values: [number, number] | null;
  /** The dog tag each side armed. */
  tags?: [TagPower | null, TagPower | null];
  /** Something that happened before the category was drawn. */
  event?: RoundEvent | null;
  /** A rapture: the card each side lost to the beam. */
  raptured?: [string | null, string | null];
}

type Phase = 'idle' | 'event' | 'beam' | 'spin' | 'replay' | 'clash' | 'done' | 'return';

const REEL_ROW = 34;
const quick = () => isThermal() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shown = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** A card leaves its place in a hand and lands in the middle of the table. */
function flyIn(el: HTMLElement | null, from: HTMLElement | null | undefined) {
  if (!el || !from || quick()) return;
  const a = from.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  if (!a.width || !b.width) return;
  el.animate(
    [
      { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` },
      { transform: 'none' },
    ],
    { duration: 380, easing: 'cubic-bezier(.2,.85,.3,1.12)' },
  );
  eventSound('whoosh');
}

/** And goes back. A burnt-out card just crumbles where it is. */
function flyOut(el: HTMLElement | null, to: HTMLElement | null | undefined, burnt: boolean): Promise<unknown> {
  if (!el || quick()) return Promise.resolve();
  if (burnt || !to) {
    return el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(18px) scale(.92)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => undefined);
  }
  const a = el.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!a.width || !b.width) return Promise.resolve();
  return el
    .animate([{ transform: 'none' }, { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width}, ${b.height / a.height})` }], {
      duration: 320,
      easing: 'cubic-bezier(.5,0,.6,1)',
      fill: 'forwards',
    })
    .finished.catch(() => undefined);
}

/**
 * A battle, the same for the computer and another player. Each side's hand is
 * a strip of five; the table between them is where it happens. A card tapped
 * in the hand comes out to the middle to be looked at, and Play sends it in:
 * the rival's card comes out to meet it, the category reel stops, the higher
 * rating hits, and the cards go back to their hands. One that's out of health
 * burns. Rounds are settled by the caller (the engine for the computer, the
 * server for players): this only plays the result back.
 */
export function BattleArena({
  player,
  opponent,
  hp,
  round,
  disabled,
  submitted,
  selected,
  tags,
  usedTags,
  tag,
  onTag,
  onPick,
  reveal,
  onRevealEnd,
  penalty,
  rivalName,
  forfeitLabel,
  onForfeit,
  note,
  gone,
}: {
  player: Card[];
  opponent: Card[];
  hp: number[][];
  round: number;
  disabled: boolean;
  /** Player battles: this round's card is in, waiting for the rival's. */
  submitted?: boolean;
  /** Player battles: the card that's in. */
  selected?: number | null;
  tags: DogTag[];
  usedTags: string[];
  tag: string | null;
  onTag: (id: string | null) => void;
  onPick: (index: number) => void;
  reveal: Reveal | null;
  onRevealEnd: () => void;
  /** Rain this round: a Lean win hits softer. */
  penalty?: boolean;
  rivalName: string;
  forfeitLabel: string;
  onForfeit: () => void;
  /** A line under the top bar (the clock in a player battle). */
  note?: ReactNode;
  /** Cards raptured earlier this battle: the player's, then the rival's. */
  gone?: [string[], string[]];
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [focus, setFocus] = useState<number | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const [sure, setSure] = useState(false);
  const [reelAt, setReelAt] = useState(0);

  const handRefs = useRef<(HTMLElement | null)[]>([]);
  const rivalRefs = useRef<(HTMLElement | null)[]>([]);
  const mineFly = useRef<HTMLDivElement>(null);
  const theirsFly = useRef<HTMLDivElement>(null);
  const finish = useRef(onRevealEnd);
  finish.current = onRevealEnd;
  const ended = useRef<string | null>(null);
  const skip = useRef<() => void>(() => undefined);

  // Which card each side has out in the middle.
  const mineIndex = reveal ? player.findIndex((c) => c.id === reveal.player.id) : submitted && selected != null ? selected : focus;
  const theirsIndex = reveal ? opponent.findIndex((c) => c.id === reveal.opponent.id) : submitted ? null : peek;
  const mineCard = mineIndex != null && mineIndex >= 0 ? player[mineIndex] : null;
  const theirsCard = theirsIndex != null && theirsIndex >= 0 ? opponent[theirsIndex] : null;

  useLayoutEffect(() => {
    if (mineCard && mineIndex != null) flyIn(mineFly.current, handRefs.current[mineIndex]);
    // Only when a different card comes out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineCard?.id]);
  useLayoutEffect(() => {
    if (theirsCard && theirsIndex != null) flyIn(theirsFly.current, rivalRefs.current[theirsIndex]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theirsCard?.id]);

  // Play a settled round back: reel, (replay,) hit, verdict, cards home.
  useEffect(() => {
    if (!reveal) {
      setPhase('idle');
      setReelAt(0);
      return;
    }
    setFocus(null);
    setPeek(null);
    const fast = quick();
    const turns = (n: number, c: Category) => n * CATEGORY_ORDER.length + CATEGORY_ORDER.indexOf(c);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
    let cancelled = false;
    let going = false;

    const myIndex = player.findIndex((c) => c.id === reveal.player.id);
    const theirIndex = opponent.findIndex((c) => c.id === reveal.opponent.id);
    const burnt = [reveal.hp[0]?.[myIndex] === 0, reveal.hp[1]?.[theirIndex] === 0];
    const home = () => {
      if (cancelled || going) return;
      going = true;
      setPhase('return');
      void Promise.all([flyOut(mineFly.current, handRefs.current[myIndex], burnt[0]), flyOut(theirsFly.current, rivalRefs.current[theirIndex], burnt[1])]).then(() => {
        if (cancelled || ended.current === reveal.id) return;
        ended.current = reveal.id;
        finish.current();
      });
    };
    skip.current = home;

    const ev = reveal.event ?? null;
    // The event card shows first; everything after it waits.
    const lead = ev ? (fast ? 900 : 1700) : 0;
    if (ev) {
      setPhase('event');
      eventSound('radioIn');
      haptics.medium();
    }
    if (ev === 'rapture') {
      at(lead, () => {
        setPhase('beam');
        eventSound('whoosh');
        haptics.heavy();
      });
      at(lead + (fast ? 900 : 2200), () => setPhase('done'));
      at(lead + (fast ? 2200 : 3600), home);
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }
    if (!ev) setPhase('spin');
    else at(lead, () => setPhase('spin'));
    const hit = () => {
      setPhase('clash');
      if (reveal.damage > 0) {
        haptics.heavy();
        eventSound('impact');
      }
    };
    const verdict = () => {
      setPhase('done');
      if (burnt[0] || burnt[1]) eventSound(burnt[0] ? 'error' : 'success');
    };
    if (fast) {
      // No reel, no flights: the result, long enough to read.
      setReelAt(turns(4, reveal.category));
      at(lead + 80, hit);
      at(lead + 220, verdict);
      at(lead + 1500, home);
    } else {
      setReelAt(0);
      const first = reveal.first;
      at(lead + 30, () => setReelAt(turns(2, first ?? reveal.category)));
      // A Second chance: the reel stops on the category that was lost, then goes round again.
      const base = lead + (first ? 1750 : 0);
      if (first) {
        at(lead + 1150, () => {
          setPhase('replay');
          eventSound('radioIn');
          haptics.medium();
        });
        at(lead + 1700, () => setReelAt(turns(4, reveal.category)));
      }
      at(base + 1200, hit);
      at(base + 1950, verdict);
      at(base + (burnt[0] || burnt[1] ? 3350 : 2950), home);
    }
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // One playback per settled round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.id]);

  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 3000);
    return () => clearTimeout(t);
  }, [sure]);

  const settled = phase === 'clash' || phase === 'done' || phase === 'return';
  const shownHp = reveal && settled ? reveal.hp : reveal?.beforeHp ?? hp;
  const locked = disabled || !!submitted || !!reveal;
  const mine = shownHp[0] ?? [];
  const theirs = shownHp[1] ?? [];
  const standing = (side: number[]) => side.filter((v) => v > 0).length;
  const armed = tags.find((t) => t.id === tag) ?? null;
  const orderedTags = [...tags].sort((a, b) => TAG_ORDER.indexOf(a.power) - TAG_ORDER.indexOf(b.power));
  const focusCard = !reveal && !submitted && focus !== null && (mine[focus] ?? 100) > 0 ? player[focus] : null;

  const reel = reveal ? Array.from({ length: 5 * CATEGORY_ORDER.length }, (_, i) => CATEGORY_ORDER[i % CATEGORY_ORDER.length]) : [];
  const DrawnIcon = reveal ? CATEGORY_ICON[reveal.category] : null;
  const live = reveal && settled ? reveal.category : reveal && phase === 'replay' ? reveal.first : null;
  const myTag = reveal?.tags?.[0] ?? null;
  const theirTag = reveal?.tags?.[1] ?? null;
  const mineOut = !!reveal && settled && reveal.hp[0]?.[mineIndex ?? -1] === 0;
  const theirsOut = !!reveal && settled && reveal.hp[1]?.[theirsIndex ?? -1] === 0;
  const burning = phase === 'done' && !quick();

  const tagChip = (power: TagPower, side: 'mine' | 'theirs') => {
    const Icon = TAG_ICON[power];
    return (
      <span className={cn('cw-armed', `cw-armed-${side}`)}>
        <Icon aria-hidden />
        {tagName(power)}
      </span>
    );
  };

  return (
    <div className={cn('cw-arena', penalty && 'cw-raining')} data-no-pull>
      <header className="cw-arena-bar">
        <Button
          variant={sure ? 'destructive' : 'outline'}
          size="sm"
          className="h-10 gap-1.5"
          disabled={disabled || !!reveal}
          onClick={() => {
            if (!sure) return setSure(true);
            setSure(false);
            onForfeit();
          }}
        >
          <Flag className="w-4 h-4" />
          {sure ? tr("Tap again to forfeit") : forfeitLabel}
        </Button>
        <p className="cw-arena-round" key={round}>
          {tr("Round")} <b className="font-mono">{round}</b>
        </p>
        <p className="cw-arena-score font-mono" aria-label={tr("Cards standing: you {0}, rival {1}", [standing(mine), standing(theirs)])}>
          <b>{standing(mine)}</b>
          <span>:</span>
          <b>{standing(theirs)}</b>
        </p>
      </header>
      {note && <p className="cw-arena-note">{note}</p>}

      <section className="cw-side cw-side-theirs">
        <p className="cw-side-label">
          <span>{rivalName}</span>
          <span>{tr("Tap a card to look")}</span>
        </p>
        <div className="cw-strip">
          {opponent.map((c, i) => (
            <CwCard
              key={c.id}
              ref={(el) => {
                rivalRefs.current[i] = el;
              }}
              card={c}
              size="thumb"
              hp={theirs[i] ?? 100}
              away={theirsIndex === i}
              disabled={!!reveal || !!submitted}
              onClick={() => {
                haptics.light();
                setFocus(null);
                setPeek(peek === i ? null : i);
              }}
            />
          ))}
        </div>
      </section>

      <section
        className={cn('cw-stage', `cw-phase-${phase}`)}
        onClick={() => {
          // The result can be tapped through once it's readable.
          if (reveal && phase === 'done') skip.current();
        }}
      >
        {penalty && (
          <p className="cw-rain">
            <CloudRain className="w-3.5 h-3.5" />
            {tr("Rain this round: a Lean win hits softer")}
          </p>
        )}

        <div className="cw-table">
          {mineCard ? (
            <div className={cn('cw-seat cw-seat-mine', reveal && phase === 'clash' && (reveal.winner === 0 ? 'cw-lunge-right' : reveal.winner === 1 ? 'cw-struck' : ''))}>
              <div ref={mineFly} className="cw-flyer" key={mineCard.id}>
                <CwCard
                  card={mineCard}
                  hp={mine[mineIndex ?? 0] ?? 100}
                  highlight={live}
                  className={cn(mineOut && phase !== 'clash' && 'cw-charred')}
                  onClick={focusCard ? () => setFocus(null) : undefined}
                />
                {myTag && reveal && tagChip(myTag, 'mine')}
                {reveal && settled && reveal.winner === 1 && reveal.damage > 0 && <span className="cw-damage font-mono">−{reveal.damage}</span>}
                {mineOut && burning && <CardBurn />}
              </div>
            </div>
          ) : null}

          {reveal && DrawnIcon ? (
            <div className="cw-mid">
              {phase === 'replay' && <p className="cw-second">{tr("Second chance!")}</p>}
              <div className={cn('cw-reel', settled && 'cw-reel-set')} aria-label={tr("Category drawn")}>
                <div className="cw-reel-track" style={{ transform: `translateY(-${reelAt * REEL_ROW}px)` }}>
                  {reel.map((c, i) => (
                    <span key={i} className="cw-reel-item">
                      {categoryLabel(c)}
                    </span>
                  ))}
                </div>
              </div>
              {settled ? <DrawnIcon className="cw-duel-icon" aria-hidden /> : <Swords className="cw-duel-icon" aria-hidden />}
              {reveal.values ? (
                <p className="cw-duel-score font-mono">
                  {settled ? (
                    <>
                      <b className={reveal.winner === 0 ? 'cw-won-text' : reveal.winner === 1 ? 'cw-lost-text' : undefined}>{shown(reveal.values[0])}</b>
                      <span>:</span>
                      <b className={reveal.winner === 1 ? 'cw-won-text' : reveal.winner === 0 ? 'cw-lost-text' : undefined}>{shown(reveal.values[1])}</b>
                    </>
                  ) : (
                    <span>? : ?</span>
                  )}
                </p>
              ) : (
                <p className="cw-duel-score cw-duel-vs">{tr("vs")}</p>
              )}
            </div>
          ) : null}

          {theirsCard ? (
            <div className={cn('cw-seat cw-seat-theirs', reveal && phase === 'clash' && (reveal.winner === 1 ? 'cw-lunge-left' : reveal.winner === 0 ? 'cw-struck' : ''))}>
              <div ref={theirsFly} className="cw-flyer" key={theirsCard.id}>
                <CwCard
                  card={theirsCard}
                  hp={theirs[theirsIndex ?? 0] ?? 100}
                  highlight={live}
                  className={cn(theirsOut && phase !== 'clash' && 'cw-charred')}
                  onClick={!reveal ? () => setPeek(null) : undefined}
                />
                {theirTag && reveal && tagChip(theirTag, 'theirs')}
                {reveal && settled && reveal.winner === 0 && reveal.damage > 0 && <span className="cw-damage font-mono">−{reveal.damage}</span>}
                {theirsOut && burning && <CardBurn />}
              </div>
            </div>
          ) : null}

          {!reveal && (focusCard || (theirsCard && !submitted)) ? (
            <div className={cn('cw-info', theirsCard && 'cw-info-left')}>
              <StatBars card={(focusCard ?? theirsCard)!} />
              {theirsCard && <p className="cw-info-note">{tr("{0}'s card", [rivalName])}</p>}
            </div>
          ) : null}

          {!reveal && submitted ? (
            <div className="cw-info cw-info-wait">
              <Loader2 className="w-7 h-7 text-accent animate-spin" />
              <h2>{tr("Card locked in")}</h2>
              <p>{tr("Waiting for your rival to play.")}</p>
            </div>
          ) : null}

          {!reveal && !submitted && !focusCard && !theirsCard ? (
            <div className="cw-prompt">
              <h2>{tr("Pick a card from your hand")}</h2>
              <p>{tr("A category is drawn after you play. The higher rating wins the round and damages the other card.")}</p>
              <div className="cw-cat-row">
                {CATEGORY_ORDER.map((c) => {
                  const Icon = CATEGORY_ICON[c];
                  return (
                    <span key={c}>
                      <Icon aria-hidden />
                      {categoryLabel(c)}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="cw-below">
          {reveal ? (
            <p className={cn('cw-verdict', (phase === 'done' || phase === 'return') && (reveal.winner === 0 ? 'cw-won-text' : reveal.winner === 1 ? 'cw-lost-text' : ''))} aria-live="polite">
              {phase === 'replay'
                ? tr("Lost on {0}. Drawing again…", [categoryLabel(reveal.first ?? reveal.category)])
                : phase !== 'done' && phase !== 'return'
                  ? tr("Drawing the category…")
                  : reveal.winner === 0
                    ? theirsOut
                      ? tr("Knocked out! {0} damage dealt", [reveal.damage])
                      : tr("You win the round: {0} damage dealt", [reveal.damage])
                    : reveal.winner === 1
                      ? mineOut
                        ? tr("Your card is out: {0} damage taken", [reveal.damage])
                        : tr("You lose the round: {0} damage taken", [reveal.damage])
                      : tr("A tie: no damage")}
            </p>
          ) : focusCard ? (
            <>
              <Button variant="outline" className="h-12 w-12 p-0 shrink-0" aria-label={tr("Put it back")} onClick={() => setFocus(null)}>
                <Undo2 className="w-5 h-5" />
              </Button>
              <Button
                className="h-12 flex-1 text-base font-bold gap-2"
                disabled={locked}
                onClick={() => {
                  if (focus === null) return;
                  haptics.medium();
                  onPick(focus);
                }}
              >
                <Swords className="w-5 h-5" />
                {armed ? tr("Play with {0}", [tagName(armed.power)]) : tr("Play this card")}
              </Button>
            </>
          ) : theirsCard && !submitted ? (
            <Button variant="outline" className="h-12 flex-1 gap-2" onClick={() => setPeek(null)}>
              <X className="w-4 h-4" />
              {tr("Close")}
            </Button>
          ) : null}
        </div>
      </section>

      <div className="cw-tags" role="group" aria-label={tr("Dog tags")}>
        {orderedTags.map((t) => {
          const Icon = TAG_ICON[t.power];
          const used = usedTags.includes(t.id);
          const on = tag === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={cn('cw-tag', on && 'cw-tag-on', used && 'cw-tag-used')}
              disabled={locked || used}
              aria-pressed={on}
              onClick={() => {
                haptics.light();
                eventSound(on ? 'unlock' : 'lock');
                onTag(on ? null : t.id);
              }}
            >
              <Icon aria-hidden />
              <span>
                <b>{tagName(t.power)}</b>
                <small>{used ? tr("Used") : tagEffect(t, focusCard)}</small>
              </span>
            </button>
          );
        })}
      </div>

      <section className="cw-side cw-side-mine">
        <p className="cw-side-label">
          <span>{tr("Your hand")}</span>
          <span>{armed ? tr("{0} armed for this round", [tagName(armed.power)]) : tr("Arm a dog tag before you play")}</span>
        </p>
        <div className="cw-strip">
          {player.map((c, i) => (
            <CwCard
              key={c.id}
              ref={(el) => {
                handRefs.current[i] = el;
              }}
              card={c}
              size="thumb"
              hp={mine[i] ?? 100}
              away={mineIndex === i}
              disabled={locked || (mine[i] ?? 100) === 0}
              onClick={() => {
                haptics.light();
                setPeek(null);
                setFocus(focus === i ? null : i);
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
