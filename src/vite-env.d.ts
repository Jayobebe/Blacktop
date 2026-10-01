/// <reference types="vite/client" />

/** Language dictionaries in two parts (scripts/i18n/vite-split.mjs). */
declare module 'virtual:i18n-dicts' {
  type Dict = () => Promise<{ default: Record<string, string> }>;
  export const parts: Record<string, { main: Dict; extra: Dict }>;
}
