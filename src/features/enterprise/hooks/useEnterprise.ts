import { useMemo, useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';
import { useDemoMode } from '@/lib/demoMode';
import type { EnterpriseSession } from '../types';
import {
  getEnterpriseState,
  subscribeEnterprise,
  mountWorkspace,
  unmountWorkspace,
  switchWorkspace,
  focusWorkspace,
  type EnterpriseState,
} from '../lib/enterpriseStore';

export const DEMO_WORKSPACE_ID = 'demo-org-mecha-nick';

/**
 * Demo mode's sample workspace: the demo rider's V4 booked into a Workshop,
 * as a customer with a live guest pass. Built fresh (a rolling expiry) and
 * never written to the store.
 */
function demoWorkspace(): EnterpriseSession {
  return {
    org: {
      id: DEMO_WORKSPACE_ID,
      name: "Mecha-Nick's Garage",
      slug: 'mecha-nicks-garage',
      tier: 'workshop',
      branding: { welcome_message: tr("Your V4 is in bay 2. We'll let you know the moment she's ready.") },
    },
    kind: 'guest',
    role: 'customer',
    callsign: 'V4 Ducati',
    expiresAt: new Date(Date.now() + 5 * 3600_000 + 40 * 60_000).toISOString(),
    token: null,
    mountedAt: new Date().toISOString(),
    demo: true,
  };
}

/** The mounted enterprise workspaces and the active one (lib/enterpriseStore). */
export function useEnterprise(): EnterpriseState & {
  activeWorkspace: EnterpriseState['workspaces'][number] | null;
  mountWorkspace: typeof mountWorkspace;
  unmountWorkspace: typeof unmountWorkspace;
  switchWorkspace: typeof switchWorkspace;
  focusWorkspace: typeof focusWorkspace;
} {
  const state = useSyncExternalStore(subscribeEnterprise, getEnterpriseState);
  const demo = useDemoMode().enabled;
  const workspaces = useMemo(() => (demo ? [demoWorkspace(), ...state.workspaces] : state.workspaces), [demo, state.workspaces]);
  return {
    ...state,
    workspaces,
    activeWorkspace: workspaces.find((w) => w.org.id === state.activeWorkspaceId) ?? null,
    mountWorkspace,
    unmountWorkspace,
    switchWorkspace,
    focusWorkspace,
  };
}
