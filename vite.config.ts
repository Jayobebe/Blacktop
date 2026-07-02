import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_SUPABASE_URL ?? "https://xwagsaqsomzrubfpjaad.supabase.co";
  const backendKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWdzYXFzb216cnViZnBqYWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTMwNzcsImV4cCI6MjA4MTQ4OTA3N30.lImkrhqcnkd9XWBlqK96HpZCu48jLyCE1nZGgFwug6c";
  const backendProjectId = env.VITE_SUPABASE_PROJECT_ID ?? "xwagsaqsomzrubfpjaad";
  const posthogKey = env.VITE_POSTHOG_KEY ?? "phc_pQzk9wtckaPNtFjFLMhMMF7nUP8tCngJLRub7YLNWEyU";
  const posthogHost = env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(backendUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(backendKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(backendProjectId),
      "import.meta.env.VITE_POSTHOG_KEY": JSON.stringify(posthogKey),
      "import.meta.env.VITE_POSTHOG_HOST": JSON.stringify(posthogHost),
    },
  };
});
