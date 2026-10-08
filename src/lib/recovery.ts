import { createClient, type Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';

/**
 * Recovery codes: an anonymous account has nothing to sign in with, so a lost
 * phone lost the account (Card Wars, crew scores, track records). A rider can
 * make a code, write it down, and enter it on another phone to be that
 * account again. What's on the phone (rides, garage…) is `lib/backup.ts`.
 *
 * The code never leaves the phone as a code. Two things are worked out from
 * it: a made-up address (a hash of the code) and a password (the code), which
 * the `account-recovery` Edge Function puts on the rider's account; entering
 * the code elsewhere is an ordinary password sign-in with them. The function
 * has the other half of this arithmetic: keep the two in step.
 *
 * Setting a password signs the account out everywhere, this phone included,
 * so the new code is kept on the phone (`blacktop_recovery_pending`, never in
 * a backup) from before the request until the rider says they've saved it:
 * the phone signs straight back in with it, and if the app is closed in
 * between, `resumePendingRecovery()` does so on the next start.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 20;
const PENDING_KEY = 'blacktop_recovery_pending';
const EMAIL = /^r-[0-9a-f]{40}@recovery\.blacktoplive\.com$/;
/** Left behind when the phone becomes another account: copies of what the old one's server said. */
const ACCOUNT_KEYS = ['bt.card_wars.v1', 'blacktop_enterprise_workspaces', 'blacktop_profile_country'];

/** As typed or pasted: any case, with or without the dashes. */
export const normalizeCode = (text: string) => text.toUpperCase().replace(/[^0-9A-Z]/g, '');
export const isCodeShaped = (text: string) => {
  const code = normalizeCode(text);
  return code.length === LENGTH && [...code].every((c) => ALPHABET.includes(c));
};
/** In fives, as it's shown and written down. */
export const formatCode = (code: string) => normalizeCode(code).replace(/(.{5})(?=.)/g, '$1-');

function newCode(): string {
  let code = '';
  while (code.length < LENGTH) {
    const [n] = crypto.getRandomValues(new Uint8Array(1));
    // 240 is eight times thirty: every letter is as likely as the next.
    if (n < 240) code += ALPHABET[n % 30];
  }
  return code;
}

async function credentials(text: string): Promise<{ email: string; password: string }> {
  const code = normalizeCode(text);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`blacktop-recovery:${code}`));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { email: `r-${hex.slice(0, 40)}@recovery.blacktoplive.com`, password: `bT1!${code}` };
}

const readPending = (): string | null => {
  try {
    const code = localStorage.getItem(PENDING_KEY);
    return code && isCodeShaped(code) ? code : null;
  } catch {
    return null;
  }
};
const dropPending = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to drop.
  }
};

/**
 * A code made but not yet marked as saved by the rider, shown again until it
 * is. Only once this phone is signed in with it: that's the proof the server
 * took it, and a code that was never set must never be written down.
 */
export async function pendingRecoveryCode(): Promise<string | null> {
  const code = readPending();
  if (!code) return null;
  const [creds, { data }] = await Promise.all([credentials(code), supabase.auth.getSession()]);
  return data.session?.user.email === creds.email ? formatCode(code) : null;
}
export const recoveryCodeSaved = dropPending;

let available: Promise<boolean> | null = null;
/** Is the function deployed? Asked once a launch; a failed answer is asked again next time. */
export function recoveryAvailable(): Promise<boolean> {
  available ??= supabase.functions
    .invoke('account-recovery', { body: { action: 'status' } })
    .then(({ data, error }) => !error && data?.ok === true)
    .catch(() => false)
    .then((ok) => {
      if (!ok) available = null;
      return ok;
    });
  return available;
}

/** Does this phone's account have a code already? */
export async function hasRecoveryCode(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return EMAIL.test(data.session?.user.email ?? '');
}

