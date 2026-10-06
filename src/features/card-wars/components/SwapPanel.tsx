import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeftRight, Check, Loader2, ScanLine, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { eventSound } from '@/lib/appSound';
import { shareOrigin } from '@/lib/platform';
import { loadQrScanner } from '@/lib/qrScanner';
import { tr } from '@/lib/i18n';
import { RPM_SCALE, baseRpm, showRpm } from '../lib/rules';
import { cn } from '@/lib/utils';
import { cardById } from '../lib/catalog';
import { refreshShop, setRpm, useShop } from '../lib/shop';
import { getVault, updateVault } from '../lib/store';
import { SWAP_LIMIT, cancelSwap, joinSwap, mySwaps, openSwap, readySwap, setSwap, swapLink, viewSwap, type Swap } from '../lib/swap';
import { CwCard } from './CwCard';

function why(message: string): string {
  if (message === 'demo') return '';
  if (/not enough/i.test(message)) return tr("Not enough RPM");
  if (/not found/i.test(message)) return tr("That swap isn't open any more.");
  if (/full/i.test(message)) return tr("That swap already has two riders.");
  if (/already owned/i.test(message)) return tr("One of the cards is already owned by the rider getting it.");
  if (/not owned/i.test(message)) return tr("One of the cards isn't owned any more.");
  if (/current battle/i.test(message)) return tr("Finish your current battle first.");
  if (/too many/i.test(message)) return tr("Too many open swaps. Close one first.");
  if (/nothing/i.test(message)) return tr("Add a card or some RPM first.");
  return tr("Something went wrong. Try again.");
}

