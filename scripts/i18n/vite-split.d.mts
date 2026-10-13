import type { Plugin } from 'vite';

/** Options for the i18n chunk-split plugin (see vite-split.mjs). */
export interface I18nSplitOptions {
  srcDir: string;
  localesDir: string;
  /** English keys matching this are left out of every chunk (the store build). */
  drop?: RegExp | null;
  /** Files whose strings are left out (the store build). */
  skip?: string[];
}

export function i18nSplit(options: I18nSplitOptions): Plugin;
