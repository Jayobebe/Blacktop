import type { Plugin } from 'vite';

/** Options for the i18n chunk-split plugin (see vite-split.mjs). */
export interface I18nSplitOptions {
  srcDir: string;
  localesDir: string;
}

export function i18nSplit(options: I18nSplitOptions): Plugin;