const CODE = /^[A-F0-9]{6}$/i;
function codeFrom(text: string): string | null {
  const raw = text.trim();
  if (CODE.test(raw)) return raw.toUpperCase();
  try {
    const v = new URL(raw).searchParams.get('swap');
    return v && CODE.test(v) ? v.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** A card-for-card swap: open one or join by code, fill your five slots, both tap Ready. */
export function SwapPanel({ demo, locked }: { demo: boolean; locked?: boolean }) {
  const shop = useShop();
  const [swap, setSwapState] = useState<Swap | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [scan, setScan] = useState(false);
  const [rpm, setRpmInput] = useState('0');
  const given = useRef<string[]>([]);

  const take = (s: Swap | string) => {
    if (typeof s === 'string') {
      const w = why(s);
      if (w) toast.error(w);
      return;
    }
    if (s.status === 'done' && swap?.status !== 'done') {
      // The cards this side gave leave the deck and winnings on this phone too.
      const gone = new Set(s.mine.cards);
      const v = getVault();
      updateVault({ deck: v.deck.filter((x) => !gone.has(x)), rewards: v.rewards.filter((x) => !gone.has(x)) });
      eventSound('success');
      toast.success(tr("Swap done"), { description: tr("Your new cards are in your collection.") });
      void refreshShop();
    }
    if (typeof s.balance === 'number') setRpm(s.balance);
    given.current = s.mine.cards;
    setSwapState(s);
  };

  // Pick an open swap back up.
  useEffect(() => {
    void mySwaps().then((ids) => {
      if (ids[0]) void viewSwap(ids[0]).then(take);
    });
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch the other side while the swap is open.
  useEffect(() => {
    if (!swap || swap.status !== 'open') return;
    const t = setInterval(() => void viewSwap(swap.id).then(take), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swap?.id, swap?.status]);

  useEffect(() => {
    if (!scan) return;
    let cancelled = false;
    let scanner: InstanceType<Awaited<ReturnType<typeof loadQrScanner>>> | null = null;
    void (async () => {
      try {
        const Qr = await loadQrScanner();
        if (cancelled) return;
        scanner = new Qr('cw-swap-scanner');
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: 220 },
          (text) => {
            const c = codeFrom(text);
            if (c) {
              setCode(c);
              setScan(false);
            }
          },
          () => undefined,
        );
      } catch {
        setScan(false);
        toast.error(tr("Could not access camera"));
      }
    })();
    return () => {
      cancelled = true;
      const s = scanner;
      if (s)
        void (async () => {
          if (s.isScanning) await s.stop();
          s.clear();
        })().catch(() => undefined);
    };
  }, [scan]);

  const run = async (job: () => Promise<Swap | string | void>) => {
    if (busy) return;
    setBusy(true);
    const r = await job();
    setBusy(false);
    if (r) take(r);
  };

  if (!swap || swap.status !== 'open') {
    const c = codeFrom(code);
    return (
      <div className="space-y-4">
        {swap?.status === 'done' && <p className="cw-panel text-sm text-center">{tr("Swap done. Your new cards are in your collection.")}</p>}
        <p className="text-xs text-muted-foreground">{tr("Swap up to five cards each way, with RPM on top if you like. Nothing moves until you both tap Ready.")}</p>
        <Button className="w-full h-12 gap-2" disabled={demo || busy || locked} onClick={() => void run(openSwap)}>
          <ArrowLeftRight className="w-5 h-5" />
          {tr("Start a swap")}
        </Button>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Got a swap code?")}</p>
          <div className="flex gap-2">
            <Input aria-label={tr("Swap code")} placeholder={tr("Swap code")} value={code} disabled={demo} maxLength={80} onChange={(e) => setCode(e.target.value)} className="h-12 font-mono uppercase" />
            <Button variant="outline" className="h-12 w-12 p-0 shrink-0" disabled={demo} onClick={() => setScan(!scan)} aria-label={tr("Scan swap QR")} aria-pressed={scan}>
              <ScanLine className="w-5 h-5" />
            </Button>
          </div>
          {scan && <div id="cw-swap-scanner" className="overflow-hidden rounded-2xl" />}
          <Button variant="outline" className="w-full h-12" disabled={demo || busy || !c || locked} onClick={() => c && void run(() => joinSwap(c))}>
            {tr("Join swap")}
          </Button>
        </div>
      </div>
    );
  }

  const mine = swap.mine.cards;
  const toggle = (id: string) => {
    const next = mine.includes(id) ? mine.filter((x) => x !== id) : mine.length < SWAP_LIMIT ? [...mine, id] : null;
    if (!next) return toast(tr("Five cards at most"));
    void run(() => setSwap(swap.id, next, swap.mine.rpm));
  };
  // Typed as it's shown; sent as the server counts it.
  const amount = Math.max(0, baseRpm(Number(rpm) || 0));
  const collection = shop.owned.filter((id) => cardById(id));

  const Side = ({ title, cards, extra, ready }: { title: string; cards: string[]; extra: number; ready: boolean }) => (
    <section className="space-y-1.5">
      <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span>{title}</span>
        <span className={cn('flex items-center gap-1', ready ? 'text-accent' : '')}>
          {ready ? <Check className="w-3.5 h-3.5" /> : null}
          {ready ? tr("Ready") : tr("Not ready")}
        </span>
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: SWAP_LIMIT }, (_, i) => {
          const card = cards[i] ? cardById(cards[i]) : undefined;
          return card ? <CwCard key={cards[i]} card={card} size="thumb" /> : <div key={i} className="cw-slot aspect-[5/7] min-h-0" aria-hidden />;
        })}
      </div>
      {extra > 0 && <p className="text-xs font-mono text-accent">+ {showRpm(extra)} RPM</p>}
    </section>
  );

  return (
    <div className="space-y-4">
      {!swap.joined ? (
        <div className="space-y-2 text-center">
          <div className="mx-auto w-fit rounded-2xl bg-white p-3">
            <QRCodeSVG value={swapLink(shareOrigin(), swap.code)} size={160} />
          </div>
          <p className="font-mono text-xl tracking-widest text-accent">{swap.code}</p>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
            {tr("Waiting for the other rider to join…")}
          </p>
        </div>
      ) : null}

      <Side title={swap.theirs.name ? tr("{0} gives", [swap.theirs.name]) : tr("They give")} cards={swap.theirs.cards} extra={swap.theirs.rpm} ready={swap.theirs.ready} />
      <Side title={tr("You give")} cards={mine} extra={swap.mine.rpm} ready={swap.mine.ready} />

      <div className="flex gap-2">
        <Input type="number" inputMode="numeric" min={0} step={RPM_SCALE} aria-label={tr("RPM you add")} value={rpm} onChange={(e) => setRpmInput(e.target.value)} className="h-11 font-mono" />
        <Button variant="outline" className="h-11 shrink-0" disabled={busy || amount === swap.mine.rpm || amount > (shop.balance ?? 0)} onClick={() => void run(() => setSwap(swap.id, mine, amount))}>
          {tr("Add RPM")}
        </Button>
      </div>

      <section className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Tap your cards to add or take back")}</p>
        {collection.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("Cards you've won, bought or spun can be swapped.")}</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {collection.map((id) => (
              <CwCard key={id} card={cardById(id)!} size="thumb" selected={mine.includes(id)} disabled={busy} onClick={() => toggle(id)} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button variant="outline" className="h-12 w-12 p-0" aria-label={tr("Cancel swap")} disabled={busy} onClick={() => void run(async () => {
          await cancelSwap(swap.id);
          return viewSwap(swap.id);
        })}>
          <X className="w-5 h-5" />
        </Button>
        <Button className="h-12 gap-2" variant={swap.mine.ready ? 'outline' : 'default'} disabled={busy || !swap.joined || locked} onClick={() => void run(() => readySwap(swap.id, !swap.mine.ready))}>
          <Check className="w-5 h-5" />
          {swap.mine.ready ? tr("Not ready yet") : tr("Ready to swap")}
        </Button>
      </div>
    </div>
  );
}
