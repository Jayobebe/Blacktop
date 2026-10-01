import { Fragment } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/features/settings';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { CARE_QUESTIONS, isCareOn, carePatch, requestMotionPermission, type CareQuestion } from '../lib/questions';
import { useExperience } from '../hooks/useExperience';
import { tr } from '@/lib/i18n';
import { requestAutoRescueConsent } from '@/features/rescue';
import { leaveBoards } from '@/features/track/lib/trackRecords';
import { demoBlocked } from '@/lib/demoGuard';

/** Settings view of the "Do you care about…" answers, as switches. */
export function CareList({ className }: { className?: string }) {
  const { settings, updateSettings } = useSettings();
  const { care } = useExperience();

  const toggle = async (q: CareQuestion, on: boolean) => {
    if (on && q.needsMotion && !(await requestMotionPermission())) {
      toast.error(tr("Motion sensor permission denied"));
      return;
    }
    if (on && q.features.includes('autoRescueEnabled') && !(await requestAutoRescueConsent())) return;
    haptics.tick();
    updateSettings(carePatch(q, on, care));
  };

  const toggleBoards = async (on: boolean) => {
    if (demoBlocked()) return;
    haptics.tick();
    updateSettings({ trackLeaderboardsEnabled: on });
    if (!on) {
      await leaveBoards().catch(() => {});
      toast(tr("Your times are off the leaderboards"));
    }
  };

  return (
    <div className={cn('divide-y divide-border/30', className)}>
      {CARE_QUESTIONS.filter((q) => !q.applies || q.applies(care)).map((q) => {
        const on = isCareOn(q, settings, care);
        const Icon = q.icon;
        return (
          <Fragment key={q.id}>
            <label className="flex items-center gap-3 py-3 cursor-pointer">
              <div className={cn('rounded-lg p-2 shrink-0 transition-colors', on ? 'bg-accent/15 text-accent' : 'bg-secondary text-muted-foreground')}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{q.label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{on ? q.gets(care).join(' · ') : q.hides(care)}</p>
              </div>
              <Switch checked={on} onCheckedChange={(v) => toggle(q, v)} />
            </label>
            {q.id === 'track' && on && (
              // Track Day leaderboards: opt-in, under Track Day.
              <label className="flex items-center gap-3 py-3 pl-11 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{tr("Track leaderboards")}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {tr("Your best lap on library circuits goes on public leaderboards with your name and vehicle. Beat someone's time to take their dog tag. Turning this off removes your times.")}
                  </p>
                </div>
                <Switch checked={!!settings.trackLeaderboardsEnabled} onCheckedChange={(v) => void toggleBoards(v)} />
              </label>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
