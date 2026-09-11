import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Heart, ChevronDown, Plus, Trash2, Copy, Check, X, ScanLine, QrCode, Send, Pencil,
} from 'lucide-react';
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
import { useMyWallet } from '../hooks/useMyWallet';
import { QrScanner } from './QrScanner';
import type { Payee, TipCurrency } from '../types';
import {
  USDT_POLYGON_CONTRACT,
  buildPaymentUri,
  isValidNimAddress,
  isValidUsdtAddress,
  normalizeNimAddress,
  payeeAddress,
  payeeSupports,
} from '../lib/nimiqPay';
import { openNimiqPayHome } from '../lib/walletBridge';

const CURRENCIES: TipCurrency[] = ['USDT', 'NIM'];

/** Address-only QR payload (no amount) so any wallet can read it. */
function addressUri(currency: TipCurrency, address: string): string {
  if (currency === 'NIM') return `nimiq:${address.replace(/\s/g, '')}`;
  return `ethereum:${USDT_POLYGON_CONTRACT}@137/transfer?address=${address}`;
}

export function NimiqTipCard() {
  const { payees, addPayee, removePayee } = usePayees();
  const { wallet, hasWallet, saveWallet } = useMyWallet();

  const [mode, setMode] = useState<'send' | 'receive'>('send');

  // --- send state
  const [selectedId, setSelectedId] = useState('developer');
  const [currency, setCurrency] = useState<TipCurrency>('USDT');
  const [amount, setAmount] = useState('5');
  const [payError, setPayError] = useState('');
  const [copied, setCopied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ nim?: string; usdt?: string } | null>(null);
  const [scannedLabel, setScannedLabel] = useState('');

  // --- receive state
  const [editingWallet, setEditingWallet] = useState(false);
  const [myNim, setMyNim] = useState(wallet.nimAddress ?? '');
  const [myUsdt, setMyUsdt] = useState(wallet.usdtAddress ?? '');
  const [myCurrency, setMyCurrency] = useState<TipCurrency>('USDT');
  const [walletScanning, setWalletScanning] = useState(false);
  const [myCopied, setMyCopied] = useState(false);

  const selected: Payee = payees.find((p) => p.id === selectedId) ?? payees[0];
  const numericAmount = Number.parseFloat(amount.replace(',', '.'));
  const supported = selected ? payeeSupports(selected, currency) : false;
  const sendUri = useMemo(
    () => (selected ? buildPaymentUri(selected, currency, numericAmount) : null),
    [selected, currency, numericAmount]
  );

  const myAddress = myCurrency === 'NIM' ? wallet.nimAddress ?? '' : wallet.usdtAddress ?? '';
  const myUri = myAddress ? addressUri(myCurrency, myAddress) : null;

  const handlePay = () => {
    setPayError('');
    const address = selected ? payeeAddress(selected, currency) : '';
    if (!selected || !address || !supported) {
      setPayError(`Choose a payee with a ${currency} address.`);
      return;
    }
    if (!(numericAmount > 0)) {
      setPayError('Enter an amount greater than zero.');
      return;
    }
    // Copy the address so it's ready to paste, then open Nimiq Pay's home screen.
    void handleCopy(address, setCopied);
    openNimiqPayHome();
    toast.info('Opening Nimiq Pay…', {
      description: 'Address copied — paste it into Nimiq Pay to send, or scan the QR code below.',
    });
  };

  const handleCopy = async (value: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(value);
      setter(true);
      setTimeout(() => setter(false), 1800);
    } catch {
      toast.error('Could not copy the address.');
    }
  };

  const handleSaveScanned = () => {
    if (!scanned) return;
    const label = scannedLabel.trim() || 'Scanned payee';
    const entry = addPayee({ label, nimAddress: scanned.nim, usdtAddress: scanned.usdt });
    setSelectedId(entry.id);
    setCurrency(scanned.usdt ? 'USDT' : 'NIM');
    setScanned(null);
    setScannedLabel('');
    toast.success(`${label} saved`);
  };

  const handleSaveWallet = () => {
    const nim = myNim.trim() ? normalizeNimAddress(myNim) : '';
    const usdt = myUsdt.trim();
    if (nim && !isValidNimAddress(nim)) return toast.error('That NIM address does not look right.');
    if (usdt && !isValidUsdtAddress(usdt)) return toast.error('That USDT address does not look right.');
    if (!nim && !usdt) return toast.error('Add a NIM or a USDT address.');
    saveWallet({ nimAddress: nim || undefined, usdtAddress: usdt || undefined });
    setMyCurrency(usdt ? 'USDT' : 'NIM');
    setEditingWallet(false);
    toast.success('Your wallet is saved on this device');
  };

  const startWalletEdit = () => {
    setMyNim(wallet.nimAddress ?? '');
    setMyUsdt(wallet.usdtAddress ?? '');
    setEditingWallet(true);
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

      {/* Send / Receive toggle */}
      <div className="grid grid-cols-2 rounded-xl border border-border/40 overflow-hidden mb-3">
        {(['send', 'receive'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'h-11 text-xs font-semibold touch-target transition-colors flex items-center justify-center gap-2',
              mode === m ? 'bg-accent text-accent-foreground' : 'bg-card/60 text-muted-foreground'
            )}
          >
            {m === 'send' ? <Send className="w-3.5 h-3.5" /> : <QrCode className="w-3.5 h-3.5" />}
            {m === 'send' ? 'Send' : 'Receive'}
          </button>
        ))}
      </div>

      {mode === 'send' ? (
        <>
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
              <DropdownMenuItem onClick={() => { setScanned(null); setScanning(true); }}>
                <Plus className="w-3.5 h-3.5 mr-2" />
                New payee — scan their QR
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {scanning && (
            <div className="mt-3">
              <QrScanner
                id="payee-qr-scanner"
                onResult={(res) => {
                  setScanning(false);
                  setScanned(res);
                  toast.success('Address scanned');
                }}
                onCancel={() => setScanning(false)}
              />
            </div>
          )}

          {scanned && (
            <div className="mt-3 rounded-xl border border-border/40 bg-card/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Save payee</p>
                <button aria-label="Discard" onClick={() => setScanned(null)} className="text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground break-all">
                {scanned.nim ?? scanned.usdt}
              </p>
              <Input
                value={scannedLabel}
                onChange={(e) => setScannedLabel(e.target.value)}
                placeholder="Name (optional)"
                className="h-10"
              />
              <Button onClick={handleSaveScanned} className="w-full h-10 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90">
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
            className="w-full h-11 mt-3 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-xl touch-target"
          >
            <Heart className="w-4 h-4 mr-2" />
            Open in Nimiq Pay
          </Button>

          {payError && (
            <p role="alert" className="text-[10px] text-destructive text-center mt-2">{payError}</p>
          )}

          {!supported && selected && (
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              {selected.label} has no {currency} address saved yet.
            </p>
          )}

          {sendUri && (
            <div className="mt-3 rounded-xl border border-border/40 bg-card/50 p-3 flex flex-col items-center gap-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Scan the QR, or copy the address and paste it into Nimiq Pay
              </p>
              <div className="bg-white p-2 rounded-lg">
                <QRCodeSVG value={sendUri} size={160} />
              </div>
              <p className="text-[10px] font-mono text-muted-foreground break-all text-center">
                {payeeAddress(selected, currency)}
              </p>
              <Button
                variant="outline"
                onClick={() => handleCopy(payeeAddress(selected, currency), setCopied)}
                className="h-9 rounded-xl"
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
                {copied ? 'Copied' : 'Copy address'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {!hasWallet || editingWallet ? (
            <div className="rounded-xl border border-border/40 bg-card/50 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Your wallet
              </p>
              <p className="text-xs text-muted-foreground">
                Add your address to show your own code. It stays on this device.
              </p>
              <Input
                value={myNim}
                onChange={(e) => setMyNim(e.target.value)}
                placeholder="NIM address (NQ…)"
                className="h-10 font-mono text-xs"
              />
              <Input
                value={myUsdt}
                onChange={(e) => setMyUsdt(e.target.value)}
                placeholder="USDT address (0x… on Polygon)"
                className="h-10 font-mono text-xs"
              />

              {walletScanning ? (
                <QrScanner
                  id="my-wallet-qr-scanner"
                  onResult={(res) => {
                    setWalletScanning(false);
                    if (res.nim) setMyNim(res.nim);
                    if (res.usdt) setMyUsdt(res.usdt);
                    toast.success('Address scanned');
                  }}
                  onCancel={() => setWalletScanning(false)}
                />
              ) : (
                <Button variant="outline" onClick={() => setWalletScanning(true)} className="w-full h-10 rounded-xl">
                  <ScanLine className="w-4 h-4 mr-2" /> Scan from my wallet app
                </Button>
              )}

              <div className="flex gap-2">
                {hasWallet && (
                  <Button variant="outline" onClick={() => setEditingWallet(false)} className="flex-1 h-10 rounded-xl">
                    Cancel
                  </Button>
                )}
                <Button onClick={handleSaveWallet} className="flex-1 h-10 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90">
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-card/50 p-3 flex flex-col items-center gap-3">
              {wallet.nimAddress && wallet.usdtAddress && (
                <div className="flex rounded-xl border border-border/40 overflow-hidden">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setMyCurrency(c)}
                      className={cn(
                        'px-4 h-9 text-xs font-semibold transition-colors',
                        myCurrency === c ? 'bg-accent text-accent-foreground' : 'bg-card/60 text-muted-foreground'
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              {myUri ? (
                <>
                  <div className="bg-white p-2 rounded-lg">
                    <QRCodeSVG value={myUri} size={170} />
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground break-all text-center">{myAddress}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleCopy(myAddress, setMyCopied)} className="h-9 rounded-xl">
                      {myCopied ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
                      {myCopied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button variant="outline" onClick={startWalletEdit} className="h-9 rounded-xl">
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-muted-foreground text-center">
                    No {myCurrency} address saved yet.
                  </p>
                  <Button variant="outline" onClick={startWalletEdit} className="h-9 rounded-xl">
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Edit wallet
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
