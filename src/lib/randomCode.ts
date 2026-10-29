/** Letters and digits that can't be mistaken for each other (no 0/O, 1/I/L). */
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A code people can read out and type: convoy join codes (6) and crew codes (8). From the
 * browser's cryptographic generator: Math.random's output can be worked out from a few of its
 * own values, and these codes are what stands between a stranger and a crew or a convoy.
 */
export function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // 256 is a multiple of 32, so every character is equally likely.
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
}
