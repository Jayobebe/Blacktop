import { MessageSquareText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useWhat3Words } from '@/lib/what3words';
import { cleanPhone, emergencyMessage, emergencySmsHref } from '../lib/emergencyText';

/**
 * Opens a text to the rider's emergency contact with where they are. Needs no
 * signal to our server, only the phone's own SMS, so it works where nothing
 * else in a rescue does. Shows nothing without a contact.
 */
export function EmergencyTextButton({ at, className }: { at: { lat: number; lng: number } | null; className?: string }) {
  const { settings } = useSettings();
  const { profile } = useProfile();
  const place = useWhat3Words(at?.lat, at?.lng);
  const phone = cleanPhone(settings.emergencyContactPhone ?? '');
  if (!phone) return null;
  const contact = settings.emergencyContactName?.trim();
  const href = emergencySmsHref(phone, emergencyMessage(profile.name ?? '', at, place?.words ?? null));
  return (
    <a
      href={href}
      className={cn(
        'touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-foreground/30 bg-black/40 px-4 text-sm font-semibold text-foreground',
        className,
      )}
    >
      <MessageSquareText className="w-5 h-5" />
      {contact ? tr("Text {0}", [contact]) : tr("Text emergency contact")}
    </a>
  );
}

/** Settings → Safety: who to text. Kept on this phone only. */
export function EmergencyContactSettings() {
  const { settings, updateSettings } = useSettings();
  const phone = settings.emergencyContactPhone ?? '';
  const valid = !phone.trim() || !!cleanPhone(phone);
  return (
    <div>
      <p className="text-sm font-medium">{tr("Emergency contact")}</p>
      <p className="text-[11px] text-muted-foreground mb-2">
        {tr("After a crash, the crash screen and the rescue banner can open a text to them with your location. It goes from your phone's own messages app, so it works on weak signal. The number stays on this phone.")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={settings.emergencyContactName ?? ''}
          onChange={(e) => updateSettings({ emergencyContactName: e.target.value.slice(0, 30) })}
          placeholder={tr("Name")}
          aria-label={tr("Emergency contact name")}
          autoComplete="off"
        />
        <Input
          value={phone}
          onChange={(e) => updateSettings({ emergencyContactPhone: e.target.value.slice(0, 24) })}
          placeholder={tr("Phone number")}
          aria-label={tr("Emergency contact phone number")}
          type="tel"
          inputMode="tel"
          autoComplete="off"
        />
      </div>
      {!valid && <p className="text-[11px] text-destructive mt-1">{tr("That doesn't look like a phone number.")}</p>}
    </div>
  );
}
