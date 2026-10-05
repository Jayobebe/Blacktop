import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Loader2, ScanLine, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DemoLockNote, useDemoLocked } from '@/components/DemoLock';
import { eventSound } from '@/lib/appSound';
import { shareOrigin } from '@/lib/platform';
import { loadQrScanner } from '@/lib/qrScanner';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { cardById } from '../lib/catalog';
import { useShop } from '../lib/shop';
import { SALE_CODE, answerOffer, cancelSale, listCard, makeOffer, myTrades, saleLink, viewSale, withdrawOffer, type MyOffer, type Sale, type SaleView } from '../lib/trade';
import { CwCard } from './CwCard';
import { SwapPanel } from './SwapPanel';

function why(code: string): string {
  switch (code) {
    case 'rpm':
      return tr("Not enough RPM");
    case 'gone':
      return tr("That sale isn't open any more.");
    case 'owned':
      return tr("You already own that card.");
    case 'self':
      return tr("That's your own card.");
    case 'many':
      return tr("Too many open sales or offers. Close some first.");
    case 'battle':
      return tr("Finish your current battle first.");
    case 'notowned':
      return tr("You don't own that card any more.");
    default:
      return tr("Something went wrong. Try again.");
  }
}

/** A typed code, or a scanned sale link. */
function codeFrom(text: string): string | null {
  const raw = text.trim();
  if (SALE_CODE.test(raw)) return raw.toUpperCase();
  try {
    const v = new URL(raw).searchParams.get('sale');
    return v && SALE_CODE.test(v) ? v.toUpperCase() : null;
  } catch {
    return null;
  }
}

const statusText = (s: MyOffer['status']) =>
  s === 'pending' ? tr("Waiting") : s === 'accepted' ? tr("Bought") : s === 'declined' ? tr("Declined") : s === 'expired' ? tr("Expired") : tr("Withdrawn");

/**
 * Selling and buying cards between players: the seller shows a code for one
 * card, buyers offer RPM, the seller picks. The server holds the RPM and moves
 * the card; nothing about anyone's rides changes hands.
 */
