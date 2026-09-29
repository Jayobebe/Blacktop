import { lazy, Suspense, useRef, useState } from 'react';
import { Building2, Camera, KeyRound, Loader2, Mail, ArrowRight, ChevronDown, Check, Lock, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { parseEnterpriseCode } from '../lib/qrParser';
import { verifyEnterpriseCode } from '../lib/enterpriseApi';
import { mountWorkspace } from '../lib/enterpriseStore';
import { ENTERPRISE_CONTACT_EMAIL, enquiryMailto, tierName } from '../lib/tiers';
import { enterpriseTiers, type EnterpriseTier, type GuestSessionPayload } from '../types';
import { TierShowcase } from './TierShowcase';

// The camera scanner (html5-qrcode) only loads when the rider opens it.
const EnterpriseQrScanner = lazy(() => import('./EnterpriseQrScanner'));

/**
 * The last card in Home's deck: scan an organisation's QR code or type its
 * code to mount its workspace, or ask about Blacktop Enterprise.
 */
export function EnterpriseDoorway({ className }: { className?: string }) {
  const [tab, setTab] = useState<'scan' | 'code'>('scan');
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // The package the rider opened below: the Inquire email names it.
  const [openTier, setOpenTier] = useState<EnterpriseTier | null>(null);

  // The login and the camera scanner aren't open yet: trying either pops the
  // Coming soon stamp instead (scrolled into view first if it's off screen).
  const stampRef = useRef<HTMLSpanElement>(null);
  const pulseSoon = () => {
    haptics.light();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    stampRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    // Only the stamp moves: a big pop with a wiggle and an accent glow.
    const glow = 'hsl(var(--accent) / 0.8)';
    const off = `0 0 0 0 hsl(var(--accent) / 0)`;
    stampRef.current?.animate(
      reduce
        ? [{ boxShadow: off }, { boxShadow: `0 0 18px 6px ${glow}` }, { boxShadow: off }]
        : [
            { transform: 'rotate(3deg) scale(1)', boxShadow: off },
            { transform: 'rotate(-7deg) scale(1.45)', boxShadow: `0 0 22px 8px ${glow}`, offset: 0.22 },
            { transform: 'rotate(6deg) scale(1.38)', boxShadow: `0 0 20px 7px ${glow}`, offset: 0.4 },
            { transform: 'rotate(-4deg) scale(1.3)', boxShadow: `0 0 16px 5px ${glow}`, offset: 0.56 },
            { transform: 'rotate(2deg) scale(1.15)', boxShadow: `0 0 10px 3px ${glow}`, offset: 0.72 },
            { transform: 'rotate(3deg) scale(1)', boxShadow: off },
          ],
      { duration: 700, easing: 'ease-out' },
    );
  };

  const connect = async (payload: GuestSessionPayload | null) => {
    if (!payload) {
      haptics.error();
      toast.error(tr("That isn't a Blacktop Enterprise code"));
      return;
    }
    setBusy(true);
    const res = await verifyEnterpriseCode(payload.token);
    setBusy(false);
    if (!res.ok) {
      haptics.error();
      toast.error(
        res.reason === 'rate_limited'
          ? tr("Too many tries. Wait a while and try again.")
          : res.reason === 'offline'
            ? tr("Couldn't reach Blacktop. Check your connection.")
            : res.reason === 'signed_out'
              ? tr("Sign in to Blacktop first.")
              : tr("That code isn't valid or has expired."),
      );
      return;
    }
    setCode('');
    // Already mounted: no duplicate, the deck just moves to it.
    if (mountWorkspace(res.session)) {
      haptics.success();
      toast.success(tr("Connected to {0}", [res.session.org.name]));
    } else {
      haptics.medium();
      toast(tr("{0} is already open", [res.session.org.name]));
    }
  };

  return (
    <div className={cn('h-full overflow-y-auto overscroll-contain flex flex-col gap-3 [&>*]:shrink-0 -mx-3 px-3 -mt-3 pt-3', className)}>
      {/* Coming soon, stamped like the Speedshop's items, with the organisation
          login it will have. The login is a preview: its fields are read-only
          (nothing typed is kept, passwords included) and any attempt to use
          it just pops the stamp. */}
      <div className="relative bg-card/50 rounded-3xl border border-accent/40 p-4">
        <span
          ref={stampRef}
          className="absolute top-3 right-3 rounded-md bg-accent text-accent-foreground text-[10px] font-black uppercase tracking-widest px-2 py-1 rotate-3 shadow"
          style={{ transformOrigin: '80% 50%' }}
        >
          {tr("Coming soon")}
        </span>
        <div className="pr-24">
          <p className="text-[10px] uppercase tracking-[0.25em] text-accent">{tr("Blacktop Enterprise")}</p>
          <p className="text-sm font-semibold text-foreground mt-1">{tr("Blacktop for schools, dealers, tour operators and race teams.")}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {tr("The packages below are on their way. Got a code from your organisation? Scan it here. Want it for yours? Get in touch.")}
        </p>
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            pulseSoon();
          }}
        >
          {([
            { type: 'email', label: tr("Email"), Icon: Mail },
            { type: 'password', label: tr("Password"), Icon: Lock },
          ] as const).map(({ type, label, Icon }) => (
            <div key={type} className="relative">
              <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent/70 pointer-events-none" />
              <Input
                type={type}
                readOnly
                value=""
                placeholder={label}
                aria-label={label}
                autoComplete="off"
                onClick={pulseSoon}
                onKeyDown={(e) => {
                  if (e.key !== 'Tab') {
                    e.preventDefault();
                    pulseSoon();
                  }
                }}
                className="h-11 rounded-xl pl-9 cursor-pointer"
              />
            </div>
          ))}
          <Button type="submit" className="h-11 rounded-xl">
            <LogIn className="w-4 h-4 mr-2" />
            {tr("Log in")}
          </Button>
        </form>
      </div>

      <div className="bg-card/50 rounded-3xl border-2 border-accent/60 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{tr("Blacktop Enterprise")}</h2>
            <p className="text-xs text-muted-foreground">
              {tr("Scan your school, team, dealer or tour operator's code, or type it in, to open their workspace.")}
            </p>
          </div>
        </div>

        <div role="tablist" className="grid grid-cols-2 rounded-xl border border-accent/40 bg-background/60 p-0.5 text-xs">
          {([
            { id: 'scan', label: tr("Scan QR"), Icon: Camera },
            { id: 'code', label: tr("Enter code"), Icon: KeyRound },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                haptics.tick();
                setTab(id);
                if (id !== 'scan') setScanning(false);
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 font-semibold transition-colors',
                tab === id ? 'bg-accent text-accent-foreground' : 'text-accent/80',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'scan' &&
          (scanning && !busy ? (
            <div className="space-y-2">
              <Suspense fallback={<p className="text-[10px] text-muted-foreground text-center py-8">{tr("Starting camera…")}</p>}>
                <EnterpriseQrScanner
                  onResult={(p) => {
                    setScanning(false);
                    void connect(p);
                  }}
                  onError={() => {
                    setScanning(false);
                    toast.error(tr("Camera unavailable"), { description: tr("Allow camera access to scan a QR code.") });
                  }}
                />
              </Suspense>
              <Button variant="outline" className="w-full h-10 rounded-xl" onClick={() => setScanning(false)}>
                {tr("Cancel scan")}
              </Button>
            </div>
          ) : (
            // Scanning isn't open yet: the button pops the Coming soon stamp.
            // (When it opens, this goes back to setScanning(true); the scanner is ready.)
            <Button className="w-full h-12 rounded-xl" disabled={busy} onClick={pulseSoon}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
              {busy ? tr("Checking…") : tr("Open camera")}
            </Button>
          ))}

        {tab === 'code' && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void connect(parseEnterpriseCode(code));
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={tr("Code or PIN")}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-12 rounded-xl font-mono tracking-widest uppercase"
              aria-label={tr("Enterprise code")}
            />
            <Button type="submit" className="h-12 rounded-xl px-4" disabled={busy || code.trim().length < 6} aria-label={tr("Connect")}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            </Button>
          </form>
        )}

        <p className="text-[10px] text-muted-foreground">
          {tr("Only the code is sent. Your own rides, garage and profile stay yours and aren't shared with the organisation.")}
        </p>
      </div>

      {/* For organisations: the way in */}
      <div className="bg-card/50 rounded-3xl border border-border/40 p-4 flex items-center gap-3">
        <p className="flex-1 text-sm text-foreground">{tr("Running a training school, race team, dealership, or tour fleet?")}</p>
        <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
          <a href={enquiryMailto(openTier)} onClick={() => haptics.light()}>
            <Mail className="w-4 h-4 mr-1.5" />
            {tr("Inquire")}
          </a>
        </Button>
      </div>

      <TierAccordion openTier={openTier} onToggle={(t) => setOpenTier((cur) => (cur === t ? null : t))} />

      <p className="text-[10px] text-muted-foreground text-center pb-2">
        {tr("Contact sales")}: <span className="font-mono">{ENTERPRISE_CONTACT_EMAIL}</span>
      </p>
    </div>
  );
}

