/**
 * The alarm's unlock pattern: dots 0–8 of the 3×3 grid in the order they were
 * joined. Only a hash is kept (on this device, under a blacktop_ key so Burn
 * sweeps it).
 */
const KEY = 'blacktop_alarm_pattern';
export const MIN_PATTERN_DOTS = 4;

async function digest(pattern: number[]): Promise<string> {
  const text = `blacktop-alarm:${pattern.join('-')}`;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // No SubtleCrypto (insecure context): FNV-1a, still not the pattern itself.
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `fnv-${h.toString(16)}`;
  }
}

export function hasAlarmPattern(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export async function saveAlarmPattern(pattern: number[]): Promise<void> {
  const hash = await digest(pattern);
  try {
    localStorage.setItem(KEY, hash);
  } catch {
    /* storage full or blocked: the next arm asks again */
  }
}

export async function checkAlarmPattern(pattern: number[]): Promise<boolean> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    return false;
  }
  return !!stored && stored === (await digest(pattern));
}

export function clearAlarmPattern() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
