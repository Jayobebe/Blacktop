import { useEffect } from 'react';
import { evictExpired } from '../lib/enterpriseStore';
import { refreshMemberWorkspaces } from '../lib/enterpriseApi';

/**
 * Renders nothing. On launch: drops expired guest passes and any workspace
 * the rider has been removed from (only on a clear answer, never offline).
 */
export function EnterpriseSync() {
  useEffect(() => {
    evictExpired();
    const t = setTimeout(() => void refreshMemberWorkspaces().catch(() => {}), 4000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
