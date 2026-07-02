import { createRoot } from "react-dom/client";
import { PostHogProvider } from "posthog-js/react";
import App from "./App.tsx";
import "./index.css";
import { setupPWA } from "./pwa";
import { POSTHOG_HOST, POSTHOG_KEY } from "./integrations/posthog/config";

const root = POSTHOG_KEY ? (
  <PostHogProvider
    apiKey={POSTHOG_KEY}
    options={{
      api_host: POSTHOG_HOST,
      capture_exceptions: true,
      capture_pageview: true,
    }}
  >
    <App />
  </PostHogProvider>
) : (
  <App />
);

createRoot(document.getElementById("root")!).render(root);

setupPWA();
