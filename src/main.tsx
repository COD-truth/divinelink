import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register PWA service worker only in production and outside Lovable preview iframes.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
const host = window.location.hostname;
const isPreviewHost =
  host.includes("lovableproject.com") ||
  host.includes("lovable.app") ||
  host.includes("id-preview--") ||
  host === "localhost" ||
  host === "127.0.0.1";

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD && !isInIframe && !isPreviewHost) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  } else {
    // Defensive: clear any previously registered SW in dev/preview to avoid stale caches.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    }).catch(() => {});
  }
}
