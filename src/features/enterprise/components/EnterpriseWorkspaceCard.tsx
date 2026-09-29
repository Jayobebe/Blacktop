import { useEffect, useState } from 'react';
import { Building2, Clock, LogOut, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { unmountWorkspace } from '../lib/enterpriseStore';
import { roleName, tierInfo, tierName } from '../lib/tiers';
import type { EnterpriseSession } from '../types';

/** Organisation colours are shown only if they're plain hex. */
function safeHex(c: string | null | undefined): string | null {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : null;
}

function timeLeft(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return tr("Ended");
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return tr("{0} min left", [mins]);
  const hours = Math.floor(mins / 60);
  if (hours < 48) return tr("{0} h {1} min left", [hours, mins % 60]);
  return tr("{0} days left", [Math.floor(hours / 24)]);
}

/** A mounted enterprise workspace: who it is, your role there, and the way out. */
export function EnterpriseWorkspaceCard({ session, className }: { session: EnterpriseSession; className?: string }) {
  const { org } = session;
  const accent = safeHex(org.branding.accent_color);
  const guest = session.kind === 'guest';
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!guest || !session.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [guest, session.expiresAt]);

  return (
    <div className={cn('h-full overflow-y-auto overscroll-contain flex flex-col gap-3 [&>*]:shrink-0', className)}>
      <div
        className="bg-card/50 rounded-3xl border-2 border-accent p-4 flex flex-col gap-4"
        style={accent ? { borderColor: accent } : undefined}
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0 overflow-hidden">
            {org.branding.logo_url ? (
              <img src={org.branding.logo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Building2 className="w-6 h-6 text-accent" style={accent ? { color: accent } : undefined} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground truncate">{org.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-widest rounded-full px-2 py-0.5 bg-accent/15 text-accent">
                {tierName(org.tier)}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">{tierInfo(org.tier).tagline}</span>
            </div>
          </div>
        </div>

        {org.branding.welcome_message && <p className="text-sm text-foreground/90">{org.branding.welcome_message}</p>}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-background/40 border border-border/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{tr("Role")}</p>
            <p className="text-sm font-semibold text-foreground">{roleName(session.role)}</p>
          </div>
          <div className="rounded-2xl bg-background/40 border border-border/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{tr("Callsign")}</p>
            <p className="text-sm font-semibold text-foreground font-mono truncate">{session.callsign || '—'}</p>
          </div>
        </div>

        {guest && session.expiresAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-4 h-4 text-accent" />
            <span className="font-mono">{timeLeft(session.expiresAt, now)}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {tr("This workspace is ready. Your organisation's tools will appear here.")}
        </p>

        {session.demo ? (
          <p className="text-[10px] text-center text-muted-foreground">{tr("Demo workspace: turn demo mode off in Settings to hide it.")}</p>
        ) : (
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl"
            onClick={() => {
              haptics.light();
              setConfirm(true);
            }}
          >
            {guest ? <LogOut className="w-4 h-4 mr-2" /> : <Unplug className="w-4 h-4 mr-2" />}
            {guest ? tr("Sign out") : tr("Disconnect")}
          </Button>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="frost-accent">
          <AlertDialogHeader>
            <AlertDialogTitle>{guest ? tr("Sign out of {0}?", [org.name]) : tr("Disconnect {0}?", [org.name])}</AlertDialogTitle>
            <AlertDialogDescription>
              {guest
                ? tr("You'll need a new code from them to get back in.")
                : tr("It's removed from this phone. You stay a member and can reconnect with a code.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                haptics.medium();
                unmountWorkspace(org.id);
              }}
            >
              {guest ? tr("Sign out") : tr("Disconnect")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
