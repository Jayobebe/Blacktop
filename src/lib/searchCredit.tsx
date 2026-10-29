import { useSyncExternalStore } from 'react';
import { tr } from '@/lib/i18n';

/**
 * The credit owed for search answers. place-search answers from a pool (supabase/functions/
 * _shared/upstream.ts): when a keyed provider such as LocationIQ or Geoapify answered, each
 * result (or the reverse lookup) carries its `credit`, which its free terms ask to be shown.
 * The last one seen stays up for ten minutes (a list merges several answers), under the
 * lobby's results and in the map's corner credits.
 */
const KEEP_MS = 10 * 60_000;
let credit: { text: string; at: number } | null = null;
const listeners = new Set<() => void>();

/** Reads the credit off a place-search answer (a list of results, or one reverse lookup). */
export function noteSearchCredit(answer: unknown) {
  const items = Array.isArray(answer) ? answer : [answer];
  const found = items.find((r) => r && typeof (r as { credit?: unknown }).credit === 'string') as { credit: string } | undefined;
  if (!found) return;
  const changed = credit?.text !== found.credit;
  credit = { text: found.credit, at: Date.now() };
  if (changed) listeners.forEach((l) => l());
}

function current(): string | null {
  return credit && Date.now() - credit.at < KEEP_MS ? credit.text : null;
}

export function useSearchCredit(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
  );
}

/** The credit as the rider reads it. */
export function searchCreditText(c: string): string {
  if (c === 'Search by LocationIQ.com') return tr("Search by LocationIQ.com");
  if (c === 'Powered by Geoapify') return tr("Powered by Geoapify");
  return c;
}

/** Where the credit links to: both providers' free terms ask for a link back. */
export function searchCreditHref(c: string): string | null {
  if (c === 'Search by LocationIQ.com') return 'https://locationiq.com';
  if (c === 'Powered by Geoapify') return 'https://www.geoapify.com';
  return null;
}

/** The credit as a link (or plain text for a provider without one). */
export function SearchCredit({ credit, className }: { credit: string; className?: string }) {
  const href = searchCreditHref(credit);
  const text = searchCreditText(credit);
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={className}>{text}</a>
    : <span className={className}>{text}</span>;
}