export function TradeSheet({ open, onClose, locked }: { open: boolean; onClose: () => void; locked?: boolean }) {
  const demo = useDemoLocked();
  const shop = useShop();
  const [mine, setMine] = useState<{ selling: Sale[]; buying: MyOffer[] }>({ selling: [], buying: [] });
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [scan, setScan] = useState(false);
  const [sale, setSale] = useState<SaleView | null>(null);
  const [offer, setOffer] = useState('');
  const [showing, setShowing] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const t = await myTrades();
    if (t) setMine(t);
  }, []);

  useEffect(() => {
    if (!open) {
      setScan(false);
      return;
    }
    void reload();
    const timer = setInterval(() => void reload(), 6000);
    return () => clearInterval(timer);
  }, [open, reload]);

  // The scanner library loads the moment a scan starts.
  useEffect(() => {
    if (!scan) return;
    let cancelled = false;
    let scanner: InstanceType<Awaited<ReturnType<typeof loadQrScanner>>> | null = null;
    void (async () => {
      try {
        const Qr = await loadQrScanner();
        if (cancelled) return;
        scanner = new Qr('cw-trade-scanner');
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

  // A full code looks the sale up straight away.
  useEffect(() => {
    const c = codeFrom(code);
    if (!c || demo) {
      setSale(null);
      return;
    }
    let stale = false;
    void viewSale(c).then((v) => {
      if (stale) return;
      if (typeof v === 'string') {
        setSale(null);
        if (v !== 'demo') toast.error(why(v));
      } else {
        setSale(v);
        setOffer(v.myOffer ? String(v.myOffer) : String(cardById(v.card)?.price ?? 50));
      }
    });
    return () => {
      stale = true;
    };
  }, [code, demo]);

  const run = async (job: () => Promise<string | null | void>, ok?: string) => {
    if (busy) return;
    setBusy(true);
    const err = await job();
    setBusy(false);
    if (err && err !== 'demo') toast.error(why(err));
    else if (!err && ok) {
      eventSound('coin');
      toast.success(ok);
    }
    void reload();
  };

  const sellable = shop.owned.filter((id) => cardById(id) && !mine.selling.some((s) => s.card === id));
  const amount = Math.floor(Number(offer));
  const balance = shop.balance ?? 0;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto safe-bottom">
        <div className="max-w-md mx-auto space-y-4">
          <SheetHeader className="text-left">
            <SheetTitle>{tr("Trade cards")}</SheetTitle>
            <SheetDescription>{tr("Swap cards with another rider, or buy and sell them for RPM.")}</SheetDescription>
          </SheetHeader>
          {demo && <DemoLockNote />}

          <Tabs defaultValue="swap">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="swap">{tr("Swap")}</TabsTrigger>
              <TabsTrigger value="buy">{tr("Buy")}</TabsTrigger>
              <TabsTrigger value="sell">{tr("Sell")}</TabsTrigger>
            </TabsList>

            <TabsContent value="swap" className="mt-4">
              {open && <SwapPanel demo={demo} locked={locked} />}
            </TabsContent>

            <TabsContent value="buy" className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Input aria-label={tr("Sale code")} placeholder={tr("Sale code")} value={code} disabled={demo} maxLength={80} onChange={(e) => setCode(e.target.value)} className="h-12 font-mono uppercase" />
                <Button variant="outline" className="h-12 w-12 p-0 shrink-0" disabled={demo} onClick={() => setScan(!scan)} aria-label={tr("Scan sale QR")} aria-pressed={scan}>
                  <ScanLine className="w-5 h-5" />
                </Button>
              </div>
              {scan && <div id="cw-trade-scanner" className="overflow-hidden rounded-2xl" />}

              {sale && cardById(sale.card) && (
                <div className="cw-panel space-y-3">
                  <div className="max-w-[200px] mx-auto">
                    <CwCard card={cardById(sale.card)!} />
                  </div>
                  {sale.mine ? (
                    <p className="text-sm text-muted-foreground text-center">{tr("That's your own card.")}</p>
                  ) : sale.owned ? (
                    <p className="text-sm text-muted-foreground text-center">{tr("You already own that card.")}</p>
                  ) : sale.status !== 'open' ? (
                    <p className="text-sm text-muted-foreground text-center">{tr("That sale isn't open any more.")}</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground text-center">{tr("Shop price {0} RPM. Offer what you think it's worth.", [cardById(sale.card)?.price ?? 0])}</p>
                      <div className="flex gap-2">
                        <Input type="number" inputMode="numeric" min={1} aria-label={tr("Your offer in RPM")} value={offer} onChange={(e) => setOffer(e.target.value)} className="h-12 font-mono" />
                        <Button
                          className="h-12 shrink-0"
                          disabled={busy || locked || !(amount >= 1) || amount > balance + (sale.myOffer ?? 0)}
                          onClick={() => void run(() => makeOffer(sale.code, amount), tr("Offer sent"))}
                        >
                          {sale.myOffer ? tr("Change offer") : tr("Offer {0} RPM", [amount || 0])}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {mine.buying.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Your offers")}</h3>
                  {mine.buying.map((o) => (
                    <div key={o.id} className="cw-panel flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{cardById(o.card)?.name ?? o.card}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {o.rpm} RPM · {statusText(o.status)}
                        </p>
                      </div>
                      {o.status === 'pending' && (
                        <Button variant="outline" size="sm" className="h-11" disabled={busy} onClick={() => void run(() => withdrawOffer(o.id), tr("Offer withdrawn, RPM back"))}>
                          {tr("Withdraw")}
                        </Button>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </TabsContent>

            <TabsContent value="sell" className="space-y-4 mt-4">
              {mine.selling.map((s) => (
                <div key={s.id} className="cw-panel space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-20 shrink-0">{cardById(s.card) && <CwCard card={cardById(s.card)!} size="thumb" />}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{cardById(s.card)?.name}</p>
                      <button
                        type="button"
                        className="font-mono text-lg tracking-widest text-accent glove-hit flex items-center gap-1.5"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(s.code)
                            .then(() => toast.success(tr("Copied")))
                            .catch(() => undefined)
                        }
                      >
                        {s.code}
                        <Copy className="w-4 h-4" />
                      </button>
                      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowing(showing === s.id ? null : s.id)}>
                        {showing === s.id ? tr("Hide QR") : tr("Show QR")}
                      </button>
                    </div>
                    <Button variant="ghost" size="sm" className="h-11 w-11 p-0" aria-label={tr("Stop selling")} disabled={busy} onClick={() => void run(() => cancelSale(s.id))}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {showing === s.id && (
                    <div className="mx-auto w-fit rounded-2xl bg-white p-3">
                      <QRCodeSVG value={saleLink(shareOrigin(), s.code)} size={168} />
                    </div>
                  )}
                  {s.offers.length === 0 ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                      {tr("No offers yet. Share the code with a rider.")}
                    </p>
                  ) : (
                    s.offers.map((o) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <p className="flex-1 min-w-0 text-sm truncate">
                          <b className="font-mono">{o.rpm} RPM</b> <span className="text-muted-foreground">· {o.from}</span>
                        </p>
                        <Button variant="outline" size="sm" className="h-11 w-11 p-0" aria-label={tr("Decline")} disabled={busy} onClick={() => void run(() => answerOffer(o.id, false))}>
                          <X className="w-4 h-4" />
                        </Button>
                        <Button size="sm" className="h-11 gap-1" disabled={busy || locked} onClick={() => void run(() => answerOffer(o.id, true), tr("Card sold"))}>
                          <Check className="w-4 h-4" />
                          {tr("Accept")}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              ))}

              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Put a card up for sale")}</h3>
                {sellable.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tr("Cards you've won, bought or spun can be sold here.")}</p>
                ) : (
                  <div className="cw-grid-2">
                    {sellable.map((id) => (
                      <CwCard
                        key={id}
                        card={cardById(id)!}
                        size="thumb"
                        disabled={demo || busy || locked}
                        className={cn(busy && 'opacity-60')}
                        onClick={() => void run(async () => {
                          const r = await listCard(id);
                          return typeof r === 'string' ? r : null;
                        }, tr("Card up for sale. Share its code."))}
                      />
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
