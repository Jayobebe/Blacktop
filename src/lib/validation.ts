import { tr } from '@/lib/i18n';

/**
 * Text checks for user input, with the same `safeParse` result shape as zod
 * (which this replaced: ~150 kB in the first load for three string lengths).
 */
/** One flat shape (the project isn't strict, so a union wouldn't narrow on `success`). */
interface Parsed {
  success: boolean;
  data: string;
  error: { issues: { message: string }[] };
}

function textRule(min: number, max: number, tooShort: () => string, tooLong: () => string) {
  return {
    safeParse(value: unknown): Parsed {
      const text = typeof value === 'string' ? value.trim() : '';
      const fail = (message: string): Parsed => ({ success: false, data: text, error: { issues: [{ message }] } });
      if (text.length < min) return fail(tooShort());
      if (text.length > max) return fail(tooLong());
      return { success: true, data: text, error: { issues: [] } };
    },
  };
}

export const displayNameSchema = textRule(1, 50, () => tr("Name required"), () => tr("Name must be 50 characters or fewer"));

export const convoyNameSchema = textRule(1, 100, () => tr("Convoy name required"), () => tr("Convoy name must be 100 characters or fewer"));

export const chatMessageSchema = textRule(1, 500, () => tr("Message cannot be empty"), () => tr("Message must be 500 characters or fewer"));
