import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { i18nSplit } from "./scripts/i18n/vite-split.mjs";

/** What marks text as being about crypto payments: left out of the store build's translations and page (scripts/check-store-build.mjs checks the result). */
const STORE_DROP = /nimiq|usdt|blacktank|pay up|polygonscan|\bNIM\b/i;
/** The source that is only payments (relative to src): what's only said there isn't shipped in the store build either. */
const STORE_SKIP = [/^features\/(tips|blacktank)\//, /^pages\/Pay\.tsx$/];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_SUPABASE_URL ?? "https://xwagsaqsomzrubfpjaad.supabase.co";
  const backendKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWdzYXFzb216cnViZnBqYWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTMwNzcsImV4cCI6MjA4MTQ4OTA3N30.lImkrhqcnkd9XWBlqK96HpZCu48jLyCE1nZGgFwug6c";
  const backendProjectId = env.VITE_SUPABASE_PROJECT_ID ?? "xwagsaqsomzrubfpjaad";
  // The store build (npm run cap:sync:store): the app's files go inside the iOS and Android apps, and
  // everything to do with crypto payments is left out of it (see __STORE_BUILD__ in src/vite-env.d.ts).
  const storeBuild = process.env.CAP_BUNDLED === "1";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      // Each language ships as first-load text + the rest (legal, demo tour), see the plugin.
      i18nSplit({ srcDir: path.resolve(__dirname, "./src"), localesDir: path.resolve(__dirname, "./src/lib/i18n/locales"), drop: storeBuild ? STORE_DROP : null, skip: storeBuild ? STORE_SKIP : [] }),
      // The page's own description of the app (for search engines) names the payments too: not in the store build.
      storeBuild && {
        name: "blacktop-store-html",
        transformIndexHtml: (html: string) =>
          html
            .replace(", local radio and Nimiq Pay.", " and local radio.")
            .split(", arcade games and Blacktank crew fuel fund").join(" and arcade games")
            .replace(", time attacks and Blacktank votes", " and time attacks")
            .split("\n")
            .filter((line) => !STORE_DROP.test(line))
            .join("\n"),
      },
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
      __STORE_BUILD__: JSON.stringify(storeBuild),
    },
  };
});