/**
 * The five packages, one open at a time (an accordion, not a sideways
 * swiper: the Doorway already sits in Home's swipe deck).
 */
function TierAccordion({ openTier, onToggle }: { openTier: EnterpriseTier | null; onToggle: (t: EnterpriseTier) => void }) {
  // Longest package name first (in the rider's language); equal lengths keep their order.
  const tiers = enterpriseTiers().sort((a, b) => tierName(b.id).length - tierName(a.id).length);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-accent uppercase tracking-widest font-semibold px-1">{tr("Packages")}</p>
      {tiers.map((t) => {
        const open = openTier === t.id;
        return (
          <div key={t.id} className={cn('bg-card/50 rounded-2xl border transition-colors', open ? 'border-accent' : 'border-border/40')}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => {
                haptics.tick();
                onToggle(t.id);
              }}
              className="w-full flex items-center gap-3 p-3 text-left"
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest rounded-full px-2 py-0.5 bg-accent/15 text-accent shrink-0">
                {tierName(t.id)}
              </span>
              <span className="flex-1 min-w-0 text-xs text-muted-foreground line-clamp-2">{t.tagline}</span>
              <ChevronDown className={cn('w-4 h-4 text-accent shrink-0 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
              <div className="px-3 pb-3 flex flex-col gap-3">
                {/* The package's features playing out live, like the demo slides */}
                <TierShowcase tier={t.id} />
                <div className="animate-fade-in delay-100">
                  <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
                  <p className="text-xs text-muted-foreground">{t.target}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {t.features.map((f, i) => (
                    <li
                      key={f.title}
                      className="flex gap-2 animate-slide-up"
                      style={{ animationDelay: `${200 + i * 80}ms`, animationFillMode: 'backwards' }}
                    >
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span className="text-xs">
                        <span className="font-semibold text-foreground">{f.title}</span>
                        <span className="text-muted-foreground"> · {f.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="w-full h-11 rounded-xl animate-slide-up"
                  style={{ animationDelay: `${200 + t.features.length * 80}ms`, animationFillMode: 'backwards' }}
                >
                  <a href={enquiryMailto(t.id)} onClick={() => haptics.light()}>
                    <Mail className="w-4 h-4 mr-2" />
                    {tr("Contact sales about {0}", [t.name])}
                  </a>
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
