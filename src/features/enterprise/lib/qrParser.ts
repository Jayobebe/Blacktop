import { ENTERPRISE_ROLES, type EnterpriseRole, type GuestSessionPayload } from '../types';

/**
 * Reads an enterprise code from a QR scan, a deep link or what the rider typed:
 *
 * - `bt://enterprise?org=<slug>&token=<token>&role=<role>`
 * - `https://…/enterprise?org=…&token=…` (the same, as a web link)
 * - JSON: `{ "type": "blacktop-enterprise", "org": …, "token": …, "role": … }`
 * - a bare token or invite code (letters, digits, dashes)
 *
 * Returns null for anything else (e.g. a convoy or payment QR). Only the token
 * matters: org and role are hints, the server decides both.
 */
const TOKEN = /^[A-Za-z0-9_-]{6,200}$/;

function clean(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const t = token.trim();
  return TOKEN.test(t) ? t : null;
}

function role(value: unknown): EnterpriseRole | null {
  return typeof value === 'string' && (ENTERPRISE_ROLES as string[]).includes(value) ? (value as EnterpriseRole) : null;
}

function org(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(value.trim()) ? value.trim() : null;
}

export function parseEnterpriseCode(raw: string): GuestSessionPayload | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      if (j.type !== undefined && j.type !== 'blacktop-enterprise') return null;
      const token = clean(j.token ?? j.code);
      return token ? { token, org: org(j.org), role: role(j.role) } : null;
    } catch {
      return null;
    }
  }

  if (/^(bt|blacktop|https?):/i.test(text)) {
    try {
      const url = new URL(text);
      const isEnterprise =
        url.protocol === 'bt:' || url.protocol === 'blacktop:'
          ? url.hostname === 'enterprise' || url.pathname.replace(/^\/+/, '').startsWith('enterprise')
          : /\/enterprise\/?$/.test(url.pathname);
      if (!isEnterprise) return null;
      const token = clean(url.searchParams.get('token') ?? url.searchParams.get('code'));
      return token ? { token, org: org(url.searchParams.get('org')), role: role(url.searchParams.get('role')) } : null;
    } catch {
      return null;
    }
  }

  const token = clean(text.replace(/\s+/g, ''));
  return token ? { token, org: null, role: null } : null;
}
