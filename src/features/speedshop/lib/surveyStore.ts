import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';

/**
 * Speedshop survey answers. Saved on the phone straight away and sent to the
 * server (speedshop_votes); anything that couldn't be sent is retried the next
 * time the shop opens.
 */

export type Interest = 'yes' | 'maybe' | 'no';

export interface Answer {
  interest: Interest;
  price: string | null;
  at: number;
  /** Not yet stored on the server. */
  pending?: boolean;
}

export interface ItemResult {
  yes: number;
  maybe: number;
  no: number;
  topPrice: string | null;
}

const KEY = 'bt.speedshop.answers.v1';

function read(): Record<string, Answer> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

let answers: Record<string, Answer> = read();
const listeners = new Set<() => void>();

function commit(next: Record<string, Answer>) {
  answers = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* kept in memory for this session */
  }
  listeners.forEach((l) => l());
}

export function useSurveyAnswers() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => answers,
    () => answers,
  );
}

async function send(itemId: string, a: Answer): Promise<boolean> {
  if (isDemoModeActive()) return true;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('speedshop_votes' as any).upsert({
      user_id: uid,
      item_id: itemId,
      interest: a.interest,
      price_band: a.interest === 'no' ? null : a.price,
      updated_at: new Date(a.at).toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return !error;
  } catch {
    return false;
  }
}

export async function answer(itemId: string, patch: Partial<Pick<Answer, 'interest' | 'price'>>) {
  const prev = answers[itemId];
  const interest = patch.interest ?? prev?.interest;
  if (!interest) return;
  const next: Answer = {
    interest,
    price: interest === 'no' ? null : patch.price !== undefined ? patch.price : prev?.price ?? null,
    at: Date.now(),
    pending: true,
  };
  commit({ ...answers, [itemId]: next });
  if (await send(itemId, next)) {
    const current = answers[itemId];
    if (current && current.at === next.at) commit({ ...answers, [itemId]: { ...current, pending: false } });
  }
}

/** Retries answers that didn't reach the server. */
export async function flushPending() {
  for (const [id, a] of Object.entries(answers)) {
    if (!a.pending) continue;
    if (await send(id, a)) commit({ ...answers, [id]: { ...answers[id], pending: false } });
  }
}

export async function fetchResults(): Promise<Record<string, ItemResult> | null> {
  if (isDemoModeActive()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('speedshop_results');
    if (error || !Array.isArray(data)) return null;
    const out: Record<string, ItemResult> = {};
    for (const r of data) out[r.item_id] = { yes: r.yes ?? 0, maybe: r.maybe ?? 0, no: r.no ?? 0, topPrice: r.top_price ?? null };
    return out;
  } catch {
    return null;
  }
}

export async function sendSuggestion(body: string): Promise<'sent' | 'limit' | 'failed'> {
  const text = body.trim().slice(0, 500);
  if (text.length < 3) return 'failed';
  if (isDemoModeActive()) return 'sent';
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return 'failed';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('speedshop_suggestions' as any).insert({ body: text } as any);
    if (!error) return 'sent';
    return /row-level security/i.test(error.message) ? 'limit' : 'failed';
  } catch {
    return 'failed';
  }
}

export function clearSurveyAnswers() {
  commit({});
}
