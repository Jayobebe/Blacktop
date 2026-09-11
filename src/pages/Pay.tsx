import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { BTLogo } from '@/components/BTLogo';
import { Button } from '@/components/ui/button';
import { getEvmProvider, getNimiqProvider, polygonscanTxUrl, sendUsdtViaWallet } from '@/features/tips/lib/walletBridge';

type Status = 'idle' | 'pending' | 'success' | 'error' | 'no-wallet';

/**
 * Standalone payment handoff screen (no app chrome). Opened inside Nimiq Pay as
 * a mini app via `nimiqpay://miniapp?url=blacktoplive.com/pay?...`.
 */
export default function Pay() {
  const [params] = useSearchParams();
  const recipient = (params.get('recipient') ?? '').trim();
  const rawAmount = params.get('amount') ?? '';
  const currency = (params.get('currency') ?? '').toUpperCase() === 'NIM' ? 'NIM' : 'USDT';
  const amount = Number.parseFloat(rawAmount);

  const [status, setStatus] = useState<Status>('idle');
  const [tx, setTx] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!recipient || !(amount > 0)) {
      setStatus('error');
      setError('This payment link is missing a recipient or amount.');
      return;
    }

    const run = async () => {
      setStatus('pending');
      try {
        if (currency === 'NIM') {
          const provider = await getNimiqProvider();
          if (!provider) {
            setStatus('no-wallet');
            return;
          }
          // `amount` already arrives in Luna from the Pay Up card.
          const result = await provider.sendBasicTransaction({
            recipient: recipient.replace(/\s+/g, ''),
            value: Math.round(amount),
          });
          if (result && typeof result === 'object' && 'error' in result) {
            throw new Error((result as { error?: { message?: string } }).error?.message ?? 'Payment failed');
          }
          setTx(typeof result === 'string' ? result : null);
          setStatus('success');
          return;
        }

        if (!getEvmProvider()) {
          setStatus('no-wallet');
          return;
        }
        const hash = await sendUsdtViaWallet(recipient, amount);
        setTx(hash);
        setStatus('success');
      } catch (err) {
        const message = (err as { message?: string })?.message ?? '';
        if (message === 'NO_PROVIDER' || message === 'NO_ACCOUNT') {
          setStatus('no-wallet');
          return;
        }
        setStatus('error');
        setError(/reject|denied|cancel/i.test(message) ? 'Payment cancelled.' : 'The wallet could not send that payment.');
      }
    };

    void run();
  }, [recipient, amount, currency]);

  const displayAmount = currency === 'NIM' ? `${amount / 100_000} NIM` : `${amount} USDT`;

  return (
    <main className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6 text-center gap-5">
      <BTLogo className="w-14 h-14 opacity-80" />

      <div>
        <h1 className="text-lg font-semibold">{displayAmount}</h1>
        <p className="text-[11px] font-mono text-muted-foreground break-all mt-1">{recipient || '—'}</p>
      </div>

      {status === 'pending' && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Confirm the payment in your wallet…
        </p>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="w-8 h-8 text-accent" />
          <p className="text-sm font-semibold">Payment sent</p>
          {tx && currency === 'USDT' && (
            <a href={polygonscanTxUrl(tx)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent underline break-all">
              View on Polygonscan
            </a>
          )}
          {tx && currency === 'NIM' && (
            <p className="text-[10px] font-mono text-muted-foreground break-all max-w-xs">{tx.slice(0, 42)}…</p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
        </div>
      )}

      {status === 'no-wallet' && (
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="w-8 h-8 text-warning" />
          <p className="text-sm text-muted-foreground max-w-xs">
            No wallet found here. Open this payment from the Nimiq Pay app to complete it.
          </p>
        </div>
      )}

      <Button asChild variant="outline" className="rounded-xl h-10 mt-2">
        <Link to="/">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Blacktop
        </Link>
      </Button>
    </main>
  );
}
