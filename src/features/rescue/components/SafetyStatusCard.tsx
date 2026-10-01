import { RescueDrillButton } from './RescueDrill';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ShieldOff, ShieldAlert, ChevronRight, MapPin, Users, MessageSquare, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/features/settings';
import { useDiscordIntegration } from '@/features/integrations/discord';
import { requestMotionPermission, useExperience } from '@/features/experience';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useSafetyStatus, type SafetyLevel } from '../hooks/useSafetyStatus';
import { tr } from '@/lib/i18n';
import { requestAutoRescueConsent } from '../lib/rescueConsent';

const LEVELS: Record<SafetyLevel, { icon: typeof ShieldCheck; title: string; hint: string; tone: string; bg: string }> = {
  active: {
    icon: ShieldCheck,
    title: tr("Crash Rescue Active"),
    hint: tr("Your group gets pinged if you crash"),
    tone: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  off: {
    icon: ShieldOff,
    title: tr("Crash Rescue Off"),
    hint: tr("Tap to turn on crash detection"),
    tone: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  permissions: {
    icon: ShieldAlert,
    title: tr("Permissions missing"),
    hint: tr("Rescue needs location access to work"),
    tone: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/30',
  },
};

/** Home-screen strip showing whether crash rescue would work right now. Tap opens the quick safety panel. */
/** `compact`: fits beside the name in the Home header (shorter title, tighter padding). */
const COMPACT_TITLES: Record<SafetyLevel, string> = {
  active: tr("Rescue on"),
  off: tr("Rescue off"),
  permissions: tr("Rescue paused"),
};
const COMPACT_HINTS: Record<SafetyLevel, string> = {
  active: tr("Tap for details"),
  off: tr("Tap to turn on"),
  permissions: tr("Needs location"),
};

export function SafetyStatusCard({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const status = useSafetyStatus();
  const { showGroup } = useExperience();
  const { icon: Icon, title, tone, bg } = LEVELS[status.level];
  const hint =
    status.level === 'active'
      ? showGroup
        ? tr("Alerts your whole convoy, or Discord on solo rides")
        : tr("Alerts your Discord server if you crash")
      : LEVELS[status.level].hint;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptics.tick();
          setOpen(true);
        }}
        className={cn(
          'pressable w-full flex items-center text-left touch-target border',
          compact ? 'gap-2 pl-2.5 pr-3 h-12 rounded-2xl' : 'gap-3 px-3 py-2 rounded-2xl',
          bg,
          className
        )}
      >
        <Icon className={cn('shrink-0', compact ? 'w-[18px] h-[18px]' : 'w-5 h-5', tone)} />
        <div className="flex-1 min-w-0">
          <p className={cn('font-semibold leading-tight truncate', compact ? 'text-[13px]' : 'text-sm', tone)}>
            {compact ? COMPACT_TITLES[status.level] : title}
          </p>
          <p className={cn('text-muted-foreground truncate', compact ? 'text-[11px]' : 'text-[11px] landscape:hidden')}>
            {compact ? COMPACT_HINTS[status.level] : hint}
          </p>
        </div>
        {!compact && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] overflow-auto safe-bottom">
          {open && <SafetyPanel status={status} onClose={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SafetyPanel({ status, onClose }: { status: ReturnType<typeof useSafetyStatus>; onClose: () => void }) {
  const navigate = useNavigate();
  const { settings, updateSetting } = useSettings();
  const { integration, loading: discordLoading } = useDiscordIntegration();
  const { showGroup, terms } = useExperience();
  const { icon: Icon, title, tone } = LEVELS[status.level];

  const toggleRescue = async (on: boolean) => {
    if (on && !(await requestMotionPermission())) {
      toast.error(tr("Motion sensor permission denied"));
      return;
    }
    if (on && !(await requestAutoRescueConsent())) return;
    updateSetting('autoRescueEnabled', on);
  };

  const goToSettings = () => {
    onClose();
    navigate('/settings');
  };

  return (
    <div className="space-y-4">
      <SheetHeader className="text-left">
        <SheetTitle className={cn('flex items-center gap-2', tone)}>
          <Icon className="w-5 h-5" />
          {title}
        </SheetTitle>
        <SheetDescription>
          {tr("If a hard impact is followed by a stop, Blacktop asks \"Are you okay?\". No reply in 5 minutes sends a rescue ping.")}
        </SheetDescription>
      </SheetHeader>

      {/* Crash detection */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-card/50 border border-border/50">
        <div>
          <p className="text-sm font-medium">{tr("Crash detection")}</p>
          <p className="text-[11px] text-muted-foreground">
            {tr("Impact over")}{" "}{settings.autoRescueGThreshold}{" "}{tr("G, then stopped for")}{" "}{settings.autoRescueStopWindowSec}{tr("s")}
          </p>
        </div>
        <Switch checked={settings.autoRescueEnabled} onCheckedChange={toggleRescue} />
      </div>

      {/* Location */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-card/50 border border-border/50">
        <div className="flex items-center gap-3 min-w-0">
          <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{tr("Location")}</p>
            <p className="text-[11px] text-muted-foreground">
              {status.location === 'granted' && tr("Allowed. Rescue pings include your position")}
              {status.location === 'prompt' && tr("Not allowed yet")}
              {status.location === 'denied' && tr("Blocked. Turn it on in your device or browser settings")}
              {status.location === 'unknown' && tr("Checked when you start a ride")}
            </p>
          </div>
        </div>
        {status.location === 'prompt' && (
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={status.requestLocation}>
            {tr("Allow")}
          </Button>
        )}
        {status.location === 'granted' && <span className="text-xs font-medium text-emerald-400 shrink-0">{tr("On")}</span>}
        {status.location === 'denied' && <span className="text-xs font-medium text-destructive shrink-0">{tr("Blocked")}</span>}
      </div>

      {/* Who gets alerted */}
      <div className="p-3 rounded-2xl bg-card/50 border border-border/50 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{tr("Who gets alerted")}</p>
        {showGroup && (
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-sm flex-1">{tr("Everyone in the convoy")}</p>
            <span className="text-[11px] text-muted-foreground">{tr("On group {0}", [terms.rides])}</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-sm flex-1">{tr("Discord")}</p>
          {discordLoading ? (
            <Skeleton className="h-3 w-20" />
          ) : integration ? (
            <span className="text-[11px] text-emerald-400 truncate max-w-[50%]">{integration.server_name || tr("Connected")}</span>
          ) : (
            <button type="button" onClick={goToSettings} className="text-[11px] text-accent underline-offset-4 hover:underline">
              {tr("Not connected. Set up")}
            </button>
          )}
        </div>
        {!discordLoading && !integration && (
          <p className="text-[11px] text-muted-foreground">
            {showGroup
              ? tr("On solo {0}, rescue pings only go to Discord. Connect a server so someone hears about it.", [terms.rides])
              : tr("Discord is the only place rescue pings can go. Connect a server so someone hears about it.")}
          </p>
        )}
      </div>

      <RescueDrillButton onOpen={onClose} />

      <Button variant="outline" className="w-full h-11 rounded-2xl" onClick={goToSettings}>
        <Settings2 className="w-4 h-4 mr-2" />
        {tr("All safety settings")}
      </Button>
    </div>
  );
}