const wrongCode = (error: { status?: number; message?: string } | null) => !!error && (error.status === 400 || /invalid login credentials/i.test(error.message ?? ''));

/**
 * Makes a code for this phone's account (replacing any earlier one) and signs
 * back in with it. Answers the code, formatted, or why not.
 */
export async function createRecoveryCode(): Promise<{ code: string } | { error: 'unavailable' | 'failed' }> {
  if (demoBlocked()) return { error: 'failed' };
  const code = newCode();
  const creds = await credentials(code);
  localStorage.setItem(PENDING_KEY, code);
  let status: number | undefined;
  try {
    const { data, error } = await supabase.functions.invoke('account-recovery', { body: { action: 'create', ...creds } });
    if (!error && data?.ok) status = 200;
    else status = (error as { context?: { status?: number } } | null)?.context?.status ?? 0;
  } catch {
    status = 0;
  }
  if (status !== 200) {
    // A clear no (unavailable, too many, refused) changed nothing. No answer at all might have: the code is kept for the next start to try.
    if (status && status !== 500) dropPending();
    return { error: status === 503 ? 'unavailable' : 'failed' };
  }
  const { error } = await supabase.auth.signInWithPassword(creds);
  if (error) {
    // Set, but not yet proven from here: the code stays on the phone and is shown once a start has signed in with it.
    console.warn('[Recovery] Could not sign back in yet; will try again at the next start', error.message);
    return { error: 'failed' };
  }
  return { code: formatCode(code) };
}

/**
 * At launch: a code made just before the app closed (or before the answer
 * came back) may have signed this phone out. Sign back in with it; if the
 * server doesn't know it, it was never set, and it's forgotten.
 */
export async function resumePendingRecovery(): Promise<void> {
  const code = readPending();
  if (!code) return;
  try {
    const creds = await credentials(code);
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.email === creds.email) return;
    const { error } = await supabase.auth.signInWithPassword(creds);
    if (wrongCode(error)) dropPending();
  } catch {
    // Offline: next start.
  }
}

/**
 * Checks a typed code without touching this phone's own sign-in. `same` when
 * it's the account already here.
 */
export async function checkRecoveryCode(text: string): Promise<{ session: Session; same: boolean } | { error: 'wrong' | 'offline' }> {
  if (demoBlocked()) return { error: 'wrong' };
  if (!isCodeShaped(text)) return { error: 'wrong' };
  try {
    const creds = await credentials(text);
    const visitor = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'bt-recovery-check' },
    });
    const { data, error } = await visitor.auth.signInWithPassword(creds);
    if (error || !data.session) return { error: wrongCode(error) ? 'wrong' : 'offline' };
    const mine = await supabase.auth.getSession();
    return { session: data.session, same: mine.data.session?.user.id === data.session.user.id };
  } catch {
    return { error: 'offline' };
  }
}

/**
 * Makes this phone the recovered account: it takes the recovered sign-in and
 * forgets what it had copied from the account it had. That account (if it
 * isn't the same one) is then burned on the server, so no half-used account
 * with the rider's name is left behind. The caller reloads.
 *
 * The order is the safety: the phone is on the recovered account before
 * anything is deleted, and the burn is sent by hand with the old account's
 * own token spelled out, so it can only ever delete the account that token
 * belongs to, never the one just recovered.
 */
export async function switchToRecovered(session: Session): Promise<boolean> {
  if (demoBlocked()) return false;
  const mine = await supabase.auth.getSession();
  const old = mine.data.session;
  const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) return false;
  dropPending();
  // Entering your own code on your own phone changes nothing.
  if (old?.user.id === session.user.id) return true;
  for (const key of ACCOUNT_KEYS) localStorage.removeItem(key);
  if (old) {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/burn-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${old.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) console.warn('[Recovery] The account this phone had was not removed', res.status);
    } catch (e) {
      console.warn('[Recovery] The account this phone had was not removed', e);
    }
  }
  return true;
}
