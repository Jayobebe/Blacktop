import { useSyncExternalStore } from 'react';
import {
  getEnterpriseState,
  subscribeEnterprise,
  mountWorkspace,
  unmountWorkspace,
  switchWorkspace,
  focusWorkspace,
  type EnterpriseState,
} from '../lib/enterpriseStore';

/** The mounted enterprise workspaces and the active one (lib/enterpriseStore). */
export function useEnterprise(): EnterpriseState & {
  activeWorkspace: EnterpriseState['workspaces'][number] | null;
  mountWorkspace: typeof mountWorkspace;
  unmountWorkspace: typeof unmountWorkspace;
  switchWorkspace: typeof switchWorkspace;
  focusWorkspace: typeof focusWorkspace;
} {
  const state = useSyncExternalStore(subscribeEnterprise, getEnterpriseState);
  return {
    ...state,
    activeWorkspace: state.workspaces.find((w) => w.org.id === state.activeWorkspaceId) ?? null,
    mountWorkspace,
    unmountWorkspace,
    switchWorkspace,
    focusWorkspace,
  };
}
