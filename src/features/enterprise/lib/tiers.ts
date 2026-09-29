import { tr } from '@/lib/i18n';
import { enterpriseTiers, type EnterpriseRole, type EnterpriseTier, type EnterpriseTierInfo } from '../types';

/** Where enterprise enquiries go (the Doorway's Inquire emails). Change it here only. */
export const ENTERPRISE_CONTACT_EMAIL = 'blacktopliveenterprise@gmail.com';

/** Short badge name (translated; only the word Blacktop stays as it is). */
export function tierName(tier: EnterpriseTier): string {
  switch (tier) {
    case 'academy':
      return tr("Academy");
    case 'showroom':
      return tr("Showroom");
    case 'workshop':
      return tr("Workshop");
    case 'touring':
      return tr("Touring");
    case 'track_pro':
      return tr("Track Pack Pro");
    case 'billion':
      return tr("Billion");
  }
}

export function tierInfo(tier: EnterpriseTier): EnterpriseTierInfo {
  return enterpriseTiers().find((t) => t.id === tier)!;
}

export function roleName(role: EnterpriseRole): string {
  switch (role) {
    case 'owner':
      return tr("Owner");
    case 'admin':
      return tr("Admin");
    case 'staff':
      return tr("Staff");
    case 'instructor':
      return tr("Instructor");
    case 'driver':
      return tr("Rider");
    case 'student':
      return tr("Student");
    case 'guest_rider':
      return tr("Guest rider");
    case 'customer':
      return tr("Customer");
  }
}

/**
 * The sales enquiry email, pre-filled for the chosen package (or none), for
 * the rider to complete in their mail app.
 */
export function enquiryMailto(tier: EnterpriseTier | null): string {
  const name = tier ? tierInfo(tier).name : '';
  const subject = name ? tr("Blacktop Enterprise Inquiry: {0}", [name]) : tr("Blacktop Enterprise Inquiry");
  const body = [
    `${tr("Company Name")}:`,
    `${tr("Fleet Size / Students / Riders")}:`,
    `${tr("Primary Package")}: ${name}`,
    `${tr("Location")}:`,
    `${tr("Notes")}:`,
  ].join('\n');
  return `mailto:${ENTERPRISE_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
