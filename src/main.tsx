import { createRoot } from "react-dom/client";
import "./index.css";
import { setupPWA } from "./pwa";
import { initI18n } from "./lib/i18n";
import { carryOverRenamedKeys } from "./lib/renamedKeys";

// Names changed after phones saved them (lib/renamedKeys): carried over before any store reads storage.
carryOverRenamedKeys();

// The language's dictionary loads before the app is imported, so text in
// module-level data (not just components) comes out translated.
void (async () => {
  await initI18n();
  const { default: App } = await import("./App.tsx");
  createRoot(document.getElementById("root")!).render(<App />);
})();

setupPWA();
