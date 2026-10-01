import { supabase } from '@/integrations/supabase/client';
import type { EnterpriseRole, EnterpriseSession, EnterpriseTier, Organization } from '../types';
import { ENTERPRISE_TIERS } from '../types';
import { getEnterpriseState, unmountWorkspace } from './enterpriseStore';

type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
// Not in the generated types until they're regenerated from the new migration.
function rpc<T>(fn: string, args: Record<string, unknown>): RpcResult<T> {
  return (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => RpcResult<T> }).rpc(fn, args);
}

interface VerifyResponse {
  kind: 'guest' | 'member';
  org: { id: string; name: string; slug: string; tier: string; branding: Record<string, unknown> | null };
  session: { id: string; role: string; callsign: string | null; expires_at: string | null; token: string | null };
}

export type VerifyOutcome =
  | { ok: true; session: EnterpriseSession }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'offline' | 'signed_out' };

function toOrganization(o: VerifyResponse['org']): Organization {
  const b = o.branding ?? {};
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    tier: (ENTERPRISE_TIERS as string[]).includes(o.tier) ? (o.tier as EnterpriseTier) : 'academy',
    // Only the three display fields, whatever else the column holds.
    branding: {
      logo_url: typeof b.logo_url === 'string' ? b.logo_url : null,
      accent_color: typeof b.accent_color === 'string' ? b.accent_color : null,
      welcome_message: typeof b.welcome_message === 'string' ? b.welcome_message : null,
    },
  };
}

/**
 * Check a guest token or invite code with the server (verify_enterprise_token).
 * Sends only the code: nothing about the rider's rides, garage or profile.
 */
export async function verifyEnterpriseCode(code: string): Promise<VerifyOutcome> {
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return { ok: false, reason: 'signed_out' };
  const { data, error } = await rpc<VerifyResponse>('verify_enterprise_token', { token_code: code });
  if (error) {
    if (/rate limited/i.test(error.message)) return { ok: false, reason: 'rate_limited' };
    if (/fetch|network|failed/i.test(error.message)) return { ok: false, reason: 'offline' };
    return { ok: false, reason: 'invalid' };
  }
  if (!data || !data.org || !data.session) return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    session: {
      org: toOrganization(data.org),
      kind: data.kind === 'guest' ? 'guest' : 'member',
      role: data.session.role as EnterpriseRole,
      callsign: data.session.callsign ?? null,
      expiresAt: data.session.expires_at ?? null,
      token: data.session.token ?? null,
      mountedAt: new Date().toISOString(),
    },
  };
}

/**
 * On launch: drop member workspaces the rider has been removed from. Only
 * acts on a successful answer, so being offline never unmounts anything.
 */
export async function refreshMemberWorkspaces(): Promise<void> {
  const members = getEnterpriseState().workspaces.filter((w) => w.kind === 'member');
  if (members.length === 0) return;
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return;
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => { select: (c: string) => { in: (col: string, v: string[]) => Promise<{ data: { id: string }[] | null; error: unknown }> } };
  })
    .from('organizations')
    .select('id')
    .in('id', members.map((w) => w.org.id));
  if (error || !data) return;
  const still = new Set(data.map((r) => r.id));
  members.filter((w) => !still.has(w.org.id)).forEach((w) => unmountWorkspace(w.org.id));
}
