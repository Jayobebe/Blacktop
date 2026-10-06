import { useEffect, useMemo, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { haptics } from '@/lib/haptics';
import { eventSound } from '@/lib/appSound';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { QUICK } from '../lib/rules';
import { CATEGORY_ICON, categoryLabel } from '../lib/ratings';
import type { BattleCard, Category, QuickMode } from '../types';
import { modeBlurb, modeName } from './BattleSetupSheet';
import { CwCard } from './CwCard';
import { SpinReel } from './SpinReel';

/** Lean only counts between two bikes, so it's never the theme. */
const THEMES: Category[] = ['speed', 'corners', 'g', 'distance'];

/**
 * Quick play, before the battle: a wheel lands on the theme (the category
 * that will come up most), then every card the player has is laid out best at
 * that category first, and the clock runs while they pick five. When it runs
 * out, the best cards left fill the deck. The deck is for this battle only.
 */
export function QuickPlay({ mode, pool, fixedTheme, onStart, onCancel }: { mode: QuickMode; pool: BattleCard[]; /** The daily challenge's theme: the wheel lands on it. */ fixedTheme?: Category; onStart: (deck: BattleCard[], theme: Category) => void; onCancel: () => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = useMemo(() => fixedTheme ?? THEMES[Math.floor(Math.random() * THEMES.length)], []);
  const labels = useMemo(() => THEMES.map((c) => categoryLabel(c)), []);
  const [building, setBuilding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [left, setLeft] = useState<number>(QUICK.buildSeconds);
  const sorted = useMemo(() => [...pool].sort((a, b) => b.ratings[theme] - a.ratings[theme]), [pool, theme]);
  const Icon = CATEGORY_ICON[theme];

  const go = useRef<(ids: string[]) => void>(() => {});
  go.current = (ids) => {
    // Out of time: the best at the theme not yet picked make up the five.
    const fill = [...ids, ...sorted.map((c) => c.id).filter((id) => !ids.includes(id))].slice(0, 5);
    onStart(fill.map((id) => pool.find((c) => c.id === id)!).filter(Boolean), theme);
  };
  const pickedRef = useRef(picked);
  pickedRef.current = picked;

  useEffect(() => {
    if (!building) return;
    const end = Date.now() + QUICK.buildSeconds * 1000;
    const t = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s <= 3 && s > 0) eventSound('beep');
      if (s === 0) {
        window.clearInterval(t);
        go.current(pickedRef.current);
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [building]);

  const toggle = (id: string) => {
    haptics.light();
    setPicked((all) => (all.includes(id) ? all.filter((x) => x !== id) : all.length < 5 ? [...all, id] : all));
  };

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom max-w-3xl mx-auto w-full gap-4">
      <PageHeader title={fixedTheme ? tr("Daily challenge") : tr("Quick play")} subtitle={`${modeName(mode)} · ${modeBlurb(mode)}`} onBack={onCancel} />

      {!building ? (
        <section className="cw-panel cw-panel-hero items-center text-center my-auto">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{fixedTheme ? tr("Today's theme") : tr("This battle's theme")}</p>
          <SpinReel result={categoryLabel(theme)} labels={labels} onDone={() => setBuilding(true)} />
          <p className="text-xs text-muted-foreground max-w-xs">{tr("The theme comes up in most rounds. Build for it.")}</p>
        </section>
      ) : (
        <>
          <section className="cw-quick-bar">
            <span className="cw-quick-theme">
              <Icon aria-hidden />
              <span>
                <small>{tr("Theme")}</small>
                <b>{categoryLabel(theme)}</b>
              </span>
            </span>
            <span className={cn('cw-quick-clock font-mono', left <= 5 && 'cw-quick-clock-low')} role="timer" aria-label={tr("{0} seconds left", [left])}>
              <Timer aria-hidden />
              {left}
            </span>
            <Button className="h-12 px-5 font-bold" disabled={picked.length !== 5} onClick={() => go.current(picked)}>
              {picked.length === 5 ? tr("Battle") : tr("{0} of 5", [picked.length])}
            </Button>
          </section>
          <p className="text-[11px] text-muted-foreground -mt-2">{tr("Best at the theme first. Tap five; when the clock runs out, the best ones left fill your deck.")}</p>
          <div className="cw-grid">
            {sorted.map((c) => (
              <CwCard key={c.id} card={c} highlight={theme} selected={picked.includes(c.id)} showCondition onClick={() => toggle(c.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
