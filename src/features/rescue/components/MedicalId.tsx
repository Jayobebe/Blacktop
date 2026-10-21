import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HeartPulse, Phone, X, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { cleanPhone } from '../lib/emergencyText';
import { hasMedicalFacts, setMedicalId, useMedicalId, type MedicalFacts } from '../lib/medicalId';

/**
 * A rider's Medical ID, big enough to read off a phone lying in a verge: on the
 * crash screens for whoever picks it up, on the rider's own rescue screens, and
 * for the riders answering a convoy call it came with. Above everything,
 * the crash siren screen included.
 */
export function MedicalIdCard({ facts, name, open, onClose, preview }: { facts: MedicalFacts; name?: string; open: boolean; onClose: () => void; preview?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;
  const rows: Array<[string, string | undefined]> = [
    [tr("Blood type"), facts.bloodType],
    [tr("Allergies"), facts.allergies],
    [tr("Medication"), facts.medication],
    [tr("Conditions"), facts.conditions],
    [tr("Organ donor"), facts.donor === 'yes' ? tr("Yes") : facts.donor === 'no' ? tr("No") : undefined],
    [tr("Note"), facts.note],
  ];
  const phone = cleanPhone(facts.kinPhone ?? '');
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr("Medical ID")}
      data-no-pull
      data-no-ui-sound
      className="fixed inset-0 z-[10001] bg-black/90 flex items-center justify-center p-4 safe-frame animate-fade-in"
      onClick={onClose}
    >
      <div className="w-full max-w-md max-h-full overflow-y-auto rounded-3xl bg-[hsl(0_0%_7%)] border-2 border-[hsl(var(--burn))] text-left" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 bg-[hsl(var(--burn))] text-white rounded-t-[22px]">
          <HeartPulse className="w-7 h-7 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-black tracking-wide leading-none">{tr("MEDICAL ID")}</p>
            {name && <p className="text-sm font-semibold opacity-90 mt-1 truncate">{name}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Close")} className="glove-hit w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <dl className="px-5 py-4 space-y-3">
          {rows
            .filter(([, v]) => v && v.trim())
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--burn))]">{label}</dt>
                <dd className="text-lg leading-snug whitespace-pre-wrap break-words">{value}</dd>
              </div>
            ))}
          {(facts.kinName || phone) && (
            <div className="pt-3 border-t border-border/40">
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--burn))]">{tr("Next of kin")}</dt>
              <dd className="text-lg leading-snug">
                {facts.kinName}
                {facts.kinRelation && <span className="text-muted-foreground"> · {facts.kinRelation}</span>}
              </dd>
              {phone && (
                <a
                  href={`tel:${phone}`}
                  onClick={(e) => preview && e.preventDefault()}
                  className="mt-2 flex items-center justify-center gap-2 h-14 rounded-2xl bg-[hsl(var(--burn))] text-white text-base font-semibold"
                >
                  <Phone className="w-5 h-5" /> {tr("Call {0}", [facts.kinPhone || phone])}
                </a>
              )}
            </div>
          )}
        </dl>
        {preview && <p className="px-5 pb-4 text-[11px] text-muted-foreground">{tr("This is how it looks to someone helping you.")}</p>}
      </div>
    </div>,
    document.body,
  );
}

