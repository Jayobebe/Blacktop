/// <reference types="vite/client" />

/**
 * True in the store build (`npm run cap:sync:store`, CAP_BUNDLED=1), where the app's files are bundled into
 * the iOS and Android apps. The stores don't allow crypto payments, so everything to do with them (Pay Up,
 * Blacktank, the Nimiq Pay mini app) is left out of that build altogether, not just hidden: write
 * `!__STORE_BUILD__ && …` in front of it, which the bundler folds away, and `npm run store:check` fails the
 * build if any of it is still in `dist`. False everywhere else.
 */
declare const __STORE_BUILD__: boolean;

/** Language dictionaries in two parts (scripts/i18n/vite-split.mjs). */
declare module 'virtual:i18n-dicts' {
  type Dict = () => Promise<{ default: Record<string, string> }>;
  export const parts: Record<string, { main: Dict; extra: Dict }>;
}
