// Blacktop Enterprise (phase 1): workspaces mounted from an organisation's QR
// or code, shown as extra cards in Home's deck, with the Doorway at the end.
export type {
  Organization,
  OrganizationBranding,
  EnterpriseRole,
  EnterpriseMemberRole,
  EnterpriseGuestRole,
  EnterpriseTier,
  EnterpriseSession,
  GuestSessionPayload,
  EnterpriseTierInfo,
  EnterpriseTierFeature,
} from './types';
export { ENTERPRISE_TIERS, enterpriseTiers } from './types';
export { useEnterprise } from './hooks/useEnterprise';
export {
  getEnterpriseState,
  mountWorkspace,
  unmountWorkspace,
  switchWorkspace,
  focusWorkspace,
  clearWorkspaces,
  evictExpired,
} from './lib/enterpriseStore';
export { verifyEnterpriseCode, refreshMemberWorkspaces } from './lib/enterpriseApi';
export { parseEnterpriseCode } from './lib/qrParser';
export { ENTERPRISE_CONTACT_EMAIL, enquiryMailto, tierName, tierInfo, roleName } from './lib/tiers';
export { EnterpriseDoorway } from './components/EnterpriseDoorway';
export { EnterpriseWorkspaceCard } from './components/EnterpriseWorkspaceCard';
export { EnterpriseSync } from './components/EnterpriseSync';