/** The burn-orange Medical ID button, shown only when there's something on it. */
export function MedicalIdButton({ facts, name, className }: { facts?: MedicalFacts | null; name?: string; className?: string }) {
  const own = useMedicalId();
  const { profile } = useProfile();
  const shown = facts ?? own;
  const [open, setOpen] = useState(false);
  if (!hasMedicalFacts(shown)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('h-12 rounded-2xl border-2 border-[hsl(var(--burn))] bg-[hsl(var(--burn))]/15 text-white font-semibold inline-flex items-center justify-center gap-2 px-4', className)}
      >
        <HeartPulse className="w-5 h-5 text-[hsl(var(--burn))]" /> {tr("Medical ID")}
      </button>
      <MedicalIdCard facts={shown} name={name ?? (facts ? undefined : profile.name)} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Settings → Safety, under the emergency contact. */
export function MedicalIdSettings() {
  const m = useMedicalId();
  const { settings } = useSettings();
  const { profile } = useProfile();
  const [preview, setPreview] = useState(false);
  const field = (key: keyof MedicalFacts, label: string, placeholder?: string) => (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</span>
      <Input value={(m[key] as string) ?? ''} onChange={(e) => setMedicalId({ [key]: e.target.value.slice(0, 200) })} placeholder={placeholder} autoComplete="off" />
    </label>
  );
  const contactName = settings.emergencyContactName?.trim();
  const contactPhone = settings.emergencyContactPhone?.trim();
  return (
    <div>
      <div className="flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-[hsl(var(--burn))]" />
        <p className="text-sm font-medium">{tr("Medical ID")}</p>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        {tr("For whoever helps you after a crash: it shows on the crash screens without unlocking anything in the app. Fill in only what you want a stranger to read. It stays on this phone.")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {field('bloodType', tr("Blood type"), tr("e.g. O+"))}
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{tr("Organ donor")}</span>
          <div className="grid grid-cols-2 gap-1 h-10">
            {(['yes', 'no'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={m.donor === v}
                onClick={() => setMedicalId({ donor: m.donor === v ? undefined : v })}
                className={cn('rounded-lg text-xs font-semibold border', m.donor === v ? 'bg-accent text-accent-foreground border-accent' : 'border-border/60 text-muted-foreground')}
              >
                {v === 'yes' ? tr("Yes") : tr("No")}
              </button>
            ))}
          </div>
        </label>
      </div>
      <div className="mt-2 space-y-2">
        {field('allergies', tr("Allergies"), tr("e.g. penicillin, nuts"))}
        {field('medication', tr("Medication"))}
        {field('conditions', tr("Conditions"), tr("e.g. diabetes, epilepsy, a pacemaker"))}
        {field('note', tr("Note"), tr("e.g. contact lenses, pins in left leg"))}
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{tr("Next of kin")}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Input value={m.kinName ?? ''} onChange={(e) => setMedicalId({ kinName: e.target.value.slice(0, 60) })} placeholder={tr("Name")} autoComplete="off" />
        <Input value={m.kinRelation ?? ''} onChange={(e) => setMedicalId({ kinRelation: e.target.value.slice(0, 40) })} placeholder={tr("e.g. partner, mum")} autoComplete="off" />
        <Input className="col-span-2" value={m.kinPhone ?? ''} onChange={(e) => setMedicalId({ kinPhone: e.target.value.slice(0, 24) })} placeholder={tr("Phone number")} type="tel" inputMode="tel" autoComplete="off" />
      </div>
      {contactName && contactPhone && (m.kinName !== contactName || m.kinPhone !== contactPhone) && (
        <button type="button" onClick={() => setMedicalId({ kinName: contactName, kinPhone: contactPhone })} className="mt-2 text-xs font-semibold text-accent">
          {tr("Use {0}, your emergency contact", [contactName])}
        </button>
      )}

      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="pr-2">
          <p className="text-sm font-medium">{tr("Send it with rescue calls")}</p>
          <p className="text-[11px] text-muted-foreground">{tr("Riders in your convoy answering your call can read it. It goes over the live link only and is never stored on Blacktop's servers.")}</p>
        </div>
        <Switch checked={!!m.shareWithRescue} onCheckedChange={(v) => setMedicalId({ shareWithRescue: v })} aria-label={tr("Send it with rescue calls")} />
      </div>
      <div className="flex items-center justify-between gap-3 mt-3">
        <div className="pr-2">
          <p className="text-sm font-medium">{tr("Include it in backups")}</p>
          <p className="text-[11px] text-muted-foreground">{tr("Off: a backup file leaves your medical details out.")}</p>
        </div>
        <Switch checked={!!m.inBackup} onCheckedChange={(v) => setMedicalId({ inBackup: v })} aria-label={tr("Include it in backups")} />
      </div>

      <Button variant="outline" size="sm" disabled={!hasMedicalFacts(m)} onClick={() => setPreview(true)} className="mt-3 w-full h-11 rounded-xl text-xs">
        <Eye className="w-4 h-4 mr-1.5" /> {tr("See it as a stranger would")}
      </Button>
      <p className="mt-2 text-[10px] text-muted-foreground/80">
        {tr("For your locked screen, fill in your phone's own medical ID too (Health on iPhone, Emergency information on Android): only the phone can show it there.")}
      </p>
      <MedicalIdCard facts={m} name={profile.name} open={preview} onClose={() => setPreview(false)} preview />
    </div>
  );
}
