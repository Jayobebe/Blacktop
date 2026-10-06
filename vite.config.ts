import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { i18nSplit } from "./scripts/i18n/vite-split.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_SUPABASE_URL ?? "https://xwagsaqsomzrubfpjaad.supabase.co";
  const backendKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWdzYXFzb216cnViZnBqYWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTMwNzcsImV4cCI6MjA4MTQ4OTA3N30.lImkrhqcnkd9XWBlqK96HpZCu48jLyCE1nZGgFwug6c";
  const backendProjectId = env.VITE_SUPABASE_PROJECT_ID ?? "xwagsaqsomzrubfpjaad";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      // Each language ships as first-load text + the rest (legal, demo tour), see the plugin.
      i18nSplit({ srcDir: path.resolve(__dirname, "./src"), localesDir: path.resolve(__dirname, "./src/lib/i18n/locales") }),
    ].filter(Boolean),
    // Module workers (MapLibre's, the pilot voice's): they load code on demand.
    worker: {
      format: "es",
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(backendUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(backendKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(backendProjectId),
      // When this copy of the app was built: an error report names it (lib/errorLog.ts).
      __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")),
    },
  };
});
