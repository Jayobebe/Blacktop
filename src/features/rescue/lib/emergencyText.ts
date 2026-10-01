import { tr } from '@/lib/i18n';

/** Digits and a leading +, as an sms: link wants them. */
export function cleanPhone(raw: string): string {
  const t = raw.trim();
  const digits = t.replace(/[^\d]/g, '');
  return digits.length >= 5 ? (t.startsWith('+') ? '+' : '') + digits : '';
}

/**
 * The text: who, where (a maps link anyone's phone opens), and the three
 * words when Blacktop has what3words.
 */
export function emergencyMessage(name: string, at: { lat: number; lng: number } | null, words: string | null): string {
  const who = name.trim() || tr("A Blacktop rider");
  if (!at) return tr("Blacktop: {0} may have crashed and needs help. No location yet.", [who]);
  const link = `https://maps.google.com/?q=${at.lat.toFixed(5)},${at.lng.toFixed(5)}`;
  const base = tr("Blacktop: {0} may have crashed and needs help. Location: {1}", [who, link]);
  return words ? `${base}\n${tr("what3words: ///{0}", [words])}` : base;
}

/** `sms:` link the phone's own messages app opens (`?&body=` works on iOS and Android). */
export function emergencySmsHref(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

/** A toast action that opens the text (no what3words: it's needed straight away), or undefined without a contact. */
export function emergencyTextAction(
  settings: { emergencyContactName?: string; emergencyContactPhone?: string },
  riderName: string,
  at: { lat: number; lng: number } | null,
): { label: string; onClick: () => void } | undefined {
  const phone = cleanPhone(settings.emergencyContactPhone ?? '');
  if (!phone) return undefined;
  const contact = settings.emergencyContactName?.trim();
  const href = emergencySmsHref(phone, emergencyMessage(riderName, at, null));
  return {
    label: contact ? tr("Text {0}", [contact]) : tr("Text emergency contact"),
    onClick: () => {
      window.location.href = href;
    },
  };
}
