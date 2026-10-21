/**
 * Medical ID: what someone helping after a crash needs to know (blood type,
 * allergies, medication, conditions, organ donor, a note, next of kin). Kept on
 * this phone only (`blacktop_medical_id`), like the emergency contact: left out
 * of backups unless the rider includes it (`inBackup`, read by lib/backup), and
 * Burn sweeps it. With `shareWithRescue` on, a rescue call over the convoy's
 * live channel carries it to the riders answering, and nothing stores it on a
 * server (crew, Discord and nearby calls go through the server, so never carry it).
 */
import { useSyncExternalStore } from 'react';

export const MEDICAL_ID_KEY = 'blacktop_medical_id';

/** What goes out with a rescue call, and what the card shows. */
export interface MedicalFacts {
  bloodType?: string;
  allergies?: string;
  medication?: string;
  conditions?: string;
  donor?: 'yes' | 'no';
  note?: string;
  kinName?: string;
  kinRelation?: string;
  kinPhone?: string;
}
export interface MedicalId extends MedicalFacts {
  shareWithRescue?: boolean;
  inBackup?: boolean;
}

const FIELDS: Array<keyof MedicalFacts> = ['bloodType', 'allergies', 'medication', 'conditions', 'donor', 'note', 'kinName', 'kinRelation', 'kinPhone'];
const LIMIT = 200;

function clean(v: Partial<MedicalId>): MedicalId {
  const out: MedicalId = {};
  for (const k of FIELDS) {
    const x = v[k];
    if (k === 'donor') {
      if (x === 'yes' || x === 'no') out.donor = x;
    } else if (typeof x === 'string' && x.trim()) out[k] = x.slice(0, LIMIT) as never;
  }
  if (v.shareWithRescue) out.shareWithRescue = true;
  if (v.inBackup) out.inBackup = true;
  return out;
}

function read(): MedicalId {
  try {
    return clean(JSON.parse(localStorage.getItem(MEDICAL_ID_KEY) || '{}'));
  } catch {
    return {};
  }
}

let state: MedicalId = typeof window !== 'undefined' ? read() : {};
const listeners = new Set<() => void>();

export function setMedicalId(patch: Partial<MedicalId>) {
  const merged = { ...state, ...patch };
  // Keep what's being typed (spaces included) in memory; save it cleaned.
  state = merged;
  try {
    const c = clean(merged);
    if (Object.keys(c).length) localStorage.setItem(MEDICAL_ID_KEY, JSON.stringify(c));
    else localStorage.removeItem(MEDICAL_ID_KEY);
  } catch {
    /* this launch only */
  }
  listeners.forEach((l) => l());
}

export const getMedicalId = () => state;

export function useMedicalId(): MedicalId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Anything filled in worth showing a stranger. */
export function hasMedicalFacts(m: MedicalFacts | null | undefined): boolean {
  if (!m) return false;
  return FIELDS.some((k) => (k === 'donor' ? !!m.donor : typeof m[k] === 'string' && !!(m[k] as string).trim()));
}

/** Just the facts, cleaned, for a rescue call (null when there's nothing, or the rider hasn't chosen to send it). */
export function medicalForRescue(): MedicalFacts | null {
  if (!state.shareWithRescue || !hasMedicalFacts(state)) return null;
  const { shareWithRescue: _s, inBackup: _b, ...facts } = clean(state);
  return facts;
}

/** Facts that arrived with someone else's rescue call: only the known fields, as text, trimmed. */
export function receivedMedical(raw: unknown): MedicalFacts | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = clean(raw as Partial<MedicalId>);
  const { shareWithRescue: _s, inBackup: _b, ...facts } = c;
  return hasMedicalFacts(facts) ? facts : null;
}
