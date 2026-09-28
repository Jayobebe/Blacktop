import { supabase } from '@/integrations/supabase/client';
import type { LogbookPackage } from '../types';

import { tr } from '@/lib/i18n';
/**
 * Logbook hand-over, phone to phone, over a one-off realtime channel whose
 * name is a random key carried only in the QR (nothing is stored on a
 * server). The package is chunked so a photo and a long ride history fit
 * under realtime message limits.
 *
 *   receiver → hello · sender → meta, chunk… · receiver → resend? · receiver → ack
 *
 * The sender only deletes its copy after the receiver's ack.
 */

export const LOGBOOK_QR_PREFIX = 'BTLOG1:';
export const SCAN_WINDOW_MS = 10_000;
const CHUNK_CHARS = 48_000;
const CHUNK_GAP_MS = 40;
const ACK_TIMEOUT_MS = 45_000;

type Channel = ReturnType<typeof supabase.channel>;

function topic(token: string) {
  return `logbook:${token}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseLogbookQr(raw: string): string | null {
  const t = raw.trim();
  if (!t.startsWith(LOGBOOK_QR_PREFIX)) return null;
  const token = t.slice(LOGBOOK_QR_PREFIX.length);
  return /^[a-f0-9]{32}$/.test(token) ? token : null;
}

// ── sender ───────────────────────────────────────────────────────────────────

export interface HandoverCallbacks {
  /** Someone scanned it; the transfer is under way. */
  onClaimed: (receiverName: string) => void;
  /** Receiver confirmed the logbook arrived intact. */
  onDelivered: () => void;
  /** Nobody scanned within the window. */
  onExpired: () => void;
  onFailed: (reason: string) => void;
}

export function startHandover(pkg: LogbookPackage, cb: HandoverCallbacks): { qr: string; cancel: () => void } {
  const token = crypto.randomUUID().replace(/-/g, '');
  const data = JSON.stringify(pkg);
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK_CHARS) chunks.push(data.slice(i, i + CHUNK_CHARS));

  let finished = false;
  let claimed = false;
  const ch: Channel = supabase.channel(topic(token), { config: { broadcast: { self: false, ack: true } } });

  const finish = () => {
    finished = true;
    clearTimeout(scanTimer);
    clearTimeout(ackTimer);
    void supabase.removeChannel(ch);
  };

  const sendChunks = async (indices: number[]) => {
    for (const i of indices) {
      if (finished) return;
      await ch.send({ type: 'broadcast', event: 'chunk', payload: { i, d: chunks[i] } });
      await sleep(CHUNK_GAP_MS);
    }
  };

  const scanTimer = setTimeout(() => {
    if (claimed || finished) return;
    finish();
    cb.onExpired();
  }, SCAN_WINDOW_MS);
  let ackTimer: ReturnType<typeof setTimeout> | undefined;

  ch.on('broadcast', { event: 'hello' }, async ({ payload }) => {
    if (finished || claimed) return;
    claimed = true;
    clearTimeout(scanTimer);
    cb.onClaimed(String(payload?.name || 'Rider').slice(0, 30));
    ackTimer = setTimeout(() => {
      if (finished) return;
      finish();
      cb.onFailed("The other phone didn't confirm. Nothing was deleted.");
    }, ACK_TIMEOUT_MS);
    await ch.send({
      type: 'broadcast',
      event: 'meta',
      payload: { chunks: chunks.length, vehicle: pkg.bike.name, from: pkg.fromName },
    });
    await sendChunks(chunks.map((_, i) => i));
  })
    .on('broadcast', { event: 'resend' }, async ({ payload }) => {
      if (finished || !claimed) return;
      const missing = Array.isArray(payload?.missing) ? payload.missing.filter((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < chunks.length) : [];
      await sendChunks(missing);
    })
    .on('broadcast', { event: 'ack' }, () => {
      if (finished || !claimed) return;
      finish();
      cb.onDelivered();
    })
    .subscribe((status) => {
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !finished) {
        finish();
        cb.onFailed('Could not open the hand-over channel. Check your connection.');
      }
    });

  return {
    qr: LOGBOOK_QR_PREFIX + token,
    cancel: () => {
      if (!finished) finish();
    },
  };
}

// ── receiver ─────────────────────────────────────────────────────────────────

export interface ReceiveCallbacks {
  onProgress: (fraction: number, vehicle?: string) => void;
  /** Store the logbook; return true once saved (triggers the ack). */
  onPackage: (pkg: LogbookPackage) => Promise<boolean> | boolean;
  onFailed: (reason: string) => void;
}

export function receiveLogbook(token: string, myName: string, cb: ReceiveCallbacks): () => void {
  const ch: Channel = supabase.channel(topic(token), { config: { broadcast: { self: false } } });
  let total = 0;
  const parts = new Map<number, string>();
  let done = false;
  let lastChunkAt = Date.now();
  let resendRounds = 0;
  let helloTries = 0;

  const stop = () => {
    done = true;
    clearInterval(tick);
    void supabase.removeChannel(ch);
  };

  const complete = async () => {
    if (done) return;
    done = true;
    try {
      const pkg = JSON.parse([...Array(total).keys()].map((i) => parts.get(i)).join('')) as LogbookPackage;
      if (pkg?.v !== 1 || !pkg.bike?.name || !pkg.log) throw new Error('bad package');
      const saved = await cb.onPackage(pkg);
      if (saved) {
        await ch.send({ type: 'broadcast', event: 'ack', payload: {} });
        await sleep(300);
        await ch.send({ type: 'broadcast', event: 'ack', payload: {} });
      }
    } catch (e) {
      console.warn('[Logbook] receive failed', e);
      cb.onFailed(tr("That logbook didn't come through. Ask them to try again."));
    } finally {
      clearInterval(tick);
      void supabase.removeChannel(ch);
    }
  };

  ch.on('broadcast', { event: 'meta' }, ({ payload }) => {
    if (done || total) return;
    total = Math.max(1, Math.min(5000, Number(payload?.chunks) || 0));
    lastChunkAt = Date.now();
    cb.onProgress(0, String(payload?.vehicle || ''));
  })
    .on('broadcast', { event: 'chunk' }, ({ payload }) => {
      if (done || !total) return;
      const i = Number(payload?.i);
      if (!Number.isInteger(i) || i < 0 || i >= total || typeof payload?.d !== 'string') return;
      parts.set(i, payload.d);
      lastChunkAt = Date.now();
      cb.onProgress(parts.size / total);
      if (parts.size === total) void complete();
    })
    .subscribe();

  const tick = setInterval(() => {
    if (done) return;
    if (!total) {
      // Keep knocking until the sender answers (their QR is only live ~10 s).
      if (++helloTries > 8) {
        stop();
        cb.onFailed(tr("No answer. The code may have expired, ask them to show it again."));
        return;
      }
      void ch.send({ type: 'broadcast', event: 'hello', payload: { name: myName } });
      return;
    }
    if (Date.now() - lastChunkAt > 2500 && parts.size < total) {
      if (++resendRounds > 6) {
        stop();
        cb.onFailed(tr("The transfer stalled. Nothing was deleted on their phone."));
        return;
      }
      const missing = [...Array(total).keys()].filter((i) => !parts.has(i));
      lastChunkAt = Date.now();
      void ch.send({ type: 'broadcast', event: 'resend', payload: { missing } });
    }
  }, 1200);

  return stop;
}
