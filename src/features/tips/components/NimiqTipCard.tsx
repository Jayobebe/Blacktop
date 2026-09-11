import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { Heart, ChevronDown, Plus, Trash2, Copy, Check, X, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { usePayees } from '../hooks/usePayees';
import type { Payee, TipCurrency } from '../types';
import {
  buildPaymentUri,
  isValidNimAddress,
  isValidUsdtAddress,
  normalizeNimAddress,
  parsePayeeQr,
  payeeAddress,
  payeeSupports,
} from '../lib/nimiqPay';

const SCANNER_ID = 'payee-qr-scanner';

const CURRENCIES: TipCurrency[] = ['USDT', 'NIM'];

export function NimiqTipCard() {
  const { payees, addPayee, removePayee } = usePayees();
  const [selectedId, setSelectedId] = useState(payees[0]?.id ?? 'developer');
  const [currency, setCurrency] = useState<TipCurrency>('USDT');
  const [amount, setAmount] = useState('5');
  const [showNewPayee, setShowNewPayee] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const [newLabel, setNewLabel] = useState('');
  const [newNim, setNewNim] = useState('');
  const [newUsdt, setNewUsdt] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try { await scanner.stop(); } catch { /* already stopped */ }
    try { await scanner.clear(); } catch { /* already cleared */ }
  };

  useEffect(() => () => { void stopScanner(); }, []);

  const startScanner = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decoded) => {
          const parsed = parsePayeeQr(decoded);
          if (!parsed) return;
          await stopScanner();
          setScanning(false);
          if (parsed.nim) setNewNim(parsed.nim);
          if (parsed.usdt) setNewUsdt(parsed.usdt);
          toast.success('Address scanned');
        },
        () => {}
      );
    } catch {
      setScanning(false);
      toast.error('Camera unavailable', { description: 'Allow camera access to scan a QR code.' });
    }
  };

  const cancelScan = async () => {
    await stopScanner();
    setScanning(false);
  };

  const selected: Payee = payees.find((p) => p.id === selectedId) ?? payees[0];
  const numericAmount = Number.parseFloat(amount.replace(',', '.'));
  const uri = useMemo(
    () => (selected ? buildPaymentUri(selected, currency, numericAmount) : null),
    [selected, currency, numericAmount]
  );
  const supported = selected ? payeeSupports(selected, currency) : false;

  const handlePay = () => {
    if (!uri) return;
    setShowQr(true);
    window.open(uri, '_blank');
  };

  const handleCopy = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(payeeAddress(selected, currency));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy the address.');
    }
  };

  const handleAddPayee = () => {
    const label = newLabel.trim();
    const nim = newNim.trim() ? normalizeNimAddress(newNim) : '';
    const usdt = newUsdt.trim();
    if (!label) return toast.error('Give this payee a name.');
    if (nim && !isValidNimAddress(nim)) return toast.error('That NIM address does not look right.');
    if (usdt && !isValidUsdtAddress(usdt)) return toast.error('That USDT address does not look right.');
    if (!nim && !usdt) return toast.error('Add a NIM or a USDT address.');

    const entry = addPayee({ label, nimAddress: nim || undefined, usdtAddress: usdt || undefined });
    setSelectedId(entry.id);
    setCurrency(usdt ? 'USDT' : 'NIM');
    setNewLabel('');
    setNewNim('');
    setNewUsdt('');
    setShowNewPayee(false);
    toast.success(`${label} saved`);
  };

  return (
    <section className="bg-accent/5 rounded-2xl p-4 landscape:p-3 border border-accent/30 animate-slide-up delay-300">
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-accent" />
        <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">Pay up</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Support the developer or send a friend fuel money.
      </p>

      {/* Payee picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full h-11 justify-between rounded-xl bg-card/60 border-border/40 touch-target"
          >
            <span className="truncate">{selected?.label ?? 'Choose payee'}</span>
            <ChevronDown className="w-4 h-4 shrink-0 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-card border-border/30 w-[--radix-dropdown-menu-trigger-width]">
          {payees.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{p.label}</span>
              {!p.builtIn && (
                <button
                  aria-label={`Remove ${p.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removePayee(p.id);
                    if (selectedId === p.id) setSelectedId('developer');
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowNewPayee(true)}>
            <Plus className="w-3.5 h-3.5 mr-2" />
            New payee
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New payee form */}
      {showNewPayee && (
        <div className="mt-3 rounded-xl border border-border/40 bg-card/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">New payee</p>
            <button aria-label="Cancel" onClick={() => setShowNewPayee(false)} className="text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Name" className="h-10" />
          <Input value={newNim} onChange={(e) => setNewNim(e.target.value)} placeholder="NIM address (NQ…)" className="h-10 font-mono text-xs" />
          <Input value={newUsdt} onChange={(e) => setNewUsdt(e.target.value)} placeholder="USDT address (0x… on Polygon)" className="h-10 font-mono text-xs" />
          <Button onClick={handleAddPayee} className="w-full h-10 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90">
            Save payee
          </Button>
        </div>
      )}

      {/* Currency + amount */}
      <div className="flex gap-2 mt-3">
        <div className="flex rounded-xl border border-border/40 overflow-hidden">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={cn(
                'px-3 h-11 text-xs font-semibold touch-target transition-colors',
                currency === c ? 'bg-accent text-accent-foreground' : 'bg-card/60 text-muted-foreground'
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Tip amount"
          className="flex-1 h-11 rounded-xl text-center font-semibold"
        />
      </div>

      <Button
        onClick={handlePay}
        disabled={!uri}
        className="w-full h-11 mt-3 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-xl touch-target"
      >
        <Heart className="w-4 h-4 mr-2" />
        Pay up
      </Button>

      {!supported && selected && (
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          {selected.label} has no {currency} address saved yet.
        </p>
      )}

      {showQr && uri && (
        <div className="mt-3 rounded-xl border border-border/40 bg-card/50 p-3 flex flex-col items-center gap-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Scan with Nimiq Pay
          </p>
          <div className="bg-white p-2 rounded-lg">
            <QRCodeSVG value={uri} size={160} />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground break-all text-center">
            {payeeAddress(selected, currency)}
          </p>
          <Button variant="outline" onClick={handleCopy} className="h-9 rounded-xl">
            {copied ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
            {copied ? 'Copied' : 'Copy address'}
          </Button>
        </div>
      )}
    </section>
  );
}
