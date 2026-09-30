import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { checkAlarmPattern, MIN_PATTERN_DOTS, saveAlarmPattern } from '../lib/pattern';
import { usePatternGate } from '../lib/patternGate';
import { PatternLock } from './PatternLock';

/**
 * The unlock pattern, asked for outside the alarm (see lib/patternGate).
 * Mounted once in App.tsx. Setting draws it twice; checking allows retries,
 * with a short pause after three misses.
 */
export function PatternGateDialog() {
  const req = usePatternGate();
  const [tone, setTone] = useState<'idle' | 'error' | 'success'>('idle');
  const [clearKey, setClearKey] = useState(0);
  const [first, setFirst] = useState<number[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const misses = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    setTone('idle');
    setFirst(null);
    setMessage(null);
    misses.current = 0;
    setClearKey((k) => k + 1);
  }, [req]);

  // Re-render once a lock-out ends.
  const [, force] = useState(0);
  useEffect(() => {
    if (!lockedUntil) return;
    const id = window.setTimeout(() => force((n) => n + 1), Math.max(0, lockedUntil - Date.now()) + 50);
    return () => window.clearTimeout(id);
  }, [lockedUntil]);
  const locked = Date.now() < lockedUntil;

  const settle = (t: 'error' | 'success', msg: string | null, then?: () => void) => {
    setTone(t);
    setMessage(msg);
    busy.current = true;
    window.setTimeout(() => {
      busy.current = false;
      setTone('idle');
      setClearKey((k) => k + 1);
      then?.();
    }, t === 'success' ? 300 : 900);
  };

  const onDone = async (p: number[]) => {
    if (!req || busy.current || locked) return;
    if (req.mode === 'set') {
      if (p.length < MIN_PATTERN_DOTS) return settle('error', tr("Join at least 4 dots"));
      if (!first) {
        setFirst(p);
        setMessage(tr("Draw it again to confirm"));
        setClearKey((k) => k + 1);
        return;
      }
      if (first.join() !== p.join()) {
        setFirst(null);
        return settle('error', tr("Those didn't match. Start again."));
      }
      await saveAlarmPattern(p);
      haptics.success();
      return settle('success', null, () => req.resolve(true));
    }
    if (await checkAlarmPattern(p)) {
      haptics.success();
      return settle('success', null, () => req.resolve(true));
    }
    haptics.error();
    misses.current += 1;
    if (misses.current % 3 === 0) {
      setLockedUntil(Date.now() + 30_000);
      return settle('error', tr("Too many tries. Wait 30 seconds."));
    }
    settle('error', tr("Wrong pattern"));
  };

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && req?.resolve(false)}>
      <DialogContent data-no-ui-sound className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <Lock className="w-8 h-8 text-destructive" aria-hidden />
          <DialogTitle>{req?.title}</DialogTitle>
          <DialogDescription>{message ?? req?.reason}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          <PatternLock onDone={onDone} tone={tone} clearKey={clearKey} disabled={locked} className="w-[min(72vw,260px)]" />
        </div>
        <Button variant="outline" className="min-h-[48px]" onClick={() => req?.resolve(false)}>
          {tr("Cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
