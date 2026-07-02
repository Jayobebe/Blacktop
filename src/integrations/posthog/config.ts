export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
export const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com';
