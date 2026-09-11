import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Fuel, X, Check, ThumbsDown, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useMyWallet, buildPaymentUri, formatAmount } from '@/features/tips';
import { openNimiqPayPayment } from '@/features/tips/lib/walletBridge';
import { useBlacktank } from '../hooks/useBlacktank';
import type { TankCurrency, TankRequestRow } from '../types';

function CurrencyToggle({
  value,
  onChange,
}: {
  value: TankCurrency;
  onChange: (c: TankCurrency) => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-border">
      {(['NIM', 'USDT'] as TankCurrency[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'flex-1 px-3 py-1.5 text-xs font-semibold transition-colors',
            value === c ? 'bg-accent text-accent-foreground' : 'text-foreground/70 hover:bg-secondary',
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs}h left` : `${Math.round(hrs / 24)}d left`;
}

/**
 * Blacktank — the crew's shared fuel pot.
 *
 * Blacktop holds no money. Riders pledge what they are good for, the crew must
 * unanimously approve any withdrawal, and once approved every other member pays
 * their share straight to the requester through Nimiq Pay.
 */
export function BlacktankPanel({ onClose }: { onClose?: () => void }) {
  const tank = useBlacktank();
  const { wallet } = useMyWallet();

  const [currency, setCurrency] = useState<TankCurrency>('NIM');
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [pledgeNote, setPledgeNote] = useState('');
  const [askAmount, setAskAmount] = useState('');
  const [askReason, setAskReason] = useState('');
  const [askAddress, setAskAddress] = useState('');
  const [asking, setAsking] = useState(false);

  const pot = useMemo(
    () => tank.summary.find((s) => s.currency === currency),
    [tank.summary, currency],
  );

  const defaultAddress = currency === 'NIM' ? wallet.nimAddress : wallet.usdtAddress;

  /* ── Not in the tank yet ─────────────────────────────────────────────── */
  if (!tank.isMember) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Fuel className="w-5 h-5 text-accent" />
          <h2 className="text-base font-bold">Blacktank</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          A shared fuel pot for crew <span className="font-mono text-foreground">{tank.crewCode}</span>.
          Chip in what you're good for. When someone needs to draw from it, the whole crew has to
          agree before anyone pays out.
        </p>
        <p className="text-xs text-muted-foreground">
          Blacktop never holds your money — it only tracks who's in for what. Payments go rider to
          rider through Nimiq Pay.
        </p>
        <Button
          className="w-full"
          disabled={tank.join.isPending}
          onClick={() =>
            tank.join.mutate(
              { nim: wallet.nimAddress, usdt: wallet.usdtAddress },
              {
                onSuccess: () => toast.success('You’re in the tank'),
                onError: (e: unknown) => toast.error((e as Error).message),
              },
            )
          }
        >
          {tank.join.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join the tank'}
        </Button>
      </div>
    );
  }

  const submitPledge = () => {
    const amount = Number(pledgeAmount);
    if (!(amount > 0)) return toast.error('Enter an amount');
    tank.pledge.mutate(
      { currency, amount, note: pledgeNote },
      {
        onSuccess: () => {
          setPledgeAmount('');
          setPledgeNote('');
          toast.success(`Chipped in ${formatAmount(amount, currency)}`);
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const submitAsk = () => {
    const amount = Number(askAmount);
    const address = (askAddress || defaultAddress || '').trim();
    if (!(amount > 0)) return toast.error('Enter an amount');
    if (!askReason.trim()) return toast.error('Say what it’s for');
    if (!address) return toast.error('Add the wallet the money should land in');
    tank.request.mutate(
      { currency, amount, reason: askReason, payoutAddress: address },
      {
        onSuccess: () => {
          setAskAmount('');
          setAskReason('');
          setAsking(false);
          toast.success('Request sent to the crew');
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const payShare = (r: TankRequestRow) => {
    const payee = {
      id: 'blacktank',
      label: r.requester_name,
      nimAddress: r.currency === 'NIM' ? r.payout_address : undefined,
      usdtAddress: r.currency === 'USDT' ? r.payout_address : undefined,
    };
    const uri = buildPaymentUri(payee, r.currency, r.my_share);
    openNimiqPayPayment(r.currency, r.payout_address, r.my_share, uri);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fuel className="w-5 h-5 text-accent" />
          <h2 className="text-base font-bold">Blacktank</h2>
          <span className="text-xs font-mono text-muted-foreground">{tank.crewCode}</span>
        </div>
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close Blacktank">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <CurrencyToggle value={currency} onChange={setCurrency} />

      {/* Pot */}
      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">In the tank</p>
        <p className="text-3xl font-bold tabular-nums">
          {formatAmount(Number(pot?.balance ?? 0), currency)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {pot?.member_count ?? 0} {(pot?.member_count ?? 0) === 1 ? 'rider' : 'riders'} · you're in for{' '}
          {formatAmount(Number(pot?.my_pledged ?? 0), currency)}
        </p>
      </div>

      {/* Chip in */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground">Chip in</p>
        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            placeholder={`Amount in ${currency}`}
            value={pledgeAmount}
            onChange={(e) => setPledgeAmount(e.target.value)}
          />
          <Button onClick={submitPledge} disabled={tank.pledge.isPending}>
            {tank.pledge.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </Button>
        </div>
        <Input
          placeholder="What for? (optional)"
          value={pledgeNote}
          onChange={(e) => setPledgeNote(e.target.value)}
        />
      </div>

      {/* Requests */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Withdrawals</p>
          <Button size="sm" variant="outline" onClick={() => setAsking((v) => !v)}>
            {asking ? 'Cancel' : 'Ask the tank'}
          </Button>
        </div>

        {asking && (
          <div className="rounded-xl border border-border p-3 space-y-2">
            <Input
              inputMode="decimal"
              placeholder={`How much ${currency}?`}
              value={askAmount}
              onChange={(e) => setAskAmount(e.target.value)}
            />
            <Textarea
              placeholder="Why do you need it? The crew sees this."
              value={askReason}
              onChange={(e) => setAskReason(e.target.value)}
              rows={2}
            />
            <Input
              placeholder={defaultAddress ? `Pay into ${defaultAddress.slice(0, 12)}…` : 'Your wallet address'}
              value={askAddress}
              onChange={(e) => setAskAddress(e.target.value)}
            />
            <Button className="w-full" onClick={submitAsk} disabled={tank.request.isPending}>
              {tank.request.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send to the crew'}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Every other member has to approve. One no, or nobody voting before it runs out, and the
              request dies.
            </p>
          </div>
        )}

        {tank.requests.length === 0 && !asking && (
          <p className="text-xs text-muted-foreground">Nothing pending.</p>
        )}

        {tank.requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {r.is_mine ? 'You' : r.requester_name} · {formatAmount(Number(r.amount), r.currency)}
                </p>
                <p className="text-xs text-muted-foreground break-words">{r.reason}</p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full',
                  r.status === 'open' && 'bg-secondary text-foreground/80',
                  r.status === 'approved' && 'bg-accent text-accent-foreground',
                  r.status === 'settled' && 'bg-secondary text-muted-foreground',
                  (r.status === 'rejected' || r.status === 'expired') &&
                    'bg-destructive/20 text-destructive',
                )}
              >
                {r.status}
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {r.yes_votes}/{r.votes_needed} approved
              {r.status === 'open' && ` · ${timeLeft(r.expires_at)}`}
            </p>

            {r.status === 'open' && !r.is_mine && r.my_vote === null && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={tank.vote.isPending}
                  onClick={() =>
                    tank.vote.mutate({ requestId: r.id, approve: true })
                  }
                >
                  <Check className="w-4 h-4 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={tank.vote.isPending}
                  onClick={() => tank.vote.mutate({ requestId: r.id, approve: false })}
                >
                  <ThumbsDown className="w-4 h-4 mr-1" /> Block
                </Button>
              </div>
            )}

            {r.status === 'open' && !r.is_mine && r.my_vote !== null && (
              <p className="text-[11px] text-muted-foreground">
                You {r.my_vote ? 'approved' : 'blocked'} this.
              </p>
            )}

            {r.status === 'open' && r.is_mine && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => tank.cancelRequest.mutate(r.id)}
              >
                Withdraw request
              </Button>
            )}

            {r.status === 'approved' && !r.is_mine && !r.my_settled && (
              <div className="space-y-2">
                <p className="text-xs">
                  Your share: <strong>{formatAmount(Number(r.my_share), r.currency)}</strong>
                </p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => payShare(r)}>
                    <Wallet className="w-4 h-4 mr-1" /> Pay share
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      tank.settle.mutate(
                        { requestId: r.id, amount: Number(r.my_share) },
                        { onSuccess: () => toast.success('Marked as paid') },
                      )
                    }
                  >
                    Mark paid
                  </Button>
                </div>
              </div>
            )}

            {r.status === 'approved' && r.is_mine && (
              <p className="text-[11px] text-muted-foreground">
                Approved. The crew are paying into your wallet.
              </p>
            )}

            {r.my_settled && r.status !== 'settled' && (
              <p className="text-[11px] text-muted-foreground">You've paid your share.</p>
            )}
          </div>
        ))}
      </div>

      {/* Who's in */}
      {tank.pledges.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Who's chipped in</p>
          {tank.pledges
            .filter((p) => p.currency === currency)
            .map((p) => (
              <div key={`${p.display_name}-${p.currency}`} className="flex justify-between text-xs">
                <span className="truncate">{p.display_name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatAmount(Number(p.total), p.currency)}
                </span>
              </div>
            ))}
        </div>
      )}

    </div>
  );
}
