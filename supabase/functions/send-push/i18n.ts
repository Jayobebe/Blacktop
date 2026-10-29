// Notifications in each device's language (push_subscriptions.language, sent by the app
// when it registers). The translations are the app's own: `npm run i18n:check` finds every
// say("…") and words("…") in send-push, lists them with the app's strings (so they're
// translated the same way, merge.mjs and all), and writes the ones send-push uses into
// strings.ts, which this reads. A device with no language stored gets English, as before.
import { STRINGS } from './strings.ts'

/** Translates English text into one device's language, filling {0}, {1}… from `params`. */
export interface Say {
  (text: string, params?: unknown[]): string
  /** The language code ("en", "de", …). */
  lang: string
}

/** Marks text that's translated later through say(variable) (challenge titles, labels). */
export const words = (text: string) => text

export function sayIn(lang?: string | null): Say {
  const l = lang && STRINGS[lang] ? lang : 'en'
  const dict = STRINGS[l] ?? {}
  const say = ((text: string, params?: unknown[]) => {
    const s = dict[text] || text
    return params ? s.replace(/\{(\d+)\}/g, (_, i) => String(params[+i] ?? '')) : s
  }) as Say
  say.lang = l
  return say
}

export const ENGLISH = sayIn('en')

/** Sentences one after another: Japanese and Chinese put no space between them. */
export function sentences(say: Say, parts: string[]): string {
  return parts.join(say.lang === 'ja' || say.lang === 'zh' ? '' : ' ')
}

/** Short lines run together as one sentence ("Mile Muncher: you won. Bend Master: …"). */
export function lines(say: Say, parts: string[]): string {
  return parts.join(say.lang === 'ja' || say.lang === 'zh' ? '。' : '. ')
}
