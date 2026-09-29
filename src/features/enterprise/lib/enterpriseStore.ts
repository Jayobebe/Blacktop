/**
 * Enterprise workspaces mounted on this phone: module-level store saved in
 * localStorage (`blacktop_enterprise_workspaces`, swept by Burn).
 *
 * Holds only what the organisation's code returned (public org fields, the
 * rider's role and callsign there, a guest token): never the rider's own
 * rides, garage or account data.
 *
 * Guest sessions are dropped as soon as they expire (on launch, and by timer
 * while the app is open). Home's deck follows `activeWorkspaceId`; `focusTick`
 * asks it to scroll there even when the id didn't change (re-scanning a
 * workspace that's already mounted).
 */
import type { EnterpriseSession } from '../types';

const KEY = 'blacktop_enterprise_workspaces';

export interface EnterpriseState {
  workspaces: EnterpriseSession[];
  /** null = the consumer home. */
  activeWorkspaceId: string | null;
  focusTick: number;
}

function expired(s: EnterpriseSession, now = Date.now()): boolean {
  return s.kind === 'guest' && !!s.expiresAt && new Date(s.expiresAt).getTime() <= now;
}

function load(): EnterpriseState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EnterpriseState>;
      const workspaces = (Array.isArray(parsed.workspaces) ? parsed.workspaces : []).filter(
        (w) => w && w.org && typeof w.org.id === 'string' && !expired(w),
      );
      const active = workspaces.some((w) => w.org.id === parsed.activeWorkspaceId) ? parsed.activeWorkspaceId! : null;
      return { workspaces, activeWorkspaceId: active, focusTick: 0 };
    }
  } catch {
    /* start empty */
  }
  return { workspaces: [], activeWorkspaceId: null, focusTick: 0 };
}

let state: EnterpriseState = load();
const listeners = new Set<() => void>();

function save() {
  try {
    if (state.workspaces.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId }));
  } catch {
    /* kept for this session */
  }
}

function set(next: Partial<EnterpriseState>) {
  state = { ...state, ...next };
  save();
  listeners.forEach((l) => l());
  scheduleEviction();
}

export function subscribeEnterprise(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getEnterpriseState(): EnterpriseState {
  return state;
}

export function isMounted(orgId: string): boolean {
  return state.workspaces.some((w) => w.org.id === orgId);
}

/**
 * Mount a workspace, or refresh it if it's already there (same org: no
 * duplicate). Either way it becomes the active slot. Returns false when it
 * was already mounted.
 */
export function mountWorkspace(session: EnterpriseSession): boolean {
  const existing = state.workspaces.findIndex((w) => w.org.id === session.org.id);
  if (existing >= 0) {
    const workspaces = state.workspaces.slice();
    // Keep the earlier mount time; take the fresher role, callsign and expiry.
    workspaces[existing] = { ...session, mountedAt: workspaces[existing].mountedAt };
    set({ workspaces, activeWorkspaceId: session.org.id, focusTick: state.focusTick + 1 });
    return false;
  }
  set({ workspaces: [...state.workspaces, session], activeWorkspaceId: session.org.id, focusTick: state.focusTick + 1 });
  return true;
}

export function unmountWorkspace(orgId: string) {
  set({
    workspaces: state.workspaces.filter((w) => w.org.id !== orgId),
    activeWorkspaceId: state.activeWorkspaceId === orgId ? null : state.activeWorkspaceId,
  });
}

/** null switches back to the consumer home. */
export function switchWorkspace(orgId: string | null) {
  if (orgId !== null && !isMounted(orgId)) return;
  if (state.activeWorkspaceId === orgId) return;
  set({ activeWorkspaceId: orgId });
}

/** Ask Home's deck to scroll to a workspace (or home) even if it's already active. */
export function focusWorkspace(orgId: string | null) {
  set({ activeWorkspaceId: orgId !== null && isMounted(orgId) ? orgId : null, focusTick: state.focusTick + 1 });
}

/** Drop every workspace (Burn does this through the localStorage sweep too). */
export function clearWorkspaces() {
  set({ workspaces: [], activeWorkspaceId: null });
}

// ---- Guest expiry ------------------------------------------------------------

let evictTimer: ReturnType<typeof setTimeout> | null = null;

export function evictExpired() {
  const now = Date.now();
  if (!state.workspaces.some((w) => expired(w, now))) return;
  const workspaces = state.workspaces.filter((w) => !expired(w, now));
  set({
    workspaces,
    activeWorkspaceId: workspaces.some((w) => w.org.id === state.activeWorkspaceId) ? state.activeWorkspaceId : null,
  });
}

function scheduleEviction() {
  if (evictTimer) clearTimeout(evictTimer);
  evictTimer = null;
  const next = state.workspaces
    .filter((w) => w.kind === 'guest' && w.expiresAt)
    .map((w) => new Date(w.expiresAt!).getTime())
    .sort((a, b) => a - b)[0];
  if (next === undefined) return;
  // setTimeout caps at ~24.8 days; re-check at least daily.
  const wait = Math.min(Math.max(0, next - Date.now()) + 500, 24 * 3600 * 1000);
  evictTimer = setTimeout(evictExpired, wait);
}

if (typeof window !== 'undefined') {
  scheduleEviction();
  // Timers don't run while the phone sleeps: check again on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') evictExpired();
  });
}
